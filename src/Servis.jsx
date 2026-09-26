// ─── Servis: servisní tickety navázané na zakázky ────────────────────────────
// Ticket zakládá kancelář i technik v terénu. Stavy Nový → Naplánovaný →
// V řešení → Čeká na díl → Vyřešený → Vyfakturovaný (+ Zrušený). Přiřazený
// technik dostane push notifikaci (trigger v DB) a událost v kalendáři.
// Fotky a práce/materiál se ukládají k zakázce s odkazem na ticket, takže se
// počítají do nákladů zakázky jako všechno ostatní.
// Použití: samostatná záložka menu (Servis) i záložka v detailu zakázky
// (contractId = jen tickety té zakázky).

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import * as ui from "./ui.js";
import { nahratFotkuZakazky, pocetFotekText } from "./fotkyZakazky.js";
import { OneDriveThumb, StorageLink } from "./storageUrl.jsx";

const STAVY_TICKETU = ["Nový", "Naplánovaný", "V řešení", "Čeká na díl", "Vyřešený", "Vyfakturovaný", "Zrušený"];
const STAV_BARVA = {
  "Nový": ui.barvy.primarni, "Naplánovaný": ui.barvy.fialova, "V řešení": ui.barvy.varovani, "Čeká na díl": "#b45309",
  "Vyřešený": ui.barvy.uspech, "Vyfakturovaný": ui.barvy.textMekky, "Zrušený": ui.barvy.neutralni,
};
const UZAVRENE = ["Vyřešený", "Vyfakturovaný", "Zrušený"];
const PRIORITY = [["Nízká", ui.barvy.neutralni], ["Střední", ui.barvy.primarni], ["Vysoká", ui.barvy.chyba]];
const DOPRAVA_KC_KM = 6.5; // stejná sazba jako v Knize jízd

const fmtKc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;
const fmtDatum = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("cs-CZ") : "");
const dnes = () => new Date().toLocaleDateString("sv-SE");

const prazdnyFormular = (contractId = "") => ({
  contract_id: contractId ? String(contractId) : "", hledat: "", nazev: "", popis: "", priorita: "Střední", placeny: false,
  technik_id: "", termin: "", adresa: "", kontakt: "", telefon: "",
});

