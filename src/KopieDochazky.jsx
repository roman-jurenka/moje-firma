import { useState } from "react";
import { supabase } from "./supabase.js";

// ─── Kopie docházky na další zaměstnance (jen admin / HR / manažer) ─────────
// Když někdo zapomene zapsat docházku a byl na stejné akci jako kolega:
// vezme se kolegův záznam, v okně jde vše upravit (datum, časy, zakázka,
// popis) a zapíše se vybraným lidem naráz. Kdo už má ten den docházku, je
// označený — přepíše se jen na výslovné přání. Náklady na zakázku se
// dopočítají stejně jako u ručního zápisu (createCostEntry z Attendance).

const cas = (t) => String(t || "").slice(0, 5);

export default function KopieDochazky({ zdroj, employees, contracts, attendance, spocitejHodiny, fmtHodiny, createCostEntry, onHotovo, onClose }) {
  const zdrojovy = employees.find((e) => e.id === (zdroj.employeeId ?? zdroj.employee_id));
  const [form, setForm] = useState({
    date: zdroj.date, checkin: cas(zdroj.checkin), checkout: cas(zdroj.checkout),
    contract_id: zdroj.contract_id ? String(zdroj.contract_id) : "", activity: zdroj.activity || "",
  });
  const [vybrani, setVybrani] = useState([]);
  const [prepsat, setPrepsat] = useState(false);
  const [hledat, setHledat] = useState("");
  const [ukladam, setUkladam] = useState(false);
  const [vysledek, setVysledek] = useState(null);

  const lide = employees
    .filter((e) => e.id !== zdrojovy?.id && (!e.status || e.status === "Aktivní"))
    .filter((e) => !hledat.trim() || String(e.name || "").toLowerCase().includes(hledat.trim().toLowerCase()))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "cs"));
  const zaznamV = (empId) => attendance.find((a) => (a.employeeId ?? a.employee_id) === empId && a.date === form.date);
  const hodiny = form.checkin && form.checkout ? spocitejHodiny(form.checkin, form.checkout) : 0;
  const prepnout = (id) => setVybrani((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const kolikPrepise = vybrani.filter((id) => zaznamV(id)).length;

  const ulozit = async () => {
    if (!form.date || !form.checkin) { alert("Vyplň datum a příchod."); return; }
    if (form.checkout && form.checkout <= form.checkin) { alert("Odchod musí být později než příchod."); return; }
    if (!vybrani.length) { alert("Vyber, komu se má docházka zapsat."); return; }
    if (kolikPrepise && prepsat && !window.confirm(`U ${kolikPrepise} ${kolikPrepise === 1 ? "zaměstnance" : "zaměstnanců"} se přepíše jejich docházka z ${form.date}. Pokračovat?`)) return;
    setUkladam(true);
    const zaklad = {
      date: form.date, checkin: form.checkin, checkout: form.checkout || null,
      contract_id: form.contract_id ? Number(form.contract_id) : null, activity: form.activity.trim() || null,
      project_id: zdroj.project_id ?? null,
    };
    const nove = [];
    const upravene = [];
    const preskoceno = [];
    const chyby = [];
    for (const empId of vybrani) {
      const emp = employees.find((e) => e.id === empId);
      const existujici = zaznamV(empId);
      if (existujici && !prepsat) { preskoceno.push(emp?.name); continue; }
      if (existujici) {
        const { error } = await supabase.from("attendance").update(zaklad).eq("id", existujici.id);
        if (error) { chyby.push(`${emp?.name}: ${error.message}`); continue; }
        const row = { ...existujici, ...zaklad };
        upravene.push(row);
        if (row.checkout && row.contract_id) await createCostEntry(row, row.checkout);
      } else {
        const { data, error } = await supabase.from("attendance").insert({ ...zaklad, employee_id: empId }).select().single();
        if (error) { chyby.push(`${emp?.name}: ${error.message}`); continue; }
        const row = { ...data, employeeId: data.employee_id };
        nove.push(row);
        if (row.checkout && row.contract_id) await createCostEntry(row, row.checkout);
      }
    }
    setUkladam(false);
    onHotovo(nove, upravene);
    setVysledek({ zapsano: nove.length, prepsano: upravene.length, preskoceno, chyby });
  };

  const bg = { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflow: "auto" };
  const okno = { background: "#fff", borderRadius: 16, padding: 20, width: "min(640px, 100%)", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,.3)", color: "#0f172a" };
  const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
  const btn = (b, f = "#fff") => ({ background: b, color: f, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const ghost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

  if (vysledek) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Kopie docházky" style={bg}>
        <div style={okno}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>✓ Docházka zkopírovaná</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            Nově zapsáno: <b>{vysledek.zapsano}</b>{vysledek.prepsano ? <> · přepsáno: <b>{vysledek.prepsano}</b></> : null}
            {vysledek.preskoceno.length > 0 && <div style={{ color: "#92400e" }}>Přeskočeno (už měli docházku): {vysledek.preskoceno.join(", ")}</div>}
            {vysledek.chyby.length > 0 && <div style={{ color: "#b91c1c" }}>Nepovedlo se: {vysledek.chyby.join("; ")}</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" style={btn("#0369a1")} onClick={onClose}>Zavřít</button></div>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Kopírovat docházku" style={bg} onClick={(e) => { if (e.target === e.currentTarget && !ukladam) onClose(); }}>
      <div style={okno}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📋 Kopírovat docházku na další zaměstnance</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>Předloha: <b>{zdrojovy?.name || "?"}</b> · {zdroj.date} · {cas(zdroj.checkin)}–{cas(zdroj.checkout) || "?"}. Všechno níže můžeš před zapsáním upravit.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <div><label style={lbl} htmlFor="kd-datum">Datum</label><input id="kd-datum" type="date" style={inp} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><label style={lbl} htmlFor="kd-in">Příchod</label><input id="kd-in" type="time" style={inp} value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} /></div>
          <div><label style={lbl} htmlFor="kd-out">Odchod</label><input id="kd-out" type="time" style={inp} value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} /></div>
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: -6 }}>Odpracováno: <b>{hodiny > 0 ? fmtHodiny(hodiny) : "—"}</b></div>
        <div><label style={lbl} htmlFor="kd-zak">Zakázka</label>
          <select id="kd-zak" style={inp} value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })}>
            <option value="">— bez zakázky —</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.code ? c.code + " · " : ""}{c.name}</option>)}
          </select></div>
        <div><label style={lbl} htmlFor="kd-popis">Popis práce</label>
          <textarea id="kd-popis" rows={2} style={{ ...inp, resize: "vertical" }} value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} /></div>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800 }}>Komu zapsat ({vybrani.length})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={{ ...ghost, padding: "5px 10px", fontSize: 13 }} onClick={() => setVybrani(lide.filter((e) => !zaznamV(e.id)).map((e) => e.id))}>Vybrat všechny bez docházky</button>
              <button type="button" style={{ ...ghost, padding: "5px 10px", fontSize: 13 }} onClick={() => setVybrani([])}>Zrušit výběr</button>
            </div>
          </div>
          <input type="search" aria-label="Hledat zaměstnance" placeholder="Hledat zaměstnance…" style={inp} value={hledat} onChange={(e) => setHledat(e.target.value)} />
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 10, maxHeight: 260, overflow: "auto" }}>
            {lide.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "#64748b" }}>Nikdo nenalezen.</div>}
            {lide.map((e, i) => {
              const ma = zaznamV(e.id);
              return (
                <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? "1px solid #f1f5f9" : "none", cursor: "pointer", fontSize: 14, background: vybrani.includes(e.id) ? "#eff6ff" : "#fff" }}>
                  <input type="checkbox" checked={vybrani.includes(e.id)} onChange={() => prepnout(e.id)} style={{ width: 18, height: 18 }} />
                  <span style={{ flexGrow: 1 }}>{e.name}{e.position ? <span style={{ color: "#64748b", fontSize: 12 }}> · {e.position}</span> : null}</span>
                  {ma && <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 6, padding: "1px 7px" }}>už má {cas(ma.checkin)}–{cas(ma.checkout) || "?"}</span>}
                </label>
              );
            })}
          </div>
          {kolikPrepise > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#92400e" }}>
              <input type="checkbox" checked={prepsat} onChange={(e) => setPrepsat(e.target.checked)} />
              Přepsat docházku i u {kolikPrepise} {kolikPrepise === 1 ? "vybraného, který ji už má" : "vybraných, kteří ji už mají"} (jinak se přeskočí)
            </label>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={ghost} disabled={ukladam} onClick={onClose}>Zrušit</button>
          <button type="button" style={btn(vybrani.length ? "#0369a1" : "#94a3b8")} disabled={ukladam || !vybrani.length} onClick={ulozit}>
            {ukladam ? "Zapisuji…" : `Zapsat ${vybrani.length || ""} ${vybrani.length === 1 ? "zaměstnanci" : "zaměstnancům"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
