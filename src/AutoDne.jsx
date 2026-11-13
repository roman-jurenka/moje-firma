// ─── Kniha jízd: „Kterým autem jsem dnes jel“ ─────────────────────────────────
// Zaměstnanec vybere z aut, která ten den podle GPS Dozoru jela, to své. Zakázka
// se vezme z jeho kalendáře a km auta za den se samy zapíšou jako náklad Doprava
// na zakázku (databáze: jizdy_vybrat_auto → jizdy_prepocitat). Když se zakázka do
// kalendáře doplní později, náklad se přepočítá sám. Ochrana (jedno auto = jeden
// řidič, zamčení schválené/vyfakturované dopravy, max. 14 dní zpět…) je v databázi.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const cas = (t) => String(t || "").slice(0, 5);
const km = (v) => `${(Math.round((Number(v) || 0) * 10) / 10).toLocaleString("cs-CZ")} km`;

export default function AutoDne({ currentUser, employees = [] }) {
  const vedeni = ["admin", "hr", "manager"].includes(currentUser?.role);
  const ja = currentUser?.employeeId || null;
  const [datum, setDatum] = useState(() => iso(new Date()));
  const [za, setZa] = useState(ja ? String(ja) : ""); // vedení může vybrat za někoho jiného
  const [auta, setAuta] = useState(null);
  const [zakazky, setZakazky] = useState([]); // zakázky zaměstnance v kalendáři na den
  const [pracuji, setPracuji] = useState("");
  const [chyba, setChyba] = useState("");

  const nacist = useCallback(async () => {
    const emp = Number(za) || ja;
    const [a, k] = await Promise.all([
      supabase.rpc("jizdy_auta_dne", { p_datum: datum }),
      emp ? supabase.from("calendar_events").select("contract_id, prubeh_id, title, customer_name").eq("date", datum).eq("employee_id", emp) : Promise.resolve({ data: [] }),
    ]);
    if (a.error) setChyba(a.error.message);
    setAuta(a.data || []);
    const akce = (k.data || []).filter((e) => e.contract_id || e.prubeh_id);
    const ids = [...new Set(akce.map((e) => e.contract_id).filter(Boolean))];
    const { data: cs } = ids.length ? await supabase.from("contracts").select("id, name").in("id", ids) : { data: [] };
    setZakazky([...new Set(akce.map((e) => (cs || []).find((c) => c.id === e.contract_id)?.name || e.title || e.customer_name).filter(Boolean))]);
  }, [datum, za, ja]);
  useEffect(() => { Promise.resolve().then(nacist); }, [nacist]);

  const vybrat = async (a) => {
    setPracuji(a.kod); setChyba("");
    const { error } = await supabase.rpc("jizdy_vybrat_auto", { p_datum: datum, p_kod: a.kod, p_employee_id: vedeni && za ? Number(za) : null });
    if (error) setChyba(error.message);
    await nacist(); setPracuji("");
  };
  const zrusit = async (a) => {
    if (!window.confirm(`Zrušit výběr auta ${a.nazev}? Doprava z tohoto dne se u zakázky smaže.`)) return;
    setPracuji(a.kod); setChyba("");
    const { error } = await supabase.rpc("jizdy_zrusit_vyber", { p_id: a.vyber_id });
    if (error) setChyba(error.message);
    await nacist(); setPracuji("");
  };

  const empId = Number(za) || ja;
  const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });

  return (
    <section aria-label="Kterým autem jste jel" style={{ background: "#fff", border: "1px solid #E3E6EA", borderLeft: "3px solid #0369a1", borderRadius: 10, padding: 14, marginBottom: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>🚐 Kterým autem jste jel?</b>
        <input type="date" value={datum} max={iso(new Date())} onChange={(e) => setDatum(e.target.value)}
          style={{ border: "1px solid #CDD2D8", borderRadius: 6, padding: "6px 8px", fontFamily: "inherit" }} aria-label="Den" />
        {vedeni && (
          <select value={za} onChange={(e) => setZa(e.target.value)} aria-label="Zaměstnanec"
            style={{ border: "1px solid #CDD2D8", borderRadius: 6, padding: "6px 8px", fontFamily: "inherit" }}>
            <option value="">— zaměstnanec —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "#64748b" }}>
        Vyberte auto, kterým jste ten den jel. Km z GPS se samy připíšou jako doprava k zakázce z vašeho kalendáře
        {zakazky.length ? <> — dnes: <b style={{ color: "#0f172a" }}>{zakazky.join(", ")}</b>{zakazky.length > 1 ? " (km se rozdělí rovným dílem)" : ""}.</> : <>. <b style={{ color: "#b45309" }}>Na tento den zatím v kalendáři zakázku nemáte</b> — km se připíšou samy, jakmile ji tam někdo doplní.</>}
      </div>
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{chyba}</div>}
      {auta === null ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Načítám auta…</div>
        : auta.length === 0 ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Tento den podle GPS nejelo žádné auto (nebo se jízdy ještě nestáhly — stahují se během dne).</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
            {auta.map((a) => {
              const moje = a.ridic_id && a.ridic_id === empId;
              const cizi = a.ridic_id && !moje;
              return (
                <div key={a.kod} style={{ border: `1px solid ${moje ? "#0369a1" : "#E3E6EA"}`, background: moje ? "#EFF6FF" : "#fff", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 800 }}>{a.nazev} <span style={{ fontWeight: 500, color: "#64748b", fontSize: 12 }}>{a.spz}</span></div>
                  <div style={{ fontSize: 12.5, color: "#475569" }}>{a.jizd} {a.jizd === 1 ? "jízda" : a.jizd < 5 ? "jízdy" : "jízd"} · {km(a.km)} · {cas(a.prvni)}–{cas(a.posledni)}</div>
                  {a.ridic && <div style={{ fontSize: 12.5 }}>👤 {a.ridic}</div>}
                  {moje && (a.zakazky
                    ? <div style={{ fontSize: 12.5, color: "#166534" }}>✓ {km(a.naklad_km)} připsáno: {a.zakazky}</div>
                    : <div style={{ fontSize: 12.5, color: "#b45309" }}>Čeká na zakázku v kalendáři</div>)}
                  <div style={{ marginTop: 4 }}>
                    {moje ? <button type="button" style={btn("#e2e8f0", "#334155")} disabled={!!pracuji} onClick={() => zrusit(a)}>Zrušit výběr</button>
                      : cizi ? <span style={{ fontSize: 12, color: "#94a3b8" }}>Vybral(a) {a.ridic}</span>
                      : <button type="button" style={btn("#0369a1")} disabled={!!pracuji || !empId} onClick={() => vybrat(a)}>{pracuji === a.kod ? "Ukládám…" : "Jel jsem tímto autem"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
