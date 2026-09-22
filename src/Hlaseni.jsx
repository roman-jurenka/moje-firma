import { useState, useEffect, useCallback, Fragment } from "react";
import { supabase } from "./supabase.js";
import { VAPID_PUBLIC, urlB64ToUint8Array, jeIOS, jeNainstalovana, nazevZarizeni } from "./pushUtil.js";

// ─── Modul Hlášení ─────────────────────────────────────────────────────────
// Nastavení push upozornění na telefon (Pushover a/nebo vlastní push v aplikaci). Admin tady definuje pravidla
// (co hlídat, jak často, jak důležité) + časy ranního souhrnu a klidné hodiny.
//
// Odesílání dělá Edge Function `hlaseni-odeslat`, kterou každých 5 minut spouští
// pg_cron (souhrn v nastavené časy + okamžitá upozornění). Z tohoto modulu se
// volá jen pro zkušební zprávu, náhled "co by se teď hlásilo" a ruční souhrn.
// Klíče k Pushoveru (PUSHOVER_TOKEN / PUSHOVER_USER) jsou v Supabase Secrets,
// do prohlížeče se nikdy nedostanou.

const TYPY = {
  zakazky_po_terminu:    { label: "Zakázky po termínu", popis: "Zakázky, kterým uplynul termín a nejsou dokončené ani fakturované.", params: [] },
  zakazky_blizi_termin:  { label: "Zakázky s blížícím se termínem", popis: "Zakázky, kterým termín vyprší během několika dní.", params: [{ k: "dny", label: "Kolik dní předem", def: 3, min: 0, max: 60 }] },
  faktury_po_splatnosti: { label: "Faktury po splatnosti", popis: "Vydané faktury, které nejsou uhrazené a je po splatnosti.", params: [{ k: "min_dni", label: "Aspoň dní po splatnosti", def: 0, min: 0, max: 365 }] },
  faktury_brzy_splatne:  { label: "Faktury blízko splatnosti", popis: "Vydané neuhrazené faktury, kterým splatnost vyprší během několika dní.", params: [{ k: "dny", label: "Kolik dní předem", def: 3, min: 0, max: 60 }] },
  sklad_pod_minimem:     { label: "Sklad pod minimem", popis: "Materiál, kterého je na skladě méně než nastavené minimum.", params: [] },
  chybejici_dochazka:    { label: "Chybějící docházka (včera)", popis: "Aktivní zaměstnanci bez zápisu docházky za předchozí pracovní den.", params: [] },
  zadosti_dochazka:      { label: "Žádosti o úpravu docházky", popis: "Žádosti zaměstnanců o úpravu docházky čekající na schválení.", params: [] },
  prikazy_cekaji:        { label: "Příkazy čekající na schválení", popis: "Příkazy (hlas/text) zapsané do systému a čekající na tvé schválení.", params: [] },
  prikazy_chyby:         { label: "Příkazy skončené chybou", popis: "Příkazy, které za posledních 24 h selhaly.", params: [] },
  ukoly_po_terminu:      { label: "Úkoly po termínu", popis: "Nedokončené úkoly, kterým uplynul termín.", params: [] },
  nove_obchodni_pripady: { label: "Nové obchodní případy", popis: "Obchodní případy založené v posledních hodinách.", params: [{ k: "hodin", label: "Za posledních (hodin)", def: 24, min: 1, max: 168 }] },
  ucetenky_k_proplaceni: { label: "Účtenky k proplacení", popis: "Účtenky placené zaměstnancem z vlastního, které ještě nebyly proplaceny.", params: [] },
  vlastni_pripominka:    { label: "Vlastní připomínka", popis: "Tvůj vlastní text, který přijde v zadaný čas ve vybrané dny.", params: [], vlastni: true },
};

const REZIMY = { souhrn: "Jen v souhrnu", okamzite: "Okamžitě", oboji: "Souhrn i okamžitě" };
const PRIORITY = [{ v: -1, l: "Tichá" }, { v: 0, l: "Normální" }, { v: 1, l: "Vysoká" }];
const DNY_TYDNE = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const KANAL_LABEL = { souhrn: "Souhrn", rucne: "Ruční souhrn", okamzite: "Okamžitě", test: "Test" };

const fmtCas = (iso) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

