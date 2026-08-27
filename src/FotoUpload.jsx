import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { uploadFileObject, zakazkaFolderPath, toDirectImageUrl, isConnected, connectSharedAccount, getDirectDownloadUrl } from "./onedrive.js";
import { PRAZDNA_DATA, FOTO_KATEGORIE } from "./ZakazkaSheet.jsx";

// Náhled fotky z OneDrive — natáhne čerstvý přímý odkaz přes itemId, se
// spolehlivým fallbackem na uložený sdílený odkaz (starší fotky bez itemId).
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
  card: { background: "#1A1A1Afff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 4px #0000000a" },
  inp: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1A1A1A", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" },
  btn: (c = "#2E9BE0") => ({ background: c, color: "#1A1A1A", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
};

export default function FotoUpload({ currentUser, setTab }) {
  const [contracts, setContracts] = useState([]);
  const [search, setSearch] = useState("");
  const [activeContract, setActiveContract] = useState(null);
  const [sheetId, setSheetId] = useState(null);
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
    const { data: row } = await supabase.from("project_sheets").select("*").eq("project_id", c.id).maybeSingle();
    if (row) { setSheetId(row.id); setFotky(row.data?.fotky?.nahrane || []); }
    else { setSheetId(null); setFotky([]); }
    setLoading(false);
  };

  const closeContract = () => { setActiveContract(null); setSheetId(null); setFotky([]); setSearch(""); };

  const persist = async (newFotky) => {
    if (sheetId) {
      const { data: row } = await supabase.from("project_sheets").select("data").eq("id", sheetId).single();
      const newData = { ...row.data, fotky: { ...(row.data.fotky || {}), nahrane: newFotky } };
      await supabase.from("project_sheets").update({ data: newData, updated_at: new Date().toISOString() }).eq("id", sheetId);
    } else {
      const initData = { ...PRAZDNA_DATA, _nazev: activeContract.name, fotky: { ...PRAZDNA_DATA.fotky, nahrane: newFotky } };
      const { data: row } = await supabase.from("project_sheets").insert({ project_id: activeContract.id, data: initData }).select().single();
      if (row) setSheetId(row.id);
    }
  };

  const handleUpload = async (kategorie, files) => {
    if (!files || files.length === 0) return;
    if (!isConnected()) { alert("Nejdřív se připoj k OneDrive — přepni se do záložky ☁️ OneDrive."); return; }
    setUploading(u => ({ ...u, [kategorie]: (u[kategorie] || 0) + files.length }));
    let updated = fotky;
    for (const f of files) {
      try {
        const { webUrl, itemId } = await uploadFileObject(zakazkaFolderPath(activeContract.name, `Fotky/${kategorie}`), f);
        updated = [...updated, {
          id: Date.now() + Math.random(), name: f.name, url: toDirectImageUrl(webUrl), link: webUrl, itemId,
          datum: new Date().toLocaleDateString("cs-CZ"), kategorie, autor: currentUser?.name || "",
        }];
        setFotky(updated);
      } catch (e) {
        alert(`Nahrání fotky "${f.name}" na OneDrive selhalo: ${e.message}`);
      } finally {
        setUploading(u => ({ ...u, [kategorie]: Math.max(0, (u[kategorie] || 1) - 1) }));
      }
    }
    await persist(updated);
  };

  const removeFoto = async (id) => {
    const updated = fotky.filter(f => f.id !== id);
    setFotky(updated);
    await persist(updated);
  };

  const filtered = contracts.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || "").toLowerCase().includes(search.toLowerCase()));

  // ─── VÝBĚR ZAKÁZKY ───────────────────────────────────────────────────────
  if (!activeContract) {
    return (
      <div style={S.app}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>📷 Nahrát fotky</h1>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 18 }}>Vyber zakázku, ke které chceš přidat fotky. Fotky se ukládají rovnou na OneDrive.</p>
        {odChecking && (
          <div style={{ ...S.card, fontSize: 13, color: "#475569" }}>⏳ Připojuji se k firemnímu OneDrive...</div>
        )}
        {!odChecking && !odConnected && (
          <div style={{ ...S.card, border: "1px solid #f59e0b44" }}>
            <div style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ Firemní OneDrive není momentálně dostupný — fotky se nenahrají. Ozvi se administrátorovi.</div>
          </div>
        )}
        <input style={{ ...S.inp, marginBottom: 14, fontSize: 14 }} placeholder="Hledat zakázku podle jména nebo čísla..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>Žádné zakázky nenalezeny.</div>}
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
  return (
    <div style={S.app}>
      <button onClick={closeContract} style={{ ...S.btn("#e2e8f0"), color: "#94a3b8", padding: "6px 14px", marginBottom: 14 }}>← Zpět na výběr zakázky</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", marginBottom: 2 }}>📷 {activeContract.name}</h1>
      <p style={{ color: "#475569", fontSize: 12, marginBottom: 18 }}>Fotky se ukládají do FirmaCRM/Zakázky/{activeContract.name}/Fotky na OneDrive.</p>

      {odChecking && (
        <div style={{ ...S.card, fontSize: 13, color: "#475569" }}>⏳ Připojuji se k firemnímu OneDrive...</div>
      )}
      {!odChecking && !odConnected && (
        <div style={{ ...S.card, border: "1px solid #f59e0b44" }}>
          <div style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ Firemní OneDrive není momentálně dostupný. Ozvi se administrátorovi.</div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Načítám...</div>
      ) : FOTO_KATEGORIE.map(kat => {
        const fc = fotky.filter(f => f.kategorie === kat);
        const busy = uploading[kat] > 0;
        return (
          <div key={kat} style={S.card}>
            <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14, marginBottom: 10 }}>{kat} <span style={{ color: "#475569", fontWeight: 500 }}>({fc.length})</span></div>
            {fc.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginBottom: 10 }}>
                {fc.map(f => (
                  <div key={f.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", position: "relative" }}>
                    <a href={f.link || f.url} target="_blank" rel="noreferrer">
                      <OneDriveThumb itemId={f.itemId} fallbackUrl={f.url} alt={f.name} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                    </a>
                    <button onClick={() => removeFoto(f.id)}
                      style={{ position: "absolute", top: 4, right: 4, background: "#ef444488", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: busy ? "#0ea5e922" : "#e2e8f0", color: busy ? "#0ea5e9" : "#94a3b8", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", border: "1px dashed #e2e8f0" }}>
              {busy ? `⏳ Nahrávám na OneDrive (${uploading[kat]})...` : "+ Přidat foto"}
              <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={e => {
                const files = Array.from(e.target.files);
                e.target.value = "";
                handleUpload(kat, files);
              }} />
            </label>
          </div>
        );
      })}
    </div>
  );
}
