import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { uploadFileObject, isConnected, connectSharedAccount, getDirectDownloadUrl } from "./onedrive.js";
import { FOTO_KATEGORIE } from "./ZakazkaSheet.jsx";
import { tryOrQueue } from "./offlineQueue.js";

// Náhled fotky z OneDrive — natáhne čerstvý přímý odkaz přes itemId, se
// spolehlivým fallbackem na uložený sdílený odkaz (starší fotky bez itemId,
// nebo fotky nahrané do Supabase Storage, když OneDrive nebyl dostupný).
function OneDriveThumb({ itemId, fallbackUrl, alt, style }) {
  const [src, setSrc] = useState(fallbackUrl);
  useEffect(() => {
    let zrusen = false;
    if (itemId) getDirectDownloadUrl(itemId).then(url => { if (!zrusen && url) setSrc(url); });
    return () => { zrusen = true; };
  }, [itemId]);
  return <img src={src} alt={alt} style={style} onError={() => { if (src !== fallbackUrl) setSrc(fallbackUrl); }} />;
}

const S = {
  app: { fontFamily: "'DM Sans',sans-serif", background: "#f0f4f8", minHeight: "100vh", color: "#1A1A1A", padding: "20px" },
  card: { background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 4px #0000000a" },
  inp: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1A1A1A", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" },
  btn: (c = "#0369a1") => ({ background: c, color: "#1A1A1A", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
};

// Stejná konvence jako Docházka a záložka "Fotky" v Zakázkách — všechny
// fotky zakázky (odkudkoliv v appce nahrané) tak končí ve stejné OneDrive
// složce a ve stejné tabulce contract_photos, ať je vidět všechno na jednom
// místě místo tří nepropojených evidencí.
const folderFor = (contractName, contractId) =>
  `FirmaCRM/Zakázky/${(contractName || String(contractId)).replace(/[/\\?%*:|"<>]/g, "_")}/Fotky`;

export default function FotoUpload({ currentUser, setTab }) {
  const [contracts, setContracts] = useState([]);
  const [search, setSearch] = useState("");
  const [activeContract, setActiveContract] = useState(null);
  const [fotky, setFotky] = useState([]);
  const [uploading, setUploading] = useState({});
  const [loading, setLoading] = useState(false);
  const [odConnected, setOdConnected] = useState(isConnected());
  const [odChecking, setOdChecking] = useState(!isConnected());

  useEffect(() => {
    supabase.from("contracts").select("id, name, code, status").order("name").then(({ data }) => setContracts(data || []));
  }, []);

  // Připoj se automaticky k firemnímu sdílenému OneDrive účtu (bez nutnosti přihlášení)
  useEffect(() => {
    if (isConnected()) { setOdConnected(true); setOdChecking(false); return; }
    connectSharedAccount().then(ok => { setOdConnected(ok); setOdChecking(false); });
  }, []);

  const openContract = async (c) => {
    setActiveContract(c);
    setLoading(true);
    const { data } = await supabase.from("contract_photos").select("*").eq("contract_id", c.id).order("created_at", { ascending: false });
    setFotky(data || []);
    setLoading(false);
  };

  const closeContract = () => { setActiveContract(null); setFotky([]); setSearch(""); };

  const handleUpload = async (kategorie, files) => {
    if (!files || files.length === 0) return;
    setUploading(u => ({ ...u, [kategorie]: (u[kategorie] || 0) + files.length }));
    for (const f of files) {
      const payload = {
        file: f, contractId: activeContract.id, folder: folderFor(activeContract.name, activeContract.id),
        date: new Date().toISOString().slice(0, 10), category: kategorie, uploadedBy: currentUser?.employeeId || null,
      };
      try {
        // Bez signálu se fotka místo tichého zahození uloží do fronty v
        // zařízení a nahraje se sama, jakmile se připojení obnoví (viz
        // offlineQueue.js — stejný handler "contract_photo" jako Docházka
        // a Zakázkový list).
        const res = await tryOrQueue("contract_photo", `Fotka ${activeContract.name} — ${kategorie}`, payload, async (p) => {
          let url, storagePath, itemId = null;
          if (isConnected()) {
            const r = await uploadFileObject(p.folder, p.file);
            url = r.webUrl; itemId = r.itemId; storagePath = "onedrive:" + p.file.name;
          } else {
            const ext = p.file.name.split(".").pop();
            const path = `${p.contractId}/${crypto.randomUUID()}.${ext}`;
            const { error } = await supabase.storage.from("zakazky-fotky").upload(path, p.file);
            if (error) throw error;
            url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
            storagePath = path;
          }
          const { data: row, error: insErr } = await supabase.from("contract_photos").insert({
            contract_id: p.contractId, date: p.date, storage_path: storagePath, url, item_id: itemId,
            category: p.category, uploaded_by: p.uploadedBy,
          }).select().single();
          if (insErr) throw insErr;
          return row;
        });
        if (res.ok && res.result) setFotky(prev => [res.result, ...prev]);
        else if (res.queued) alert(`Bez signálu — fotka "${f.name}" je uložená v telefonu a nahraje se sama, jakmile se připojení obnoví.`);
      } catch (e) {
        alert(`Nahrání fotky "${f.name}" selhalo: ${e.message}`);
      } finally {
        setUploading(u => ({ ...u, [kategorie]: Math.max(0, (u[kategorie] || 1) - 1) }));
      }
    }
  };

  const removeFoto = async (id) => {
    await supabase.from("contract_photos").delete().eq("id", id);
    setFotky(prev => prev.filter(f => f.id !== id));
  };

  const filtered = contracts.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || "").toLowerCase().includes(search.toLowerCase()));

  // ─── VÝBĚR ZAKÁZKY ───────────────────────────────────────────────────────
  if (!activeContract) {
    return (
      <div style={S.app}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>📷 Nahrát fotky</h1>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 18 }}>Vyber zakázku, ke které chceš přidat fotky. Fotky se ukládají na OneDrive a jsou vidět i v Zakázkovém listu a v záložce Fotky u zakázky.</p>
        {odChecking && (
          <div style={{ ...S.card, fontSize: 13, color: "#475569" }}>⏳ Připojuji se k firemnímu OneDrive...</div>
        )}
        {!odChecking && !odConnected && (
          <div style={{ ...S.card, border: "1px solid #f59e0b44" }}>
            <div style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ Firemní OneDrive není momentálně dostupný — fotky se dočasně uloží do appky a přeneseš je na OneDrive, až se připojení obnoví.</div>
          </div>
        )}
        <input style={{ ...S.inp, marginBottom: 14, fontSize: 14 }} placeholder="Hledat zakázku podle jména nebo čísla..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>Žádné zakázky nenalezeny.</div>}
          {filtered.map(c => (
            <div key={c.id} onClick={() => openContract(c)}
              style={{ background: "#ffffff", borderRadius: 12, padding: "14px 18px", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>🔧</span>
              <div>
                <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14 }}>{c.code ? `[${c.code}] ` : ""}{c.name}</div>
                {c.status && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{c.status}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── NAHRÁVÁNÍ FOTEK ─────────────────────────────────────────────────────
  const nezarazene = fotky.filter(f => !f.category || !FOTO_KATEGORIE.includes(f.category));
  const kategorieKZobrazeni = nezarazene.length > 0 ? [...FOTO_KATEGORIE, "Ostatní"] : FOTO_KATEGORIE;

  return (
    <div style={S.app}>
      <button onClick={closeContract} style={{ ...S.btn("#e2e8f0"), color: "#64748b", padding: "6px 14px", marginBottom: 14 }}>← Zpět na výběr zakázky</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", marginBottom: 2 }}>📷 {activeContract.name}</h1>
      <p style={{ color: "#475569", fontSize: 12, marginBottom: 18 }}>Fotky se ukládají do FirmaCRM/Zakázky/{activeContract.name}/Fotky na OneDrive — stejná složka jako fotky z Docházky a záložky Fotky u zakázky.</p>

      {odChecking && (
        <div style={{ ...S.card, fontSize: 13, color: "#475569" }}>⏳ Připojuji se k firemnímu OneDrive...</div>
      )}
      {!odChecking && !odConnected && (
        <div style={{ ...S.card, border: "1px solid #f59e0b44" }}>
          <div style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ Firemní OneDrive není momentálně dostupný — fotky se dočasně uloží do appky.</div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Načítám...</div>
      ) : kategorieKZobrazeni.map(kat => {
        const fc = kat === "Ostatní" ? nezarazene : fotky.filter(f => f.category === kat);
        const busy = uploading[kat] > 0;
        return (
          <div key={kat} style={S.card}>
            <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14, marginBottom: 10 }}>{kat} <span style={{ color: "#475569", fontWeight: 500 }}>({fc.length})</span></div>
            {fc.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginBottom: 10 }}>
                {fc.map(f => (
                  <div key={f.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", position: "relative" }}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <OneDriveThumb itemId={f.item_id} fallbackUrl={f.url} alt={f.description || kat} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                    </a>
                    <button onClick={() => removeFoto(f.id)}
                      style={{ position: "absolute", top: 4, right: 4, background: "#ef444488", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {kat !== "Ostatní" && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: busy ? "#0ea5e922" : "#e2e8f0", color: busy ? "#0ea5e9" : "#64748b", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", border: "1px dashed #e2e8f0" }}>
                {busy ? `⏳ Nahrávám (${uploading[kat]})...` : "+ Přidat foto"}
                <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={e => {
                  const files = Array.from(e.target.files);
                  e.target.value = "";
                  handleUpload(kat, files);
                }} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
