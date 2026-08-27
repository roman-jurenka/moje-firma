import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

const S = {
  app:      { fontFamily: "'DM Sans', sans-serif", background: "#f0f4f8", minHeight: "100vh", color: "#1A1A1A", padding: "20px 28px" },
  card:     { background: "#ffffff", borderRadius: 12, padding: 22, border: "1px solid #e2e8f0", marginBottom: 14, boxShadow: "0 1px 4px #0000000a" },
  input:    { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#1A1A1A", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  btn:      (c = "#0369a1") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#0369a1", border: "1px solid #0369a1", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modal:    { position: "fixed", inset: 0, background: "#0007", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 },
  modalBox: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, width: 460, maxWidth: "92vw", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0000001a" },
};

const STATUS_COLOR = {
  "čeká na podpis zaměstnance":    { bg: "#f59e0b22", fg: "#f59e0b" },
  "čeká na podpis zaměstnavatele": { bg: "#0369a122", fg: "#0369a1" },
  "podepsáno":                     { bg: "#34d39922", fg: "#34d399" },
};

const fmtKc = (n) => (Number(n) || 0).toLocaleString("cs-CZ") + " Kč";

// PIN se nikam neukládá v čitelné podobě — jen jako SHA-256 otisk (dost na to,
// aby to nebylo prosté heslo v databázi, není to ale bankovní zabezpečení).
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Podpisový panel — kreslení myší / prstem, ukládá se jako base64 PNG ────
export function SignaturePad({ onSave, height = 160 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  // Canvas má pevné vnitřní rozlišení (width/height atributy), ale na
  // obrazovce se roztahuje na 100% šířky — bez přepočtu poměru by se kreslilo
  // jinde, než je kurzor. Tady se souřadnice myši/prstu přepočítají z
  // zobrazené velikosti na vnitřní rozlišení plátna.
  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    setEmpty(false);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  const save = () => {
    if (empty) { alert("Nejdřív se prosím podepište do pole."); return; }
    onSave(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div>
      <canvas
        ref={canvasRef} width={420} height={height}
        style={{ width: "100%", height, background: "#fff", border: "1px dashed #64748b", borderRadius: 8, touchAction: "none", cursor: "crosshair" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={clear} style={{ ...S.btnGhost, padding: "6px 14px", fontSize: 12 }}>Vymazat</button>
        <button onClick={save} style={{ ...S.btn("#34d399"), padding: "6px 14px", fontSize: 12 }}>✓ Uložit podpis</button>
      </div>
    </div>
  );
}

// ─── Podpisový krok v modalu — buď PINem z uloženého vzoru, nebo nové kreslení ──
export function SignFlow({ currentUser, onSigned }) {
  const [saved, setSaved] = useState(undefined); // undefined = načítá se, null = žádný uložený vzor
  const [mode, setMode] = useState("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");

  useEffect(() => {
    supabase.from("saved_signatures").select("*").eq("owner_auth_id", currentUser.authId).maybeSingle()
      .then(({ data }) => { setSaved(data || null); setMode(data ? "pin" : "draw"); });
  }, [currentUser.authId]);

  const confirmPin = async () => {
    if (!pin) return;
    const hash = await hashPin(pin);
    if (hash !== saved.pin_hash) { setPinError("Nesprávný PIN."); return; }
    onSigned(saved.signature);
  };

  const finishDraw = async (dataUrl) => {
    if (saveTemplate) {
      if (newPin.length < 4) { alert("PIN musí mít alespoň 4 znaky."); return; }
      if (newPin !== newPinConfirm) { alert("PIN a jeho potvrzení se neshodují."); return; }
      const pin_hash = await hashPin(newPin);
      await supabase.from("saved_signatures").upsert(
        { owner_auth_id: currentUser.authId, owner_name: currentUser.name, signature: dataUrl, pin_hash, updated_at: new Date().toISOString() },
        { onConflict: "owner_auth_id" }
      );
    }
    onSigned(dataUrl);
  };

  if (saved === undefined) return <div style={{ color: "#64748b", fontSize: 13 }}>Načítám…</div>;

  if (mode === "pin" && saved) {
    return (
      <div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Máš uložený podpis — zadej svůj PIN a použije se automaticky.</div>
        <img src={saved.signature} alt="uložený podpis" style={{ maxHeight: 70, background: "#fff", borderRadius: 6, padding: 4, marginBottom: 10 }} />
        <input type="password" inputMode="numeric" placeholder="PIN" style={{ ...S.input, marginBottom: 6 }}
          value={pin} onChange={e => { setPin(e.target.value); setPinError(""); }} onKeyDown={e => e.key === "Enter" && confirmPin()} />
        {pinError && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 6 }}>{pinError}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={confirmPin} style={{ ...S.btn("#34d399"), padding: "6px 14px", fontSize: 12 }}>✓ Podepsat</button>
          <button onClick={() => setMode("draw")} style={{ ...S.btnGhost, padding: "6px 14px", fontSize: 12 }}>Podepsat jinak (nakreslit)</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SignaturePad onSave={finishDraw} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", marginTop: 12 }}>
        <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} />
        Uložit tento podpis jako můj vzor — příště stačí PIN
      </label>
      {saveTemplate && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <input type="password" inputMode="numeric" placeholder="Nový PIN" style={{ ...S.input, marginBottom: 0 }} value={newPin} onChange={e => setNewPin(e.target.value)} />
          <input type="password" inputMode="numeric" placeholder="Potvrdit PIN" style={{ ...S.input, marginBottom: 0 }} value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} />
        </div>
      )}
      {saved && <button onClick={() => setMode("pin")} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>Zpět na PIN</button>}
    </div>
  );
}

// Sestaví tisknutelné/prohlédnutelné HTML dokumentu se vším podle typu a
// vloženými obrázky podpisů (pokud už existují).
function renderDocumentHtml(doc) {
  const d = doc.data || {};
  let body;
  if (doc.doc_type === "vykaz_prace") {
    const rows = (d.rows || []).map(r =>
      `<tr><td>${r.date || ""}</td><td>${r.checkin || "—"}</td><td>${r.checkout || "—"}</td><td><strong>${r.hoursLabel || ""}</strong></td><td>${r.contractName || "—"}</td><td>${r.activity || "—"}</td></tr>`
    ).join("");
    body = `<h2>${d.empName || ""} · ${d.monthLabel || ""}</h2>
      <table><thead><tr><th>Datum</th><th>Příchod</th><th>Odchod</th><th>Odpracováno</th><th>Zakázka</th><th>Popis</th></tr></thead>
      <tbody>${rows}<tr class="total"><td colspan="3">Celkem</td><td><strong>${d.totalHLabel || ""}</strong></td><td colspan="2">${(d.rows || []).length} záznamů</td></tr></tbody></table>
      ${d.sazba ? `<div class="vyplata">Celková částka k výplatě: <strong>${fmtKc(d.castka)}</strong><span class="vyplata-detail"> (${d.totalHLabel} × ${fmtKc(d.sazba)}/h)</span></div>` : ""}`;
  } else {
    body = `<pre style="white-space:pre-wrap;font-size:13px">${JSON.stringify(d, null, 2)}</pre>`;
  }

  const sig = (label, imgSrc, name, at) => `
    <div class="podpis">
      ${imgSrc ? `<img src="${imgSrc}" class="sigimg" />` : `<div class="cara"></div>`}
      <div class="popisek">${label}${name ? " — " + name : ""}${at ? "<br/>" + new Date(at).toLocaleString("cs-CZ") : ""}</div>
    </div>`;

  const podpisy = `<div class="podpisy">
    ${sig("Podpis zaměstnance", doc.employee_signature, doc.employee_signed_name, doc.employee_signed_at)}
    ${sig("Podpis zaměstnavatele", doc.employer_signature, doc.employer_signed_name, doc.employer_signed_at)}
  </div>`;

  return `<!DOCTYPE html><html><head><meta charset='utf-8'><title>${doc.title}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:13px}
    td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}tr:nth-child(even) td{background:#f8fafc}.total{font-weight:bold}
    .vyplata{margin-top:18px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:15px}.vyplata strong{font-size:18px}
    .vyplata-detail{color:#475569;font-size:12px;margin-left:6px}
    .podpisy{display:flex;justify-content:space-between;margin-top:64px}.podpis{width:42%}
    .cara{border-top:1px solid #111;margin-bottom:6px;margin-top:50px}.sigimg{max-width:100%;max-height:70px;display:block;margin-bottom:2px}
    .popisek{font-size:12px;color:#555;text-align:center}@media print{body{padding:16px}}</style>
    </head><body><h1>${doc.title}</h1>${body}${podpisy}
    <script>window.onload=function(){window.print();}</script></body></html>`;
}

function printDoc(doc) {
  const w = window.open("", "_blank");
  w.document.write(renderDocumentHtml(doc));
  w.document.close();
}

function emailDoc(doc, employees) {
  const emp = employees.find(e => e.id === doc.employee_id);
  if (!emp?.email) { alert("Zaměstnanec nemá v appce uložený e-mail."); return; }
  const subject = encodeURIComponent(doc.title);
  const d = doc.data || {};
  const lines = [
    doc.title, "",
    doc.doc_type === "vykaz_prace" ? `Odpracováno celkem: ${d.totalHLabel || ""}` : "",
    doc.doc_type === "vykaz_prace" && d.sazba ? `Částka k výplatě: ${fmtKc(d.castka)}` : "",
    "", "Stav: " + doc.status,
    "Podepsáno zaměstnancem: " + (doc.employee_signed_name || "—"),
    "Podepsáno zaměstnavatelem: " + (doc.employer_signed_name || "—"),
    "", "Podepsanou verzi k tisku najdete v appce ProudOS v modulu Podpisy.",
  ].filter(Boolean).join("\n");
  window.location.href = `mailto:${emp.email}?subject=${subject}&body=${encodeURIComponent(lines)}`;
}

// ─── Karta pro správu vlastního uloženého podpisu (nezávislé na konkrétním dokumentu) ──
function MujPodpisKarta({ currentUser }) {
  const [saved, setSaved] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");

  const load = () => supabase.from("saved_signatures").select("*").eq("owner_auth_id", currentUser.authId).maybeSingle()
    .then(({ data }) => setSaved(data || null));
  useEffect(() => { load(); }, [currentUser.authId]);

  const uložit = async (dataUrl) => {
    if (newPin.length < 4) { alert("PIN musí mít alespoň 4 znaky."); return; }
    if (newPin !== newPinConfirm) { alert("PIN a jeho potvrzení se neshodují."); return; }
    const pin_hash = await hashPin(newPin);
    await supabase.from("saved_signatures").upsert(
      { owner_auth_id: currentUser.authId, owner_name: currentUser.name, signature: dataUrl, pin_hash, updated_at: new Date().toISOString() },
      { onConflict: "owner_auth_id" }
    );
    setNewPin(""); setNewPinConfirm(""); setEditing(false);
    load();
  };

  if (saved === undefined) return null;

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>🔐 Můj uložený podpis</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Nastav si podpis a vlastní PIN jednou — příště pak dokumenty podepíšeš jen zadáním PINu, bez kreslení.</div>
      {!editing ? (
        <div>
          {saved ? (
            <img src={saved.signature} alt="podpis" style={{ maxHeight: 60, background: "#fff", borderRadius: 6, padding: 4, marginBottom: 10, display: "block" }} />
          ) : (
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>Zatím nemáš nastavený podpis.</div>
          )}
          <button onClick={() => setEditing(true)} style={{ ...S.btnGhost, padding: "6px 14px", fontSize: 12 }}>{saved ? "Změnit podpis" : "Nastavit podpis"}</button>
        </div>
      ) : (
        <div>
          <SignaturePad onSave={uložit} />
          <div style={{ fontSize: 12, color: "#475569", marginTop: 12, marginBottom: 6 }}>Zvol si PIN (min. 4 znaky), kterým podpis příště potvrdíš:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="password" inputMode="numeric" placeholder="Nový PIN" style={{ ...S.input, marginBottom: 0 }} value={newPin} onChange={e => setNewPin(e.target.value)} />
            <input type="password" inputMode="numeric" placeholder="Potvrdit PIN" style={{ ...S.input, marginBottom: 0 }} value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} />
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>Podpis se uloží po kliknutí na „✓ Uložit podpis" v panelu výše.</div>
          <button onClick={() => setEditing(false)} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>Zrušit</button>
        </div>
      )}
    </div>
  );
}