export default function Servis({ contracts = [], customers = [], employees = [], currentUser, setCalendarEvents, contractId = null }) {
  const vlozeny = !!contractId;
  const [tickety, setTickety] = useState([]);
  const [nacteno, setNacteno] = useState(false);
  const [filtr, setFiltr] = useState("otevrene");
  const [hledat, setHledat] = useState("");
  const [formular, setFormular] = useState(null);     // nový / upravovaný ticket
  const [detailId, setDetailId] = useState(null);
  const [ukladam, setUkladam] = useState(false);

  useEffect(() => {
    let q = supabase.from("service_tickets").select("*").order("created_at", { ascending: false });
    if (contractId) q = q.eq("contract_id", contractId);
    q.then(({ data }) => { setTickety(data || []); setNacteno(true); });
  }, [contractId]);

  const zakazka = (id) => contracts.find((c) => c.id === Number(id));
  const zakaznik = (id) => customers.find((c) => c.id === Number(id));
  const technik = (id) => employees.find((e) => e.id === Number(id));
  const technici = employees.filter((e) => !e.archived && (!e.status || e.status === "Aktivní"));
  const mojeId = currentUser?.employeeId;

  // ── Kalendář technika: událost se drží v souladu s technikem a termínem ──
  const synchronizovatKalendar = async (t) => {
    const k = zakazka(t.contract_id);
    const z = zakaznik(t.customer_id);
    const chceUdalost = t.technik_id && t.termin && t.stav !== "Zrušený";
    if (!chceUdalost) {
      if (t.calendar_event_id) {
        await supabase.from("calendar_events").delete().eq("id", t.calendar_event_id);
        setCalendarEvents?.((ev) => ev.filter((e) => e.id !== t.calendar_event_id));
        await supabase.from("service_tickets").update({ calendar_event_id: null }).eq("id", t.id);
        return { ...t, calendar_event_id: null };
      }
      return t;
    }
    const udalost = {
      employee_id: Number(t.technik_id), employee_name: technik(t.technik_id)?.name || null, date: t.termin,
      work_type: "Servis", title: `🔧 ${t.cislo} ${t.nazev}`, customer_name: z?.name || null, customer_company: z?.company || null,
      address: t.adresa || k?.address || null, contact_name: t.kontakt || null, contact_phone: t.telefon || null,
      work_description: [t.popis, k ? `Zakázka ${k.code || ""} ${k.name}` : null, t.placeny ? "Placený servis" : "Záruka"].filter(Boolean).join("\n"),
      contract_id: t.contract_id,
    };
    if (t.calendar_event_id) {
      const { data } = await supabase.from("calendar_events").update(udalost).eq("id", t.calendar_event_id).select().single();
      if (data) { setCalendarEvents?.((ev) => ev.map((e) => (e.id === data.id ? data : e))); return t; }
    }
    const { data: nova } = await supabase.from("calendar_events").insert(udalost).select().single();
    if (!nova) return t;
    setCalendarEvents?.((ev) => [...ev, nova]);
    await supabase.from("service_tickets").update({ calendar_event_id: nova.id }).eq("id", t.id);
    return { ...t, calendar_event_id: nova.id };
  };

  const ulozitTicket = async () => {
    const f = formular;
    if (!f.contract_id) { alert("Vyber zakázku, ke které servis patří."); return; }
    if (!f.nazev.trim()) { alert("Napiš krátce, co nefunguje."); return; }
    setUkladam(true);
    const k = zakazka(f.contract_id);
    const zaznam = {
      contract_id: Number(f.contract_id), customer_id: k?.customer_id || null, nazev: f.nazev.trim(), popis: f.popis.trim() || null,
      priorita: f.priorita, placeny: f.placeny, technik_id: f.technik_id ? Number(f.technik_id) : null, termin: f.termin || null,
      adresa: f.adresa.trim() || null, kontakt: f.kontakt.trim() || null, telefon: f.telefon.trim() || null,
    };
    // S technikem a termínem je ticket rovnou naplánovaný.
    if (!f.id && zaznam.technik_id && zaznam.termin) zaznam.stav = "Naplánovaný";
    const dotaz = f.id
      ? supabase.from("service_tickets").update(zaznam).eq("id", f.id).select().single()
      : supabase.from("service_tickets").insert({ ...zaznam, zalozil: currentUser?.name || null }).select().single();
    const { data, error } = await dotaz;
    if (error) { setUkladam(false); alert("Ticket se nepodařilo uložit: " + error.message); return; }
    const t = await synchronizovatKalendar(data);
    setTickety((ts) => (f.id ? ts.map((x) => (x.id === t.id ? t : x)) : [t, ...ts]));
    setUkladam(false);
    setFormular(null);
    setDetailId(t.id);
  };

  const zmenitStav = async (t, stav) => {
    const patch = { stav, vyreseno_at: ["Vyřešený", "Vyfakturovaný"].includes(stav) ? (t.vyreseno_at || new Date().toISOString()) : null };
    const { data, error } = await supabase.from("service_tickets").update(patch).eq("id", t.id).select().single();
    if (error) { alert("Stav se nepodařilo změnit: " + error.message); return; }
    const nove = await synchronizovatKalendar(data);
    setTickety((ts) => ts.map((x) => (x.id === nove.id ? nove : x)));
  };

  const ulozitReseni = async (t, reseni) => {
    const { data, error } = await supabase.from("service_tickets").update({ reseni: reseni.trim() || null }).eq("id", t.id).select().single();
    if (error) { alert("Řešení se nepodařilo uložit: " + error.message); return; }
    setTickety((ts) => ts.map((x) => (x.id === data.id ? data : x)));
  };

  const otevritFormular = (t) => {
    if (!t) { setFormular(prazdnyFormular(contractId)); return; }
    setFormular({
      id: t.id, contract_id: String(t.contract_id), hledat: "", nazev: t.nazev || "", popis: t.popis || "", priorita: t.priorita,
      placeny: t.placeny, technik_id: t.technik_id ? String(t.technik_id) : "", termin: t.termin || "",
      adresa: t.adresa || "", kontakt: t.kontakt || "", telefon: t.telefon || "",
    });
  };

  // ── Seznam ──
  const q = hledat.trim().toLowerCase();
  const viditelne = tickety
    .filter((t) => filtr === "vse"
      || (filtr === "otevrene" && !UZAVRENE.includes(t.stav))
      || (filtr === "moje" && !UZAVRENE.includes(t.stav) && mojeId && t.technik_id === mojeId)
      || (filtr === "vyresene" && UZAVRENE.includes(t.stav)))
    .filter((t) => !q || [t.cislo, t.nazev, t.popis, zakazka(t.contract_id)?.name, zakazka(t.contract_id)?.code, zakaznik(t.customer_id)?.name, technik(t.technik_id)?.name]
      .some((x) => String(x || "").toLowerCase().includes(q)));
  const pocet = (fn) => tickety.filter(fn).length;
  const filtry = [
    ["otevrene", "Otevřené", pocet((t) => !UZAVRENE.includes(t.stav))],
    ...(mojeId ? [["moje", "Moje", pocet((t) => !UZAVRENE.includes(t.stav) && t.technik_id === mojeId)]] : []),
    ["vyresene", "Vyřešené", pocet((t) => UZAVRENE.includes(t.stav))],
    ["vse", "Vše", tickety.length],
  ];
  const detail = tickety.find((t) => t.id === detailId);

  return (
    <div style={{ textAlign: "left" }}>
      {!vlozeny ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <h1 style={ui.nadpis}>Servis</h1>
          <button type="button" style={ui.tlacitko()} onClick={() => otevritFormular(null)}><i className="ti ti-plus" aria-hidden="true"></i> Nový ticket</button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button type="button" style={ui.tlacitko(undefined, "male")} onClick={() => otevritFormular(null)}><i className="ti ti-plus" aria-hidden="true"></i> Nový servisní ticket</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {filtry.map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setFiltr(id)} aria-pressed={filtr === id}
            style={filtr === id ? ui.tlacitko(ui.barvy.primarniTmava, "male") : ui.tlacitkoObrys("male")}>{label} ({n})</button>
        ))}
        {!vlozeny && <input style={{ ...ui.pole, maxWidth: 280, marginLeft: "auto" }} value={hledat} placeholder="Hledat ticket, zakázku, zákazníka…" onChange={(e) => setHledat(e.target.value)} />}
      </div>

      {!nacteno ? <div style={{ color: ui.barvy.textSlaby }}>Načítám…</div>
        : viditelne.length === 0 ? (
          <div style={{ ...ui.karta, textAlign: "center", color: ui.barvy.textSlaby }}>
            {tickety.length === 0 ? "Zatím žádné servisní tickety." : "Tady teď nic není."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {viditelne.map((t) => {
              const k = zakazka(t.contract_id);
              const poTerminu = t.termin && t.termin < dnes() && !UZAVRENE.includes(t.stav);
              return (
                <button key={t.id} type="button" onClick={() => setDetailId(t.id)}
                  style={{ ...ui.karta, padding: "12px 16px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                    borderLeft: `4px solid ${PRIORITY.find(([p]) => p === t.priorita)?.[1] || ui.barvy.okraj}` }}>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: ui.barvy.textSlaby, fontWeight: 700 }}>{t.cislo} · {t.placeny ? "Placený" : "Záruka"}{t.priorita === "Vysoká" ? " · spěchá" : ""}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: ui.barvy.text }}>{t.nazev}</div>
                    {!vlozeny && <div style={{ fontSize: 12, color: ui.barvy.textMekky }}>{[k?.code, k?.name, zakaznik(t.customer_id)?.name].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: poTerminu ? ui.barvy.chyba : ui.barvy.textMekky, fontWeight: poTerminu ? 700 : 400, minWidth: 130 }}>
                    <div><i className="ti ti-user" aria-hidden="true"></i> {technik(t.technik_id)?.name || "bez technika"}</div>
                    <div><i className="ti ti-calendar" aria-hidden="true"></i> {t.termin ? fmtDatum(t.termin) : "bez termínu"}</div>
                  </div>
                  <span style={ui.stitek(STAV_BARVA[t.stav])}>{t.stav}</span>
                </button>
              );
            })}
          </div>
        )}

      {formular && (
        <FormularTicketu formular={formular} setFormular={setFormular} zakazky={contracts} zakazka={zakazka} zakaznik={zakaznik}
          technici={technici} pevnaZakazka={vlozeny} ukladam={ukladam} onUlozit={ulozitTicket} />
      )}

      {detail && !formular && (
        <DetailTicketu key={detail.id} t={detail} zakazka={zakazka(detail.contract_id)} zakaznik={zakaznik(detail.customer_id)} technik={technik(detail.technik_id)}
          employees={employees} currentUser={currentUser} onZavrit={() => setDetailId(null)} onUpravit={() => otevritFormular(detail)}
          onStav={(s) => zmenitStav(detail, s)} onReseni={(r) => ulozitReseni(detail, r)} />
      )}
    </div>
  );
}

// ── Formulář nového / upravovaného ticketu ──
function FormularTicketu({ formular: f, setFormular, zakazky, zakazka, zakaznik, technici, pevnaZakazka, ukladam, onUlozit }) {
  const set = (patch) => setFormular({ ...f, ...patch });
  const vybrana = zakazka(f.contract_id);
  const vybratZakazku = (k) => {
    const z = zakaznik(k.customer_id);
    set({ contract_id: String(k.id), adresa: f.adresa || k.address || z?.address || "", kontakt: f.kontakt || z?.name || "", telefon: f.telefon || z?.phone || "" });
  };
  const q = f.hledat.trim().toLowerCase();
  const nalezene = zakazky
    .filter((k) => !q || [k.name, k.code, zakaznik(k.customer_id)?.name, k.address].some((x) => String(x || "").toLowerCase().includes(q)))
    .slice(0, 6);

  return (
    <div role="dialog" aria-modal="true" aria-label={f.id ? "Upravit ticket" : "Nový servisní ticket"} style={ui.okno}
      onClick={(e) => { if (e.target === e.currentTarget) setFormular(null); }}>
      <div style={{ ...ui.oknoObsah, width: 560, textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{f.id ? "Upravit ticket" : "Nový servisní ticket"}</div>

        <div>
          <label style={ui.popisek}>Zakázka *</label>
          {vybrana ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "8px 12px" }}>
              <i className="ti ti-file-invoice" aria-hidden="true" style={{ fontSize: 18, color: ui.barvy.primarni }}></i>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{[vybrana.code, vybrana.name].filter(Boolean).join(" · ")}</div>
                <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>{[zakaznik(vybrana.customer_id)?.name, vybrana.address].filter(Boolean).join(" · ")}</div>
              </div>
              {!pevnaZakazka && !f.id && <button type="button" style={ui.tlacitkoObrys("male")} onClick={() => set({ contract_id: "" })}>Změnit</button>}
            </div>
          ) : (
            <>
              <input style={ui.pole} autoFocus value={f.hledat} placeholder="Hledat zakázku, kód nebo zákazníka…" onChange={(e) => set({ hledat: e.target.value })} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
                {nalezene.length === 0 && <div style={{ fontSize: 13, color: ui.barvy.textSlaby, padding: 6 }}>Žádná zakázka nenalezena.</div>}
                {nalezene.map((k) => (
                  <button key={k.id} type="button" onClick={() => vybratZakazku(k)}
                    style={{ textAlign: "left", background: ui.barvy.poleBg, border: `1px solid ${ui.barvy.okraj}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{[k.code, k.name].filter(Boolean).join(" · ")}</div>
                    <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>{[zakaznik(k.customer_id)?.name, k.address, k.status].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div><label style={ui.popisek} htmlFor="st-nazev">Co nefunguje *</label>
          <input id="st-nazev" style={ui.pole} value={f.nazev} placeholder="např. Střídač hlásí chybu izolace" onChange={(e) => set({ nazev: e.target.value })} /></div>
        <div><label style={ui.popisek} htmlFor="st-popis">Popis</label>
          <textarea id="st-popis" style={{ ...ui.pole, minHeight: 70, resize: "vertical" }} value={f.popis} placeholder="Co zákazník hlásí, od kdy, kód chyby…" onChange={(e) => set({ popis: e.target.value })} /></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={ui.popisek}>Priorita</label>
            <div style={{ display: "flex", gap: 4 }}>
              {PRIORITY.map(([p, c]) => (
                <button key={p} type="button" aria-pressed={f.priorita === p} onClick={() => set({ priorita: p })}
                  style={{ ...(f.priorita === p ? ui.tlacitko(c, "male") : ui.tlacitkoObrys("male")), flex: 1 }}>{p}</button>
              ))}
            </div></div>
          <div><label style={ui.popisek}>Druh</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[[false, "Záruka"], [true, "Placený"]].map(([v, label]) => (
                <button key={label} type="button" aria-pressed={f.placeny === v} onClick={() => set({ placeny: v })}
                  style={{ ...(f.placeny === v ? ui.tlacitko(ui.barvy.primarniTmava, "male") : ui.tlacitkoObrys("male")), flex: 1 }}>{label}</button>
              ))}
            </div></div>
          <div><label style={ui.popisek} htmlFor="st-technik">Technik</label>
            <select id="st-technik" style={ui.pole} value={f.technik_id} onChange={(e) => set({ technik_id: e.target.value })}>
              <option value="">— zatím nikdo —</option>
              {technici.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div><label style={ui.popisek} htmlFor="st-termin">Termín</label>
            <input id="st-termin" type="date" style={ui.pole} value={f.termin} onChange={(e) => set({ termin: e.target.value })} /></div>
        </div>

        <div><label style={ui.popisek} htmlFor="st-adresa">Adresa</label>
          <input id="st-adresa" style={ui.pole} value={f.adresa} placeholder="předvyplní se ze zakázky" onChange={(e) => set({ adresa: e.target.value })} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={ui.popisek} htmlFor="st-kontakt">Kontakt na místě</label>
            <input id="st-kontakt" style={ui.pole} value={f.kontakt} onChange={(e) => set({ kontakt: e.target.value })} /></div>
          <div><label style={ui.popisek} htmlFor="st-tel">Telefon</label>
            <input id="st-tel" type="tel" style={ui.pole} value={f.telefon} onChange={(e) => set({ telefon: e.target.value })} /></div>
        </div>
        {f.technik_id && <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>Technik dostane upozornění do telefonu{f.termin ? " a servis se mu zapíše do kalendáře" : ""}.</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={ui.tlacitkoObrys()} onClick={() => setFormular(null)}>Zrušit</button>
          <button type="button" style={ui.tlacitko()} disabled={ukladam} onClick={onUlozit}>{ukladam ? "Ukládám…" : f.id ? "Uložit změny" : "Založit ticket"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Detail ticketu: stav, řešení, fotky, práce a materiál ──
function DetailTicketu({ t, zakazka, zakaznik, technik, employees, currentUser, onZavrit, onUpravit, onStav, onReseni }) {
  const [reseni, setReseni] = useState(t.reseni || "");
  const [fotky, setFotky] = useState([]);
  const [naklady, setNaklady] = useState([]);
  const [nahravam, setNahravam] = useState(false);
  const [polozka, setPolozka] = useState(null);
  const fotoInput = useRef(null);

  useEffect(() => {
    supabase.from("contract_photos").select("*").eq("ticket_id", t.id).order("created_at", { ascending: false }).then(({ data }) => setFotky(data || []));
    supabase.from("contract_cost_entries").select("*").eq("ticket_id", t.id).order("date").then(({ data }) => setNaklady(data || []));
  }, [t.id]);

  const nahrat = async (files) => {
    setNahravam(true);
    let n = 0;
    for (const f of files) {
      try {
        const row = await nahratFotkuZakazky(f, { slozka: zakazka?.name || t.cislo, contractId: t.contract_id, ticketId: t.id, kategorie: "Servis", nahral: currentUser?.employeeId || null });
        setFotky((p) => [row, ...p]); n++;
      } catch (e) { alert(`Fotku „${f.name}“ se nepodařilo nahrát: ${e.message}`); }
    }
    setNahravam(false);
    if (n) alert(`Nahráno ${pocetFotekText(n)}.`);
  };

  // Nová položka práce / materiálu / dopravy. Sazby technika se předvyplní;
  // u záruky zákazník neplatí (cena pro klienta 0), náklad se ale počítá.
  const novaPolozka = (typ) => {
    const tech = employees.find((e) => e.id === (t.technik_id || currentUser?.employeeId));
    const vychozi = {
      "práce": { popis: "Servisní práce", jednotka: "h", naklad: tech?.hourly_rate_cost || "", klient: tech?.hourly_rate_client || "" },
      "materiál": { popis: "", jednotka: "ks", naklad: "", klient: "" },
      "doprava": { popis: "Doprava", jednotka: "km", naklad: DOPRAVA_KC_KM, klient: DOPRAVA_KC_KM },
    }[typ];
    setPolozka({ typ, mnozstvi: "", ...vychozi, klient: t.placeny ? vychozi.klient : 0 });
  };
  const ulozitPolozku = async () => {
    const p = polozka;
    const mn = Number(String(p.mnozstvi).replace(",", "."));
    if (!(mn > 0)) { alert("Zadej množství."); return; }
    const naklad = Number(String(p.naklad).replace(",", ".")) || 0;
    const klient = Number(String(p.klient).replace(",", ".")) || 0;
    const { data, error } = await supabase.from("contract_cost_entries").insert({
      contract_id: t.contract_id, ticket_id: t.id, cost_type: p.typ, is_extra: false, date: dnes(),
      description: `[${t.cislo}] ${p.popis || p.typ}`, quantity: mn, unit: p.jednotka,
      unit_price_cost: naklad, unit_price_client: klient, amount_cost: mn * naklad, amount_client: mn * klient,
      employee_id: p.typ === "práce" ? (t.technik_id || currentUser?.employeeId || null) : null,
    }).select().single();
    if (error) { alert("Položku se nepodařilo uložit: " + error.message); return; }
    setNaklady((n) => [...n, data]);
    setPolozka(null);
  };
  const smazatPolozku = async (id) => {
    if (!confirm("Smazat položku?")) return;
    const { error } = await supabase.from("contract_cost_entries").delete().eq("id", id);
    if (!error) setNaklady((n) => n.filter((x) => x.id !== id));
  };
  const soucetNaklad = naklady.reduce((s, x) => s + (Number(x.amount_cost) || 0), 0);
  const soucetKlient = naklady.reduce((s, x) => s + (Number(x.amount_client) || 0), 0);

  const sekce = { borderTop: `1px solid ${ui.barvy.okraj}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 };
  const nadpisSekce = { fontWeight: 800, fontSize: 14 };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Ticket ${t.cislo}`} style={ui.okno} onClick={(e) => { if (e.target === e.currentTarget) onZavrit(); }}>
      <div style={{ ...ui.oknoObsah, width: 640, textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: ui.barvy.textSlaby, fontWeight: 700 }}>{t.cislo} · {t.placeny ? "Placený servis" : "Záruka"} · priorita {t.priorita.toLowerCase()}</div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{t.nazev}</div>
            <div style={{ fontSize: 13, color: ui.barvy.textMekky }}>{[zakazka?.code, zakazka?.name, zakaznik?.name].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" aria-label="Zavřít" onClick={onZavrit} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: ui.barvy.textSlaby }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        <div role="group" aria-label="Stav ticketu" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STAVY_TICKETU.map((s) => (
            <button key={s} type="button" aria-pressed={t.stav === s} onClick={() => t.stav !== s && onStav(s)}
              style={t.stav === s ? ui.tlacitko(STAV_BARVA[s], "male") : { ...ui.tlacitkoObrys("male"), color: ui.barvy.textMekky, borderColor: ui.barvy.okraj }}>{s}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
          <div><span style={ui.popisek}>Technik</span>{technik?.name || "—"}</div>
          <div><span style={ui.popisek}>Termín</span>{t.termin ? fmtDatum(t.termin) : "—"}</div>
          <div><span style={ui.popisek}>Adresa</span>{t.adresa || zakazka?.address || "—"}</div>
          <div><span style={ui.popisek}>Kontakt</span>{[t.kontakt, t.telefon].filter(Boolean).join(" · ") || "—"}</div>
          {t.popis && <div style={{ gridColumn: "1 / -1" }}><span style={ui.popisek}>Popis</span><div style={{ whiteSpace: "pre-wrap" }}>{t.popis}</div></div>}
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: ui.barvy.textSlaby }}>Založil {t.zalozil || "?"} {new Date(t.created_at).toLocaleDateString("cs-CZ")}</div>
        </div>
        <div><button type="button" style={ui.tlacitkoObrys("male")} onClick={onUpravit}><i className="ti ti-pencil" aria-hidden="true"></i> Upravit (technik, termín…)</button></div>

        <div style={sekce}>
          <div style={nadpisSekce}>Řešení</div>
          <textarea style={{ ...ui.pole, minHeight: 60, resize: "vertical" }} value={reseni} placeholder="Co se udělalo, vyměněné díly, sériová čísla…" onChange={(e) => setReseni(e.target.value)} />
          {reseni !== (t.reseni || "") && <div><button type="button" style={ui.tlacitko(undefined, "male")} onClick={() => onReseni(reseni)}>Uložit řešení</button></div>}
        </div>

        <div style={sekce}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={nadpisSekce}>Fotky ({fotky.length})</span>
            <button type="button" style={ui.tlacitkoObrys("male")} disabled={nahravam} onClick={() => fotoInput.current?.click()}>
              <i className="ti ti-camera" aria-hidden="true"></i> {nahravam ? "Nahrávám…" : "Nahrát fotky"}</button>
            <input ref={fotoInput} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; nahrat(fs); }} />
          </div>
          {fotky.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {fotky.map((p) => (
                <StorageLink key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: `1px solid ${ui.barvy.okraj}` }}>
                  <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt="fotka" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </StorageLink>
              ))}
            </div>
          )}
        </div>

        <div style={sekce}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span style={nadpisSekce}>Práce a materiál</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[["práce", "ti-clock", "Práce"], ["materiál", "ti-package", "Materiál"], ["doprava", "ti-car", "Doprava"]].map(([typ, ikona, label]) => (
                <button key={typ} type="button" style={ui.tlacitkoObrys("male")} onClick={() => novaPolozka(typ)}><i className={`ti ${ikona}`} aria-hidden="true"></i> {label}</button>
              ))}
            </div>
          </div>
          {polozka && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 6, alignItems: "end", background: ui.barvy.poleBg, border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10 }}>
              <div><label style={ui.popisek}>Popis</label><input style={ui.pole} autoFocus={polozka.typ === "materiál"} value={polozka.popis} onChange={(e) => setPolozka({ ...polozka, popis: e.target.value })} /></div>
              <div><label style={ui.popisek}>Množství ({polozka.jednotka})</label><input style={ui.pole} inputMode="decimal" autoFocus={polozka.typ !== "materiál"} value={polozka.mnozstvi} onChange={(e) => setPolozka({ ...polozka, mnozstvi: e.target.value })} /></div>
              <div><label style={ui.popisek}>Náklad / {polozka.jednotka}</label><input style={ui.pole} inputMode="decimal" value={polozka.naklad} onChange={(e) => setPolozka({ ...polozka, naklad: e.target.value })} /></div>
              <div><label style={ui.popisek}>Zákazník / {polozka.jednotka}</label><input style={ui.pole} inputMode="decimal" value={polozka.klient} disabled={!t.placeny} title={t.placeny ? "" : "Záruka — zákazník neplatí"} onChange={(e) => setPolozka({ ...polozka, klient: e.target.value })} /></div>
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" style={ui.tlacitkoObrys("male")} onClick={() => setPolozka(null)}>Zrušit</button>
                <button type="button" style={ui.tlacitko(undefined, "male")} onClick={ulozitPolozku}>Přidat</button>
              </div>
            </div>
          )}
          {naklady.length === 0 ? <div style={{ fontSize: 13, color: ui.barvy.textSlaby }}>Zatím nic zapsáno. Položky se počítají do nákladů zakázky.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Datum", "Položka", "Množství", "Náklad", t.placeny ? "Zákazník" : "", ""].map((h, i) => <th key={i} style={ui.th}>{h}</th>)}</tr></thead>
              <tbody>
                {naklady.map((x) => (
                  <tr key={x.id}>
                    <td style={ui.td}>{fmtDatum(x.date)}</td>
                    <td style={ui.td}>{String(x.description || "").replace(`[${t.cislo}] `, "")}</td>
                    <td style={ui.td}>{x.quantity} {x.unit}</td>
                    <td style={ui.td}>{fmtKc(x.amount_cost)}</td>
                    <td style={ui.td}>{t.placeny ? fmtKc(x.amount_client) : ""}</td>
                    <td style={ui.td}><button type="button" aria-label="Smazat položku" onClick={() => smazatPolozku(x.id)} style={{ background: "none", border: "none", color: ui.barvy.chyba, cursor: "pointer" }}><i className="ti ti-trash" aria-hidden="true"></i></button></td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...ui.td, fontWeight: 700 }} colSpan={3}>Celkem</td>
                  <td style={{ ...ui.td, fontWeight: 700 }}>{fmtKc(soucetNaklad)}</td>
                  <td style={{ ...ui.td, fontWeight: 700 }}>{t.placeny ? fmtKc(soucetKlient) : ""}</td>
                  <td style={ui.td}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