// Zavolá Edge Function; chybu vrátí jako text (i když funkce odpověděla 4xx/5xx).
async function volej(akce, extra = {}) {
  const { data, error } = await supabase.functions.invoke("hlaseni-odeslat", { body: { akce, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.chyba || msg; } catch { /* zůstane obecná zpráva */ }
    return { status: "chyba", chyba: msg };
  }
  return data;
}

export default function HlaseniModule({ currentUser }) {
  const jeAdmin = currentUser?.role === "admin";
  const [tab, setTab] = useState("pravidla");
  const [rules, setRules] = useState([]);
  const [nast, setNast] = useState(null);
  const [zpravy, setZpravy] = useState([]);
  const [nahled, setNahled] = useState({});
  const [nahledLoading, setNahledLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null); // { ok: bool, text }
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const nactiNahled = useCallback(async () => {
    setNahledLoading(true);
    const r = await volej("nahled");
    if (r?.status === "ok") setNahled(Object.fromEntries((r.pravidla || []).map((p) => [p.id, p])));
    setNahledLoading(false);
  }, []);

  const nacti = useCallback(async () => {
    const [r, n, z] = await Promise.all([
      supabase.from("hlaseni_pravidla").select("*").order("poradi").order("id"),
      supabase.from("hlaseni_nastaveni").select("*").eq("id", 1).maybeSingle(),
      supabase.from("hlaseni_zpravy").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setRules(r.data || []);
    setNast(n.data || null);
    setZpravy(z.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!jeAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    nacti();
    nactiNahled();
  }, [jeAdmin, nacti, nactiNahled]);

  if (!jeAdmin) {
    return <div style={card}>Modul Hlášení může nastavovat jen administrátor.</div>;
  }

  const patchRule = async (id, fields) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const { error } = await supabase.from("hlaseni_pravidla").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { setInfo({ ok: false, text: "Uložení pravidla se nepovedlo: " + error.message }); nacti(); }
    else if ("parametry" in fields || "zapnuto" in fields) nactiNahled();
  };

  const smazRule = async (r) => {
    if (!window.confirm(`Smazat pravidlo „${r.nazev}“?`)) return;
    const { error } = await supabase.from("hlaseni_pravidla").delete().eq("id", r.id);
    if (error) setInfo({ ok: false, text: "Smazání se nepovedlo: " + error.message });
    else setRules((rs) => rs.filter((x) => x.id !== r.id));
  };

  const pridejRule = async (typ, nazev) => {
    const t = TYPY[typ];
    const parametry = t.vlastni
      ? { text: "", cas: "08:00", dny_v_tydnu: [1, 2, 3, 4, 5] }
      : Object.fromEntries(t.params.map((p) => [p.k, p.def]));
    const poradi = Math.max(0, ...rules.map((r) => r.poradi || 0)) + 10;
    const { data, error } = await supabase.from("hlaseni_pravidla").insert({
      typ, nazev: nazev || t.label, zapnuto: true, rezim: t.vlastni ? "okamzite" : "souhrn", priorita: 0, parametry, opakovat_po_hodinach: t.vlastni ? 20 : 24, poradi,
    }).select().single();
    if (error) { setInfo({ ok: false, text: "Přidání se nepovedlo: " + error.message }); return; }
    setRules((rs) => [...rs, data]);
    setShowAdd(false);
    nactiNahled();
  };

  const ulozNast = async (fields) => {
    setNast((n) => ({ ...n, ...fields }));
    const { error } = await supabase.from("hlaseni_nastaveni").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { setInfo({ ok: false, text: "Uložení nastavení se nepovedlo: " + error.message }); nacti(); }
  };

  const akce = async (nazev, fn) => {
    setBusy(nazev); setInfo(null);
    await fn();
    setBusy(null);
    nacti();
  };

  const zkusebni = () => akce("test", async () => {
    const r = await volej("test");
    setInfo(r?.status === "odeslano"
      ? { ok: true, text: "Zkušební zpráva odeslána. Mrkni na telefon." }
      : { ok: false, text: "Odeslání se nepovedlo: " + (r?.chyba || "neznámá chyba") });
  });

  const souhrnTed = () => akce("souhrn", async () => {
    const r = await volej("souhrn_ted");
    if (r?.status === "odeslano") setInfo({ ok: true, text: `Souhrn odeslán (${r.pocet} položek).` });
    else if (r?.status === "nic") setInfo({ ok: true, text: "Není co hlásit – žádné zapnuté pravidlo teď nic nenašlo." });
    else setInfo({ ok: false, text: "Souhrn se nepodařilo odeslat: " + (r?.chyba || "neznámá chyba") });
  });

  if (loading) return <div style={{ color: "#64748b", fontSize: 13 }}>Načítám nastavení hlášení…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Hlášení</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Push upozornění na telefon — co, kdy a jak důležité.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnGhost} disabled={!!busy} onClick={zkusebni}>{busy === "test" ? "Odesílám…" : "Poslat zkušební zprávu"}</button>
          <button style={btnPrimary} disabled={!!busy} onClick={souhrnTed}>{busy === "souhrn" ? "Odesílám…" : "Odeslat souhrn teď"}</button>
        </div>
      </div>

      {info && (
        <div style={{ ...card, marginBottom: 14, padding: 12, borderColor: info.ok ? "#34d399" : "#f87171", background: info.ok ? "#ecfdf5" : "#fef2f2", fontSize: 13, color: info.ok ? "#065f46" : "#991b1b" }}>
          {info.text}
          {!info.ok && /PUSHOVER/.test(info.text) && (
            <div style={{ marginTop: 6, fontSize: 12 }}>Klíče se nastavují v Supabase → Edge Functions → Secrets (PUSHOVER_TOKEN = API token aplikace, PUSHOVER_USER = tvůj user key z pushover.net).</div>
          )}
        </div>
      )}

      {nast && !nast.zapnuto && (
        <div style={{ ...card, marginBottom: 14, padding: 12, borderColor: "#f59e0b", background: "#fffbeb", fontSize: 13, color: "#92400e" }}>
          Hlášení jsou celkově vypnutá (Nastavení → hlavní vypínač). Nic se nebude odesílat.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["pravidla", "Pravidla"], ["nastaveni", "Časy a klid"], ["kanaly", "Kanály"], ["historie", "Historie"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={tab === id ? tabOn : tabOff}>{l}</button>
        ))}
      </div>

      {tab === "pravidla" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              „Souhrn“ = jedna zpráva v nastavené časy. „Okamžitě“ = zpráva do 5 minut, jakmile se něco najde (mimo klidné hodiny), každá položka se opakuje nejdřív po zadané době.
            </div>
            <button style={btnGhost} onClick={nactiNahled} disabled={nahledLoading}>{nahledLoading ? "Načítám…" : "Obnovit náhled"}</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {rules.map((r) => (
              <RuleCard key={r.id} rule={r} prev={nahled[r.id]} onPatch={(f) => patchRule(r.id, f)} onDelete={() => smazRule(r)} />
            ))}
            {rules.length === 0 && <div style={card}>Zatím žádná pravidla.</div>}
          </div>
          <button style={{ ...btnPrimary, marginTop: 14 }} onClick={() => setShowAdd(true)}>+ Přidat pravidlo</button>
        </div>
      )}

      {tab === "nastaveni" && nast && <NastaveniTab nast={nast} onSave={ulozNast} />}

      {tab === "kanaly" && nast && <KanalyTab nast={nast} onSave={ulozNast} onInfo={setInfo} onRefresh={nacti} />}

      {tab === "historie" && <HistorieTab zpravy={zpravy} />}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={pridejRule} />}
    </div>
  );
}

