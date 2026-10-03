// ─── Podklady pro realizaci — náhled (kalendář, Průběh) a formulář (Průběh) ───
import { SEKCE_PODKLADU, hodnota, vyplneneSekce, sekceProNaStarosti } from "./podkladyZakazky.js";
import { specifikaceZNabidky } from "./dokumentyZakazky.js";
import { naStarosti } from "./dovednosti.js";

const box = { padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 10 };
const nadpis = { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 6 };
const radek = { fontSize: 14, color: "#1e293b", lineHeight: 1.5 };
const dvojice = (label, text) => (String(text ?? "").trim() ? (
  <div style={{ ...radek, display: "flex", gap: 6, flexWrap: "wrap" }}>
    <span style={{ color: "#64748b" }}>{label}:</span>
    <span style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{text}</span>
  </div>
) : null);

// zak = řádek zakazky_prubeh, quote = propojená nabídka, zakaznik = customers řádek,
// tym = [{ id, na_starosti, employee_name, date }], naStarostiId = co má divák na starosti
export function PodkladyNahled({ zak, quote, zakaznik, tym = [], naStarostiId = null }) {
  if (!zak) return null;
  const p = zak.podklady || {};
  const u = zak.udaje || {};
  const spec = quote ? specifikaceZNabidky(quote.data, "") : "";
  const adresa = zak.misto_adresa || zakaznik?.address || "";
  const sekce = vyplneneSekce(p);
  const moje = sekce.filter((s) => sekceProNaStarosti(s, naStarostiId));
  const ostatni = sekce.filter((s) => !sekceProNaStarosti(s, naStarostiId) && !["obecne", "technicka", "odberne"].includes(s.id));
  const blokSekce = (s, zvyraznit) => (
    <div key={s.id} style={{ ...box, ...(zvyraznit ? { background: "#fff7ed", border: "2px solid #fdba74" } : {}) }}>
      <div style={{ ...nadpis, color: zvyraznit ? "#c2410c" : nadpis.color }}>{s.ikona} {s.nazev}{zvyraznit ? " — pro tebe" : ""}</div>
      {s.pole.map((f) => <div key={f.id}>{dvojice(f.label, hodnota(p, s.id, f.id))}</div>)}
    </div>
  );
  const tymPodleCasti = tym.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <div>
      {moje.map((s) => blokSekce(s, true))}

      <div style={box}>
        <div style={nadpis}>📞 Kontakty</div>
        {zakaznik && dvojice("Zákazník", [zakaznik.name, zakaznik.company].filter(Boolean).join(", "))}
        {zakaznik?.phone && <div style={radek}><span style={{ color: "#64748b" }}>Telefon: </span><a href={`tel:${zakaznik.phone}`} style={{ color: "#0369a1", fontWeight: 600 }}>{zakaznik.phone}</a></div>}
        {zakaznik?.email && <div style={radek}><span style={{ color: "#64748b" }}>E-mail: </span><a href={`mailto:${zakaznik.email}`} style={{ color: "#0369a1" }}>{zakaznik.email}</a></div>}
        {(zak.misto_kontakt || zak.misto_telefon) && (
          <div style={radek}>
            <span style={{ color: "#64748b" }}>Na místě: </span><b>{zak.misto_kontakt}</b>{zak.misto_vztah && <span style={{ color: "#64748b" }}> ({zak.misto_vztah})</span>}
            {zak.misto_telefon && <> · <a href={`tel:${zak.misto_telefon}`} style={{ color: "#0369a1", fontWeight: 600 }}>{zak.misto_telefon}</a></>}
          </div>
        )}
        {adresa && <div style={radek}>📍 {adresa} · <a href={`https://mapy.cz/zakladni?q=${encodeURIComponent(adresa)}`} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>mapa</a></div>}
        {hodnota(p, "obecne", "odkaz_slozka") && <div style={radek}>📁 <a href={hodnota(p, "obecne", "odkaz_slozka")} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontWeight: 600 }}>Složka zakázky (nákresy, fotky)</a></div>}
        {dvojice("Obchodník", hodnota(p, "obecne", "oz") || zak.vlastnik_obchod)}
      </div>

      {tymPodleCasti.length > 0 && (
        <div style={box}>
          <div style={nadpis}>👷 Kdo co dělá</div>
          {tymPodleCasti.map((t) => (
            <div key={t.id} style={radek}>
              {naStarosti(t.na_starosti)?.ikona || "•"} <b>{naStarosti(t.na_starosti)?.label || "Práce"}:</b> {t.employee_name} — od {new Date(t.date + "T00:00:00").toLocaleDateString("cs-CZ")}
            </div>
          ))}
        </div>
      )}

      {(spec || sekce.some((s) => s.id === "technicka")) && (
        <div style={box}>
          <div style={nadpis}>⚙️ Technická specifikace</div>
          {spec && <div style={{ ...radek, whiteSpace: "pre-wrap", marginBottom: 6 }}>{spec}</div>}
          {SEKCE_PODKLADU.find((s) => s.id === "technicka").pole.map((f) => <div key={f.id}>{dvojice(f.label, hodnota(p, "technicka", f.id))}</div>)}
        </div>
      )}

      {(u.ean || u.jistic_a || u.faze || sekce.some((s) => s.id === "odberne")) && (
        <div style={box}>
          <div style={nadpis}>🔌 Odběrné místo</div>
          {dvojice("EAN", u.ean)}
          {dvojice("Hlavní jistič stávající", u.jistic_a ? `${u.jistic_a} A${u.faze ? ` / ${u.faze}f` : ""}` : "")}
          {SEKCE_PODKLADU.find((s) => s.id === "odberne").pole.map((f) => <div key={f.id}>{dvojice(f.label, hodnota(p, "odberne", f.id))}</div>)}
        </div>
      )}

      {ostatni.map((s) => blokSekce(s, false))}
      {sekce.length === 0 && !spec && <div style={{ fontSize: 13, color: "#94a3b8" }}>K zakázce zatím nejsou vyplněné podklady pro realizaci.</div>}
    </div>
  );
}

// Formulář: podklady = { [sekce]: { [pole]: text } }, onChange(nove)
export function PodkladyFormular({ podklady, onChange, inp, lbl }) {
  const p = podklady || {};
  const nastav = (sekce, pole, v) => onChange({ ...p, [sekce]: { ...(p[sekce] || {}), [pole]: v } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {SEKCE_PODKLADU.map((s) => (
        <fieldset key={s.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", margin: 0 }}>
          <legend style={{ fontWeight: 800, fontSize: 14, padding: "0 6px" }}>{s.ikona} {s.nazev}</legend>
          <div className="pr-podklady-pole" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {s.pole.map((f) => (
              <div key={f.id} style={f.dlouhe ? { gridColumn: "1 / -1" } : undefined}>
                <label style={lbl} htmlFor={`pod-${s.id}-${f.id}`}>{f.label}</label>
                {f.dlouhe
                  ? <textarea id={`pod-${s.id}-${f.id}`} style={{ ...inp, minHeight: 64, resize: "vertical" }} value={hodnota(p, s.id, f.id)} onChange={(e) => nastav(s.id, f.id, e.target.value)} />
                  : <input id={`pod-${s.id}-${f.id}`} type={f.typ === "odkaz" ? "url" : "text"} style={inp} value={hodnota(p, s.id, f.id)} onChange={(e) => nastav(s.id, f.id, e.target.value)} />}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
