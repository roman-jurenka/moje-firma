import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { isConnected, uploadFileObject } from "./onedrive.js";

// ─── Modul Finanční tok ───────────────────────────────────────────────────
// Počáteční stav bankovního účtu + průběžná evidence odeslaných/přijatých
// faktur a účtenek. Aktuální zůstatek = počáteční stav + příjmy − výdaje.
// U účtenek je možné vyfotit doklad a nechat OCR (Tesseract.js, běží přímo
// v prohlížeči, bez nutnosti externího API klíče) navrhnout částku a datum
// — uživatel návrh před uložením zkontroluje a případně opraví, protože OCR
// u účtenek občas chybuje.

const TYPY = {
  faktura_vydana:  { label: "Faktura vydaná",  direction: "prijem", color: "#34d399" },
  faktura_prijata: { label: "Faktura přijatá", direction: "vydaj",  color: "#f87171" },
  uctenka:         { label: "Účtenka",         direction: "vydaj",  color: "#f59e0b" },
  jine:            { label: "Jiné",            direction: null,     color: "#94a3b8" },
};

const fmtKc = (v) => `${Number(v || 0).toLocaleString("cs-CZ")} Kč`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => (d || "").slice(0, 7);

// Zkusí z OCR textu účtenky odhadnout částku a datum. Heuristika, ne jistota
// — proto se výsledek jen předvyplní do formuláře a uživatel ho potvrdí.
function guessFromOcrText(text) {
  const skipLineRe = /(ičo|dič|tel\.?:|telefon|účtenka č|doklad č|kasa|pokladna|zákaznick[áa] linka)/i;
  const rawLines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const lines = rawLines.filter(l => !skipLineRe.test(l));

  const numRe = /(\d[\d\s]{0,7}[,.]\d{2})/g;
  const parseNum = (s) => Number(s.replace(/\s/g, "").replace(",", "."));

  // Klíčová slova pro "částku k úhradě" seřazená od nejjistějších po nejslabší
  // — čím výš v seznamu, tím spolehlivěji jde o celkovou částku, ne mezisoučet.
  const totalKeywordsPriority = [
    /k\s*úhrad[ěe]/i,
    /celkem\s*k\s*úhrad[ěe]/i,
    /celková?\s*částka/i,
    /^celkem\b/i,
    /\bcelkem\b/i,
    /\bsuma\b/i,
    /\btotal\b/i,
  ];

  let amount = null;
  for (const re of totalKeywordsPriority) {
    const line = lines.find(l => re.test(l));
    if (line) {
      const m = [...line.matchAll(numRe)];
      if (m.length) { amount = parseNum(m[m.length - 1][1]); break; }
    }
  }
  if (amount == null) {
    // Bez rozpoznaného klíčového slova bereme největší rozumnou částku na
    // dokladu (celková částka bývá nejvyšší číslo na účtence).
    const all = [...text.matchAll(numRe)].map(m => parseNum(m[1])).filter(n => n > 0 && n < 500000);
    if (all.length) amount = Math.max(...all);
  }

  let date = null;
  const dateRe = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/g;
  for (const dm of [...text.matchAll(dateRe)]) {
    let [, d, mo, y] = dm;
    if (y.length === 2) y = "20" + y;
    d = d.padStart(2, "0"); mo = mo.padStart(2, "0");
    const dn = Number(d), mn = Number(mo), yn = Number(y);
    if (mn >= 1 && mn <= 12 && dn >= 1 && dn <= 31 && yn >= 2015 && yn <= 2035) { date = `${y}-${mo}-${d}`; break; }
  }

  const vendor = lines.find(l => l.length > 2 && !/^[\d\s.,-]+$/.test(l)) || "";
  return { amount: amount != null ? amount : "", date, vendor };
}