// ─── Pravidlo ─────────────────────────────────────────────────────────────

function RuleCard({ rule, prev, onPatch, onDelete }) {
  const t = TYPY[rule.typ] || { label: rule.typ, popis: "", params: [] };
  const [open, setOpen] = useState(false);
  const [nazev, setNazev] = useState(rule.nazev);
  const par = rule.parametry || {};
  const setPar = (k, v) => onPatch({ parametry: { ...par, [k]: v } });
  const instant = t.vlastni || rule.rezim !== "souhrn";

  return (
    <div style={{ ...card, opacity: rule.zapnuto ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Switch on={rule.zapnuto} onChange={(v) => onPatch({ zapnuto: v })} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <input value={nazev} onChange={(e) => setNazev(e.target.value)} onBlur={() => nazev.trim() && nazev !== rule.nazev && onPatch({ nazev: nazev.trim() })}
            style={{ border: "none", background: "transparent", fontSize: 15, fontWeight: 700, width: "100%", outline: "none", padding: 0 }} />
          <div style={{ fontSize: 12, color: "#64748b" }}>{t.popis}</div>
        </div>
        {!t.vlastni && (
          <div style={{ fontSize: 12 }}>
            {prev?.chyba
              ? <span style={{ color: "#b91c1c" }} title={prev.chyba}>chyba</span>
              : prev
                ? <button onClick={() => setOpen(!open)} style={{ ...badge(prev.pocet ? "#F5821F" : "#64748b"), border: "none", cursor: prev.pocet ? "pointer" : "default" }}>
                    {prev.pocet ? `teď ${prev.pocet}× ${open ? "▴" : "▾"}` : "teď nic"}
                  </button>
                : null}
          </div>
        )}
        <button onClick={onDelete} title="Smazat pravidlo" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {!t.vlastni && (
          <Field label="Kdy poslat">
            <select value={rule.rezim} onChange={(e) => onPatch({ rezim: e.target.value })} style={selectS}>
              {Object.entries(REZIMY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        )}
        <Field label="Důležitost">
          <select value={rule.priorita} onChange={(e) => onPatch({ priorita: Number(e.target.value) })} style={selectS}>
            {PRIORITY.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
        </Field>
        {t.params.map((p) => (
          <Field key={p.k} label={p.label}>
            <NumInput value={par[p.k] ?? p.def} min={p.min} max={p.max} onCommit={(v) => setPar(p.k, v)} />
          </Field>
        ))}
        {instant && !t.vlastni && (
          <Field label="Opakovat po (hodin)">
            <NumInput value={rule.opakovat_po_hodinach} min={1} max={720} onCommit={(v) => onPatch({ opakovat_po_hodinach: v })} />
          </Field>
        )}
      </div>

      {t.vlastni && (
        <div style={{ marginTop: 12 }}>
          <Field label="Text připomínky">
            <PripominkaText value={par.text || ""} onCommit={(v) => setPar("text", v)} />
          </Field>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
            <Field label="V kolik hodin">
              <input type="time" value={par.cas || "08:00"} onChange={(e) => e.target.value && setPar("cas", e.target.value)} style={selectS} />
            </Field>
            <Field label="Ve dnech">
              <div style={{ display: "flex", gap: 4 }}>
                {DNY_TYDNE.map((d, i) => {
                  const dny = par.dny_v_tydnu || [1, 2, 3, 4, 5, 6, 7];
                  const on = dny.includes(i + 1);
                  return (
                    <button key={d} onClick={() => {
                      const next = on ? dny.filter((x) => x !== i + 1) : [...dny, i + 1].sort();
                      if (next.length) setPar("dny_v_tydnu", next);
                    }} style={{ ...chip, background: on ? "#0369a1" : "#f1f5f9", color: on ? "#fff" : "#475569" }}>{d}</button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Připomínka se pošle jednou za den v zadaný čas. Vyjde-li čas na klidné hodiny, přijde po jejich skončení (nejpozději 3 hodiny po zadaném čase, jinak se ten den vynechá).</div>
        </div>
      )}

      {open && prev?.polozky?.length > 0 && (
        <div style={{ marginTop: 12, background: "#f8fafc", borderRadius: 8, padding: 10, fontSize: 12, color: "#334155" }}>
          {prev.polozky.map((l, i) => <div key={i}>• {l}</div>)}
          {prev.pocet > prev.polozky.length && <div style={{ color: "#94a3b8" }}>… a dalších {prev.pocet - prev.polozky.length}</div>}
        </div>
      )}
    </div>
  );
}

function PripominkaText({ value, onCommit }) {
  const [v, setV] = useState(value);
  return <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} placeholder="Např. Zkontrolovat sklad před zítřejší montáží" style={{ ...selectS, width: "100%", height: 54, resize: "vertical", boxSizing: "border-box" }} />;
}

function NumInput({ value, min, max, onCommit }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    let n = Number(v);
    if (!Number.isFinite(n)) n = value;
    n = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n)));
    setV(String(n));
    if (n !== value) onCommit(n);
  };
  return <input type="number" value={v} min={min} max={max} onChange={(e) => setV(e.target.value)} onBlur={commit} style={{ ...selectS, width: 90 }} />;
}

function Field({ label, children }) {
  return <div><div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>{children}</div>;
}

function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: on ? "#34d399" : "#cbd5e1", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left 0.15s" }} />
    </button>
  );
}

// ─── Přidání pravidla ─────────────────────────────────────────────────────

function AddModal({ onClose, onAdd }) {
  const [typ, setTyp] = useState("zakazky_blizi_termin");
  const [nazev, setNazev] = useState("");
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Nové pravidlo</div>
        <label style={label}>Co hlídat</label>
        <select value={typ} onChange={(e) => setTyp(e.target.value)} style={{ ...selectS, width: "100%" }}>
          {Object.entries(TYPY).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "#64748b", margin: "6px 0" }}>{TYPY[typ].popis}</div>
        <label style={label}>Název (nepovinné)</label>
        <input value={nazev} onChange={(e) => setNazev(e.target.value)} placeholder={TYPY[typ].label} style={{ ...selectS, width: "100%", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={btnPrimary} onClick={() => onAdd(typ, nazev.trim())}>Přidat</button>
          <button style={btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Časy a klidné hodiny ─────────────────────────────────────────────────

function NastaveniTab({ nast, onSave }) {
  const [casy, setCasy] = useState([...(nast.souhrn_casy || [])].sort());
  const [od, setOd] = useState(nast.klid_od);
  const [doo, setDoo] = useState(nast.klid_do);
  const [ulozeno, setUlozeno] = useState(false);

  const uloz = async () => {
    const cisté = [...new Set(casy.filter((c) => /^\d{2}:\d{2}$/.test(c)))].sort();
    await onSave({ souhrn_casy: cisté, klid_od: od, klid_do: doo });
    setCasy(cisté);
    setUlozeno(true);
    setTimeout(() => setUlozeno(false), 2500);
  };

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <div style={card}>
        <div style={cardLabel}>Hlavní vypínač</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <Switch on={nast.zapnuto} onChange={(v) => onSave({ zapnuto: v })} />
          {nast.zapnuto ? "Hlášení jsou zapnutá" : "Hlášení jsou vypnutá — nic se neposílá"}
        </div>
      </div>

      <div style={card}>
        <div style={cardLabel}>Časy souhrnu</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>V tyto časy (český čas) přijde jedna zpráva se vším z pravidel v režimu „Souhrn“. Když je souhrn prázdný, neposílá se (pokud níže nezapneš opak).</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {casy.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="time" value={c} onChange={(e) => setCasy(casy.map((x, j) => (j === i ? e.target.value : x)))} style={selectS} />
              <button onClick={() => setCasy(casy.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
            </span>
          ))}
          <button style={btnGhost} onClick={() => setCasy([...casy, "12:00"])}>+ čas</button>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={!!nast.posilat_prazdny_souhrn} onChange={(e) => onSave({ posilat_prazdny_souhrn: e.target.checked })} />
          Poslat souhrn i když není nic k hlášení („vše v pořádku“)
        </label>
      </div>

      <div style={card}>
        <div style={cardLabel}>Klidné hodiny</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Okamžitá upozornění a vlastní připomínky se v tuto dobu nepošlou — počkají a přijdou po skončení klidu. Pravidelné souhrny v nastavených časech klid neblokuje.</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
          od <input type="time" value={od} onChange={(e) => e.target.value && setOd(e.target.value)} style={selectS} />
          do <input type="time" value={doo} onChange={(e) => e.target.value && setDoo(e.target.value)} style={selectS} />
        </div>
      </div>

      <div>
        <button style={btnPrimary} onClick={uloz}>Uložit časy</button>
        {ulozeno && <span style={{ marginLeft: 10, fontSize: 13, color: "#059669" }}>✓ Uloženo</span>}
      </div>
    </div>
  );
}

// ─── Kanály (Pushover + push v aplikaci) ─────────────────────────────────

function KanalyTab({ nast, onSave, onInfo, onRefresh }) {
  const [stav, setStav] = useState("zjistuji"); // zjistuji | nepodporuje | nainstalovat | zamitnuto | vypnuto | zapnuto
  const [odbery, setOdbery] = useState([]);
  const [busy, setBusy] = useState(null);
  const [diag, setDiag] = useState(null);

  const nactiOdbery = useCallback(async () => {
    const { data } = await supabase.from("push_odbery").select("id,endpoint,zarizeni,created_at,posledni_uspech").order("created_at", { ascending: false });
    setOdbery(data || []);
  }, []);

  const zjistiStav = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // iPhone v Safari (mimo appku z plochy) push API vůbec neukazuje
      setStav(jeIOS() && !jeNainstalovana() ? "nainstalovat" : "nepodporuje");
      return;
    }
    if (Notification.permission === "denied") { setStav("zamitnuto"); return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setStav(sub && Notification.permission === "granted" ? "zapnuto" : "vypnuto");
    } catch {
      setStav("vypnuto");
    }
  }, []);

  useEffect(() => {
    zjistiStav();
    nactiOdbery();
  }, [zjistiStav, nactiOdbery]);

  // Důležité: Notification.requestPermission se musí zavolat přímo v kliknutí (iOS jinak odmítne).
  const zapnoutZarizeni = async () => {
    setBusy("zapnout"); onInfo(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStav(perm === "denied" ? "zamitnuto" : "vypnuto");
        onInfo({ ok: false, text: "Oznámení nebyla povolena. Povol je v Nastavení telefonu → Oznámení → ProudOS." });
        setBusy(null);
        return;
      }
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error("Service worker není aktivní. Push funguje jen v nainstalované/produkční verzi aplikace.")), 8000)),
      ]);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Nejsi přihlášený.");
      const { error } = await supabase.from("push_odbery").upsert(
        { profile_id: u.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, zarizeni: nazevZarizeni() },
        { onConflict: "endpoint" }
      );
      if (error) throw new Error(error.message);
      if (!nast.webpush) await onSave({ webpush: true });
      setStav("zapnuto");
      await nactiOdbery();
      onInfo({ ok: true, text: "Push v aplikaci je na tomto zařízení zapnutý. Zkus tlačítko „Poslat test“." });
    } catch (e) {
      onInfo({ ok: false, text: "Zapnutí se nepovedlo: " + (e?.message || e) });
    }
    setBusy(null);
  };

  const vypnoutZarizeni = async () => {
    setBusy("vypnout"); onInfo(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.from("push_odbery").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStav("vypnuto");
      await nactiOdbery();
    } catch (e) {
      onInfo({ ok: false, text: "Vypnutí se nepovedlo: " + (e?.message || e) });
    }
    setBusy(null);
  };

  const smazOdber = async (o) => {
    await supabase.from("push_odbery").delete().eq("id", o.id);
    await nactiOdbery();
    zjistiStav();
  };

  const test = async (kanal) => {
    setBusy("test-" + kanal); onInfo(null);
    const r = await volej("test", { kanal });
    onInfo(r?.status === "odeslano"
      ? { ok: true, text: "Zkušební zpráva odeslána. Mrkni na telefon." }
      : { ok: false, text: "Odeslání se nepovedlo: " + (r?.chyba || "neznámá chyba") });
    setBusy(null);
    onRefresh();
  };

  // Diagnostika: co na tomto zařízení skutečně běží a umí se zobrazit notifikace?
  const diagnostika = async () => {
    setBusy("diag"); onInfo(null);
    const radky = [];
    try {
      radky.push(`Zařízení: ${nazevZarizeni()}`);
      radky.push(`Nainstalováno na plochu: ${jeNainstalovana() ? "ano" : "ne"}`);
      radky.push(`Oprávnění oznámení: ${"Notification" in window ? Notification.permission : "nepodporováno"}`);
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) radky.push("Service worker: NENÍ zaregistrovaný");
      else {
        const sw = reg.active;
        radky.push(`Service worker: ${sw ? sw.state : "žádný aktivní"}`);
        const verze = await new Promise((resolve) => {
          if (!sw) return resolve(null);
          const t = setTimeout(() => resolve(null), 1500);
          navigator.serviceWorker.addEventListener("message", function h(e) {
            if (e.data?.type === "verze") { clearTimeout(t); navigator.serviceWorker.removeEventListener("message", h); resolve(e.data.verze); }
          });
          sw.postMessage({ type: "verze" });
        });
        radky.push(verze ? `Verze service workeru: ${verze} (aktuální)` : "Verze service workeru: STARÁ (neodpovídá) – použij „Opravit oznámení“");
        const sub = await reg.pushManager.getSubscription();
        radky.push(`Přihlášení k push: ${sub ? "ano" : "ne"}`);
        if (Notification.permission === "granted") {
          try {
            await reg.showNotification("Místní test", { body: "Tuhle notifikaci vytvořilo přímo zařízení, bez serveru.", icon: "/icons/icon-192.png", tag: "mistni-test" });
            radky.push("Místní test odeslán – uvidíš banner? Pokud ne, jde o nastavení oznámení v telefonu (Nastavení → Oznámení → ProudOS, Soustředění).");
          } catch (e) { radky.push("Místní test selhal: " + (e?.message || e)); }
        }
      }
    } catch (e) {
      radky.push("Chyba: " + (e?.message || e));
    }
    setDiag(radky);
    setBusy(null);
  };

  // Tvrdý reset: zruší push, service worker i cache a stránku načte znovu (pak stačí znovu zapnout).
  const opravit = async () => {
    if (!window.confirm("Zruší se oznámení na tomto zařízení a appka se načte znovu. Potom je znovu zapneš tlačítkem „Zapnout na tomto zařízení“. Pokračovat?")) return;
    setBusy("oprava");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) { await supabase.from("push_odbery").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* i při chybě stránku načteme znovu */ }
    window.location.reload();
  };

  const stavText = {
    zjistuji: "Zjišťuji stav…",
    nepodporuje: "Tento prohlížeč push notifikace nepodporuje.",
    nainstalovat: "Na iPhonu fungují push notifikace jen v aplikaci přidané na plochu. V Safari klepni na Sdílet (čtvereček se šipkou) → „Přidat na plochu“, otevři ProudOS z ikony na ploše a vrať se sem.",
    zamitnuto: "Oznámení jsou v tomto zařízení zakázaná. Povol je v Nastavení telefonu → Oznámení → ProudOS (u počítače: ikona zámku vedle adresy).",
    vypnuto: "Na tomto zařízení je push vypnutý.",
    zapnuto: "Na tomto zařízení je push zapnutý.",
  }[stav];

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <div style={card}>
        <div style={cardLabel}>Push v aplikaci (doporučeno)</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Vlastní notifikace přímo z ProudOS, bez cizí aplikace a bez poplatků. Na iPhonu vyžaduje aplikaci přidanou na plochu (iOS 16.4+).</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
          <Switch on={!!nast.webpush} onChange={(v) => onSave({ webpush: v })} />
          {nast.webpush ? "Kanál je zapnutý" : "Kanál je vypnutý"}
        </div>
        <div style={{ fontSize: 13, padding: 10, borderRadius: 8, background: stav === "zapnuto" ? "#ecfdf5" : stav === "zamitnuto" || stav === "nepodporuje" ? "#fef2f2" : "#f1f5f9", color: "#334155", marginBottom: 10 }}>
          {stavText}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(stav === "vypnuto") && <button style={btnPrimary} disabled={!!busy} onClick={zapnoutZarizeni}>{busy === "zapnout" ? "Zapínám…" : "Zapnout na tomto zařízení"}</button>}
          {stav === "zapnuto" && <button style={btnGhost} disabled={!!busy} onClick={vypnoutZarizeni}>{busy === "vypnout" ? "Vypínám…" : "Vypnout na tomto zařízení"}</button>}
          <button style={btnGhost} disabled={!!busy || odbery.length === 0} onClick={() => test("webpush")}>{busy === "test-webpush" ? "Odesílám…" : "Poslat test"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={{ ...btnGhost, color: "#475569", borderColor: "#cbd5e1" }} disabled={!!busy} onClick={diagnostika}>{busy === "diag" ? "Zjišťuji…" : "Diagnostika tohoto zařízení"}</button>
          <button style={{ ...btnGhost, color: "#b45309", borderColor: "#f59e0b" }} disabled={!!busy} onClick={opravit}>Opravit oznámení (reset)</button>
        </div>
        {diag && (
          <div style={{ marginTop: 10, fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, color: "#334155", lineHeight: 1.6 }}>
            {diag.map((r, i) => <div key={i}>{r}</div>)}
          </div>
        )}
        {odbery.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Zařízení s push</div>
            {odbery.map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
                <span>{o.zarizeni || "Zařízení"} <span style={{ color: "#94a3b8", fontSize: 11 }}>· od {fmtCas(o.created_at)}</span></span>
                <button onClick={() => smazOdber(o)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }} title="Odebrat">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={cardLabel}>Pushover</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Externí služba (jednorázově cca 5 USD za zařízení). Vyžaduje klíče PUSHOVER_TOKEN a PUSHOVER_USER v Supabase → Edge Functions → Secrets. Když používáš push v aplikaci, Pushover nepotřebuješ.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
          <Switch on={!!nast.pushover} onChange={(v) => onSave({ pushover: v })} />
          {nast.pushover ? "Kanál je zapnutý" : "Kanál je vypnutý"}
        </div>
        <button style={btnGhost} disabled={!!busy} onClick={() => test("pushover")}>{busy === "test-pushover" ? "Odesílám…" : "Poslat test"}</button>
      </div>

      <div style={card}>
        <div style={cardLabel}>Docházka na pozadí (zaměstnanci)</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
          Po zapsání příchodu dostane zaměstnanec v telefonu jednu notifikaci „V práci od 7:03 · odpracováno 4 h 30 min“, která se sama přepisuje. Klepnutím se otevře rychlá obrazovka s tlačítky Zapsat odchod a Nahrát fotky. Po odchodu se přepíše závěrečnou zprávou. Každý zaměstnanec si upozornění zapne ve svém profilu (Můj profil → Upozornění v telefonu).
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
          <Switch on={nast.dochazka_zapnuto !== false} onChange={(v) => onSave({ dochazka_zapnuto: v })} />
          {nast.dochazka_zapnuto !== false ? "Zapnuto" : "Vypnuto"}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          Čas v notifikaci obnovit každých
          <select value={nast.dochazka_interval_min || 30} onChange={(e) => onSave({ dochazka_interval_min: Number(e.target.value) })} style={selectS}>
            {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minut</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

// ─── Historie ─────────────────────────────────────────────────────────────

function HistorieTab({ zpravy }) {
  const [open, setOpen] = useState(null);
  if (!zpravy.length) return <div style={card}>Zatím nebylo odesláno nic. Zkus „Poslat zkušební zprávu“.</div>;
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{["Kdy", "Typ", "Titulek", "Položek", "Stav"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {zpravy.map((z) => (
            <Fragment key={z.id}>
              <tr onClick={() => setOpen(open === z.id ? null : z.id)} style={{ cursor: "pointer" }}>
                <td style={td}>{fmtCas(z.created_at)}</td>
                <td style={td}>{KANAL_LABEL[z.kanal] || z.kanal}</td>
                <td style={td}>{z.titulek}</td>
                <td style={td}>{z.pocet_polozek}</td>
                <td style={td}><span style={badge(z.uspech ? "#059669" : "#dc2626")}>{z.uspech ? "odesláno" : "chyba"}</span></td>
              </tr>
              {open === z.id && (
                <tr>
                  <td colSpan={5} style={{ ...td, background: "#f8fafc", whiteSpace: "pre-wrap" }}>{z.uspech ? (z.zprava || "—") : (z.odpoved || "Neznámá chyba")}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Styly (stejné barvy jako zbytek aplikace) ────────────────────────────

const card = { background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px #0000000a" };
const cardLabel = { fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 700 };
const btnPrimary = { background: "#F5C518", color: "#1A1A1A", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost = { background: "transparent", color: "#0369a1", border: "1px solid #0369a1", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const selectS = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#1A1A1A", fontSize: 13, outline: "none" };
const label = { display: "block", fontSize: 12, color: "#475569", fontWeight: 600, margin: "10px 0 4px" };
const tabOn = { background: "#0369a1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const tabOff = { background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const chip = { border: "none", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const badge = (c) => ({ background: c + "22", color: c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 });
const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, color: "#475569", borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.06em" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9", color: "#475569" };
const modalOverlay = { position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 };
const modalBox = { background: "#fff", borderRadius: 16, padding: 24, width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", border: "1px solid #e2e8f0", boxShadow: "0 20px 60px #0000001a", boxSizing: "border-box" };
