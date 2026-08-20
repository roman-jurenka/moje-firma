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
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  let amount = null;
  const totalLine = lines.find(l => /celkem|k úhrad|suma|total/i.test(l));
  const numRe = /(\d[\d\s]{0,7}[,.]\d{2})/g;
  if (totalLine) {
    const m = [...totalLine.matchAll(numRe)];
    if (m.length) amount = m[m.length - 1][1];
  }
  if (!amount) {
    const all = [...text.matchAll(numRe)].map(m => m[1]);
    if (all.length) {
      const nums = all.map(s => Number(s.replace(/\s/g, "").replace(",", ".")));
      amount = String(Math.max(...nums));
    }
  }
  if (amount) amount = amount.replace(/\s/g, "").replace(",", ".");

  let date = null;
  const dateRe = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/;
  const dm = text.match(dateRe);
  if (dm) {
    let [, d, mo, y] = dm;
    if (y.length === 2) y = "20" + y;
    d = d.padStart(2, "0"); mo = mo.padStart(2, "0");
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) date = `${y}-${mo}-${d}`;
  }

  const vendor = lines[0] || "";
  return { amount: amount ? Number(amount) : "", date, vendor };
}

export default function FinanceModule({ currentUser }) {
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
              {["Datum", "Typ", "Popis", "Protistrana", "Částka", "Doklad", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthEntries.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Žádné záznamy v tomto měsíci.</td></tr>
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
                <td style={{ padding: "9px 14px" }}>{e.counterparty || "—"}</td>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: e.direction === "prijem" ? "#065f46" : "#991b1b" }}>
                  {e.direction === "prijem" ? "+" : "-"}{fmtKc(e.amount)}
                </td>
                <td style={{ padding: "9px 14px" }}>
                  {e.photo_url ? <a href={e.photo_url} target="_blank" rel="noreferrer">📎 foto</a> : "—"}
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
        <EntryModal onSave={addEntry} onClose={() => setModal(null)} />
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

function EntryModal({ onSave, onClose }) {
  const [type, setType] = useState("uctenka");
  const [direction, setDirection] = useState(TYPY.uctenka.direction);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrText, setOcrText] = useState("");

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
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("ces");
      const { data } = await worker.recognize(file);
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
    });
  };

  return (
    <div style={modalOverlay}>
      <div style={modalBox}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Nový záznam finančního toku</div>

        <label style={label}>Typ</label>
        <select value={type} onChange={e => onTypeChange(e.target.value)} style={input}>
          {Object.entries(TYPY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {type === "jine" && (
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