// Předzpracování fotky před OCR — šedotón + roztažení kontrastu a případné
// zvětšení malých fotek. Tesseract si na vyčištěném obrázku vede podstatně
// líp než na syrové fotce z mobilu (stíny, nízký kontrast papíru).
async function preprocessImageForOcr(file) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = img.width < 1500 ? 1500 / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export default function FinanceModule({ currentUser, employees = [], contracts = [] }) {
  const [settings, setSettings] = useState({ starting_balance: 0, starting_date: todayStr() });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "entry" | "settings"
  const [monthFilter, setMonthFilter] = useState(monthKey(todayStr()));

  const load = () => {
    Promise.all([
      supabase.from("cashflow_settings").select("*").eq("id", 1).single(),
      supabase.from("cashflow_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
    ]).then(([s, e]) => {
      if (s.data) setSettings(s.data);
      setEntries(e.data || []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const empName = (id) => employees.find(e => e.id === id)?.name || "—";

  const saveSettings = async (startBal, startDate) => {
    const { data } = await supabase.from("cashflow_settings")
      .upsert({ id: 1, starting_balance: Number(startBal) || 0, starting_date: startDate, updated_at: new Date().toISOString() })
      .select().single();
    if (data) setSettings(data);
    setModal(null);
  };

  const addEntry = async (payload) => {
    const { data } = await supabase.from("cashflow_entries").insert({
      ...payload,
      created_by: currentUser?.name || null,
    }).select().single();
    if (data) setEntries(prev => [data, ...prev]);
    setModal(null);
  };

  const deleteEntry = async (id) => {
    if (!confirm("Smazat tento záznam z finančního toku?")) return;
    await supabase.from("cashflow_entries").delete().eq("id", id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const markReimbursed = async (id) => {
    const { data } = await supabase.from("cashflow_entries")
      .update({ reimbursed: true, reimbursed_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (data) setEntries(prev => prev.map(e => e.id === id ? data : e));
  };

  const pendingReimbursements = entries.filter(e => e.paid_by_employee && !e.reimbursed);

  const prijmy = entries.reduce((s, e) => s + (e.direction === "prijem" ? Number(e.amount) : 0), 0);
  const vydaje = entries.reduce((s, e) => s + (e.direction === "vydaj" ? Number(e.amount) : 0), 0);
  const zustatek = Number(settings.starting_balance || 0) + prijmy - vydaje;

  const monthEntries = entries.filter(e => monthKey(e.entry_date) === monthFilter);
  const monthPrijmy = monthEntries.reduce((s, e) => s + (e.direction === "prijem" ? Number(e.amount) : 0), 0);
  const monthVydaje = monthEntries.reduce((s, e) => s + (e.direction === "vydaj" ? Number(e.amount) : 0), 0);

  const months = [...new Set(entries.map(e => monthKey(e.entry_date)))].sort().reverse();
  if (!months.includes(monthKey(todayStr()))) months.unshift(monthKey(todayStr()));

  if (loading) return <div style={{ padding: 24, color: "#94a3b8" }}>Načítání…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#1A1A1A" }}>Finanční tok</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setModal("settings")} style={btnGhost}>⚙️ Počáteční stav účtu</button>
          <button onClick={() => setModal("entry")} style={btnPrimary}>+ Přidat záznam</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        <div style={card}>
          <div style={cardLabel}>Aktuální zůstatek</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: zustatek >= 0 ? "#065f46" : "#991b1b" }}>{fmtKc(zustatek)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Počáteční stav {fmtKc(settings.starting_balance)} k {settings.starting_date}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Příjmy tento měsíc</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#065f46" }}>+{fmtKc(monthPrijmy)}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Výdaje tento měsíc</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#991b1b" }}>-{fmtKc(monthVydaje)}</div>
        </div>
      </div>

      {pendingReimbursements.length > 0 && (
        <div style={{ ...card, marginBottom: 20, borderColor: "#f59e0b66" }}>
          <div style={{ ...cardLabel, color: "#b45309" }}>Účtenky zaměstnanců k proplacení ({pendingReimbursements.length})</div>
          {pendingReimbursements.map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 13 }}>
                <strong>{empName(e.employee_id)}</strong> — {e.description || "účtenka"} · {e.entry_date}
                {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>📎 doklad</a>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700 }}>{fmtKc(e.amount)}</span>
                <button onClick={() => markReimbursed(e.id)} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>✓ Proplaceno</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#64748b" }}>Měsíc:</span>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              {["Datum", "Typ", "Popis", "Zakázka", "Protistrana", "Nahrál", "Částka", "Doklad", "Stav", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthEntries.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Žádné záznamy v tomto měsíci.</td></tr>
            )}
            {monthEntries.map(e => (
              <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px" }}>{e.entry_date}</td>
                <td style={{ padding: "9px 14px" }}>
                  <span style={{ background: (TYPY[e.entry_type]?.color || "#94a3b8") + "22", color: TYPY[e.entry_type]?.color || "#64748b", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                    {TYPY[e.entry_type]?.label || e.entry_type}
                  </span>
                </td>
                <td style={{ padding: "9px 14px" }}>{e.description || "—"}</td>
                <td style={{ padding: "9px 14px" }}>{contracts.find(c => c.id === e.contract_id)?.name || "—"}</td>
                <td style={{ padding: "9px 14px" }}>{e.counterparty || "—"}</td>
                <td style={{ padding: "9px 14px" }}>{e.created_by || "—"}</td>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: e.direction === "prijem" ? "#065f46" : "#991b1b" }}>
                  {e.direction === "prijem" ? "+" : "-"}{fmtKc(e.amount)}
                </td>
                <td style={{ padding: "9px 14px" }}>
                  {e.photo_url ? <a href={e.photo_url} target="_blank" rel="noreferrer">📎 foto</a> : "—"}
                </td>
                <td style={{ padding: "9px 14px" }}>
                  {e.paid_by_employee
                    ? (e.reimbursed
                      ? <span style={{ color: "#065f46", fontWeight: 600, fontSize: 12 }}>✓ Proplaceno</span>
                      : <span style={{ color: "#b45309", fontWeight: 600, fontSize: 12 }}>⏳ Čeká na proplacení</span>)
                    : "—"}
                </td>
                <td style={{ padding: "9px 14px", textAlign: "right" }}>
                  <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13 }}>Smazat</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "settings" && (
        <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setModal(null)} />
      )}
      {modal === "entry" && (
        <EntryModal onSave={addEntry} onClose={() => setModal(null)} currentUser={currentUser} contracts={contracts} />
      )}
    </div>
  );
}

// ─── Zjednodušený modul pro zaměstnance: jen nahrávání účtenek ──────────────
// Zaměstnanec smí přidávat pouze účtenky (ne faktury) a vidí jen svoje vlastní
// se stavem proplacení. Admin/manažer vidí a schvaluje proplacení v plném
// modulu FinanceModule výše.
export function ReceiptsModule({ currentUser }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => {
    supabase.from("cashflow_entries").select("*")
      .eq("employee_id", currentUser?.employeeId)
      .order("entry_date", { ascending: false }).order("id", { ascending: false })
      .then(({ data }) => { setEntries(data || []); setLoading(false); });
  };
  useEffect(load, [currentUser?.employeeId]);

  const addEntry = async (payload) => {
    const { data } = await supabase.from("cashflow_entries").insert({
      ...payload,
      created_by: currentUser?.name || null,
    }).select().single();
    if (data) setEntries(prev => [data, ...prev]);
    setModal(false);
  };

  if (loading) return <div style={{ padding: 24, color: "#94a3b8" }}>Načítání…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#1A1A1A" }}>Účtenky</h1>
        <button onClick={() => setModal(true)} style={btnPrimary}>+ Nahrát účtenku</button>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              {["Datum", "Popis", "Částka", "Doklad", "Stav"].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Zatím jsi nenahrál žádnou účtenku.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px" }}>{e.entry_date}</td>
                <td style={{ padding: "9px 14px" }}>{e.description || "—"}</td>
                <td style={{ padding: "9px 14px", fontWeight: 700 }}>{fmtKc(e.amount)}</td>
                <td style={{ padding: "9px 14px" }}>
                  {e.photo_url ? <a href={e.photo_url} target="_blank" rel="noreferrer">📎 foto</a> : "—"}
                </td>
                <td style={{ padding: "9px 14px" }}>
                  {e.paid_by_employee
                    ? (e.reimbursed
                      ? <span style={{ color: "#065f46", fontWeight: 600, fontSize: 12 }}>✓ Proplaceno</span>
                      : <span style={{ color: "#b45309", fontWeight: 600, fontSize: 12 }}>⏳ Čeká na proplacení</span>)
                    : <span style={{ color: "#64748b", fontSize: 12 }}>Firemní platba</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <EntryModal onSave={addEntry} onClose={() => setModal(false)} currentUser={currentUser} restrictToReceipts />
      )}
    </div>
  );
}

function SettingsModal({ settings, onSave, onClose }) {
  const [bal, setBal] = useState(settings.starting_balance || 0);
  const [date, setDate] = useState(settings.starting_date || todayStr());
  return (
    <div style={modalOverlay}>
      <div style={modalBox}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Počáteční stav bankovního účtu</div>
        <label style={label}>Počáteční zůstatek (Kč)</label>
        <input type="number" value={bal} onChange={e => setBal(e.target.value)} style={input} />
        <label style={label}>K datu</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => onSave(bal, date)} style={btnPrimary}>Uložit</button>
          <button onClick={onClose} style={btnGhost}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

function EntryModal({ onSave, onClose, currentUser, restrictToReceipts = false, contracts = [] }) {
  const [type, setType] = useState("uctenka");
  const [direction, setDirection] = useState(TYPY.uctenka.direction);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [contractId, setContractId] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [paidByEmployee, setPaidByEmployee] = useState(restrictToReceipts);

  const onTypeChange = (t) => {
    setType(t);
    if (TYPY[t].direction) setDirection(TYPY[t].direction);
  };

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let url;
      if (isConnected()) {
        const res = await uploadFileObject("FirmaCRM/Financni-tok/Doklady", file);
        url = res.webUrl;
      } else {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("zakazky-fotky").upload("financni-tok/" + path, file);
        if (!error) url = supabase.storage.from("zakazky-fotky").getPublicUrl("financni-tok/" + path).data.publicUrl;
      }
      if (url) setPhotoUrl(url);
    } catch { /* nahrání dokladu se nezdařilo, uživatel to uvidí podle chybějícího odkazu */ }
    setUploading(false);

    // OCR přímo v prohlížeči — zkusí z fotky přečíst text a navrhnout částku/datum.
    setOcrRunning(true);
    try {
      const [{ createWorker }, canvas] = await Promise.all([
        import("tesseract.js"),
        preprocessImageForOcr(file).catch(() => null),
      ]);
      const worker = await createWorker("ces");
      // PSM 6 = "jeden jednolitý blok textu" — pro účtenky sedí líp než výchozí
      // plně automatická segmentace, která si na úzkém papíru z tiskárny často
      // špatně poradí s pořadím řádků.
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const { data } = await worker.recognize(canvas || file);
      await worker.terminate();
      setOcrText(data.text || "");
      const guess = guessFromOcrText(data.text || "");
      if (guess.amount) setAmount(guess.amount);
      if (guess.date) setDate(guess.date);
      if (guess.vendor && !counterparty) setCounterparty(guess.vendor);
      if (!description) setDescription("Účtenka — " + (guess.vendor || file.name));
    } catch {
      // OCR se nepovedlo (např. nedostupné CDN s jazykovými daty) — formulář
      // zůstane prázdný a uživatel ho vyplní ručně, nic se nerozbije.
    }
    setOcrRunning(false);
  };

  const submit = () => {
    if (!amount || !date) { alert("Vyplň částku a datum."); return; }
    onSave({
      entry_type: type, direction, amount: Number(amount), entry_date: date,
      description, counterparty, photo_url: photoUrl, ocr_raw_text: ocrText || null,
      paid_by_employee: type === "uctenka" ? paidByEmployee : false,
      employee_id: type === "uctenka" && paidByEmployee ? (currentUser?.employeeId || null) : null,
      contract_id: contractId ? Number(contractId) : null,
    });
  };

  return (
    <div style={modalOverlay}>
      <div style={modalBox}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{restrictToReceipts ? "Nahrát účtenku" : "Nový záznam finančního toku"}</div>

        {!restrictToReceipts && (
          <>
            <label style={label}>Typ</label>
            <select value={type} onChange={e => onTypeChange(e.target.value)} style={input}>
              {Object.entries(TYPY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        )}

        {type === "jine" && !restrictToReceipts && (
          <>
            <label style={label}>Směr</label>
            <select value={direction} onChange={e => setDirection(e.target.value)} style={input}>
              <option value="prijem">Příjem</option>
              <option value="vydaj">Výdaj</option>
            </select>
          </>
        )}

        {type === "uctenka" && (
          <>
            <label style={label}>Foto účtenky (volitelné, s OCR návrhem částky/data)</label>
            <input type="file" accept="image/*" capture="environment" onChange={onPhotoSelected} style={input} />
            {uploading && <div style={{ fontSize: 12, color: "#94a3b8" }}>Nahrávám doklad…</div>}
            {ocrRunning && <div style={{ fontSize: 12, color: "#94a3b8" }}>Čtu doklad (OCR)… zkontroluj prosím vyplněné údaje níže.</div>}
            {photoUrl && !uploading && <div style={{ fontSize: 12, color: "#34d399" }}>✓ Doklad nahrán</div>}
            {ocrText && !ocrRunning && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>Co OCR na dokladu přečetlo (pro kontrolu, pokud návrh sedí špatně)</summary>
                <div style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", borderRadius: 6, padding: 8, marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>{ocrText}</div>
              </details>
            )}

            <div style={{ marginTop: 10, background: "#f8fafc", borderRadius: 8, padding: 10 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#334155", cursor: "pointer" }}>
                <input type="checkbox" checked={paidByEmployee} onChange={e => setPaidByEmployee(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Moje účtenka — zaplaceno vlastními penězi, čeká na proplacení zaměstnanci. (Nezaškrtnuté = zaplaceno firmou/kartou, žádné proplacení netřeba.)</span>
              </label>
            </div>
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={label}>Částka (Kč)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={input} /></div>
          <div><label style={label}>Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} /></div>
        </div>

        <label style={label}>Protistrana (dodavatel/odběratel)</label>
        <input value={counterparty} onChange={e => setCounterparty(e.target.value)} style={input} />

        <label style={label}>Popis</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...input, height: 60, resize: "vertical" }} />

        {contracts.length > 0 && (
          <>
            <label style={label}>Zakázka (volitelné)</label>
            <select value={contractId} onChange={e => setContractId(e.target.value)} style={input}>
              <option value="">— nepřiřazeno —</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={submit} style={btnPrimary}>Uložit záznam</button>
          <button onClick={onClose} style={btnGhost}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

const card = { background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px #0000000a" };
const cardLabel = { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, fontWeight: 700 };
const btnPrimary = { background: "#F5C518", color: "#1A1A1A", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost = { background: "transparent", color: "#2E9BE0", border: "1px solid #2E9BE0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const modalOverlay = { position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 };
const modalBox = { background: "#fff", borderRadius: 14, padding: 24, width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" };
const label = { display: "block", fontSize: 12, color: "#64748b", fontWeight: 600, margin: "10px 0 4px" };
const input = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" };