export default function PodpisyModule({ employees, currentUser }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signModal, setSignModal] = useState(null); // { doc, role: "employee"|"employer" }
  const [signName, setSignName] = useState("");

  useEffect(() => {
    supabase.from("signed_documents").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setDocs(data || []); setLoading(false); });
  }, []);

  const isEmployer = currentUser.role === "admin" || currentUser.role === "manager";
  const visible = isEmployer ? docs : docs.filter(d => d.employee_id === currentUser.employeeId);

  const openSign = (doc, role) => {
    setSignName(role === "employee" ? (employees.find(e => e.id === doc.employee_id)?.name || currentUser.name) : currentUser.name);
    setSignModal({ doc, role });
  };

  const saveSignature = async (dataUrl) => {
    const { doc, role } = signModal;
    const now = new Date().toISOString();
    const patch = role === "employee"
      ? { employee_signature: dataUrl, employee_signed_at: now, employee_signed_name: signName, status: "čeká na podpis zaměstnavatele" }
      : { employer_signature: dataUrl, employer_signed_at: now, employer_signed_name: signName, status: "podepsáno" };
    const { data: updated } = await supabase.from("signed_documents").update(patch).eq("id", doc.id).select().single();
    if (updated) setDocs(docs.map(d => d.id === doc.id ? updated : d));
    setSignModal(null);
  };

  return (
    <div style={S.app}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", margin: "0 0 6px" }}>✍️ Podpisy</h1>
      <p style={{ color: "#475569", fontSize: 13, marginBottom: 20 }}>
        Digitální podepisování dokumentů — výkazy práce a do budoucna i další. Zaměstnanec podepíše hned při vytvoření, zaměstnavatel dokument dopodepíše zde.
      </p>

      <MujPodpisKarta currentUser={currentUser} />

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Načítám…</div>
      ) : visible.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Zatím žádné dokumenty k podpisu.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(doc => {
            const sc = STATUS_COLOR[doc.status] || { bg: "#64748b22", fg: "#475569" };
            const emp = employees.find(e => e.id === doc.employee_id);
            const canSignEmployee = doc.status === "čeká na podpis zaměstnance" && (currentUser.employeeId === doc.employee_id || isEmployer);
            const canSignEmployer = doc.status === "čeká na podpis zaměstnavatele" && isEmployer;
            return (
              <div key={doc.id} style={{ ...S.card, marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14 }}>{doc.title}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                    {emp?.name || ""} · vytvořeno {new Date(doc.created_at).toLocaleDateString("cs-CZ")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: sc.bg, color: sc.fg, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>{doc.status}</span>
                  {canSignEmployee && <button style={S.btn("#f59e0b")} onClick={() => openSign(doc, "employee")}>✍️ Podepsat (zaměstnanec)</button>}
                  {canSignEmployer && <button style={S.btn("#0369a1")} onClick={() => openSign(doc, "employer")}>✍️ Podepsat (zaměstnavatel)</button>}
                  <button style={S.btnGhost} onClick={() => printDoc(doc)}>🖨️ Tisk / PDF</button>
                  {isEmployer && <button style={S.btnGhost} onClick={() => emailDoc(doc, employees)}>✉️ E-mail</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {signModal && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>✍️ Podpis — {signModal.role === "employee" ? "zaměstnanec" : "zaměstnavatel"}</div>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>{signModal.doc.title}</div>
            <label style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: 3 }}>Jméno podepisujícího</label>
            <input style={{ ...S.input, marginBottom: 14 }} value={signName} onChange={e => setSignName(e.target.value)} />
            <SignFlow currentUser={currentUser} onSigned={saveSignature} />
            <button onClick={() => setSignModal(null)} style={{ ...S.btnGhost, marginTop: 14, padding: "6px 14px", fontSize: 12 }}>Zrušit</button>
          </div>
        </div>
      )}
    </div>
  );
}
