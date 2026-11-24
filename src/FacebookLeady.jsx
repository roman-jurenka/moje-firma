// ─── Facebook leady: formuláře z reklam (Meta Lead Ads) → poptávky v Průběhu ─
// Připojení stránky (přihlášení Facebookem, jen administrátor), přehled
// přijatých leadů a proklik na poptávku. Zpracování dělá edge funkce
// meta-leady (webhook + každých 15 minut dotažení).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import * as ui from "./ui.js";

async function volat(akce, extra = {}) {
  const { data, error } = await supabase.functions.invoke("meta-leady", { body: { akce, ...extra } });
  if (error) {
    const telo = await error.context?.json?.().catch(() => null);
    throw new Error(telo?.error || error.message);
  }
  return data;
}

const FB_STATE = "fb_oauth_state";
const REDIRECT = window.location.origin + "/";
// Konfigurace „Přihlášení k Facebooku pro firmy“ v aplikaci ProudOS Leady
// (oprávnění: stránky, leady, reklamy) — veřejný identifikátor, ne tajemství.
const FB_CONFIG_ID = "1144105911697208";
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function FacebookLeady({ currentUser, onOtevritPrubeh }) {
  const isAdmin = currentUser?.role === "admin";
  const [ucet, setUcet] = useState(null);
  const [leady, setLeady] = useState([]);
  const [chyba, setChyba] = useState("");
  const [info, setInfo] = useState("");
  const [pracuji, setPracuji] = useState(false);

  const nacist = useCallback(async () => {
    const [s, l] = await Promise.all([
      volat("stav").catch((e) => ({ chyba: e.message })),
      supabase.from("meta_leady").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setUcet(s);
    if (l.error) setChyba(l.error.message);
    setLeady(l.data || []);
  }, []);

  // Návrat z přihlášení Facebookem (?code=…&state=fb-…)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code"), state = q.get("state");
    if (!(code && state?.startsWith("fb-"))) { Promise.resolve().then(nacist); return; }
    window.history.replaceState(null, "", window.location.pathname);
    let ulozeny = null;
    try { ulozeny = localStorage.getItem(FB_STATE); localStorage.removeItem(FB_STATE); } catch { /* bez úložiště */ }
    if (state !== ulozeny) {
      Promise.resolve().then(() => { setChyba("Přihlášení k Facebooku se nepodařilo ověřit — zkuste „Připojit Facebook“ znovu."); nacist(); });
      return;
    }
    Promise.resolve().then(() => setPracuji(true));
    volat("pripojit", { code, redirect_uri: REDIRECT })
      .then((r) => {
        const s = r.stranky || [];
        const vadne = s.filter((x) => !x.odebira);
        setInfo(`Připojeno: ${s.map((x) => x.nazev).join(", ")}. Nové leady z reklam teď chodí rovnou do Průběhu.`);
        if (vadne.length) setChyba(`U stránky ${vadne.map((x) => `${x.nazev} (${x.chyba})`).join(", ")} se nepodařilo zapnout odběr leadů.`);
      })
      .catch((e) => setChyba(e.message))
      .finally(() => { setPracuji(false); nacist(); });
  }, [nacist]);

  const pripojit = () => {
    const state = "fb-" + crypto.randomUUID();
    try { localStorage.setItem(FB_STATE, state); } catch { /* ověření pak selže a nabídne zkusit znovu */ }
    const q = new URLSearchParams({ client_id: ucet.app_id, redirect_uri: REDIRECT, response_type: "code", config_id: FB_CONFIG_ID, state });
    window.location.href = `https://www.facebook.com/v23.0/dialog/oauth?${q}`;
  };
  const odpojit = async () => {
    if (!window.confirm("Odpojit Facebook? Leady z reklam přestanou chodit do appky.")) return;
    try { await volat("odpojit"); setInfo("Facebook odpojený."); nacist(); } catch (e) { setChyba(e.message); }
  };
  const dotahnout = async () => {
    const dni = window.prompt("Dotáhnout leady za kolik posledních dní? (max 90) Už přijaté se znovu nezaloží.", "7");
    if (!dni) return;
    setPracuji(true); setChyba(""); setInfo("");
    try {
      const r = await volat("dotahnout", { dni: Number(dni) });
      setInfo(r.novych ? `Dotaženo ${r.novych} nových leadů — jsou v Průběhu jako poptávky.` : "Žádné nové leady.");
      if (r.chyby?.length) setChyba(r.chyby.join(" · "));
    } catch (e) { setChyba(e.message); }
    setPracuji(false);
    nacist();
  };

  const pripojeno = !!ucet?.pripojeno;
  return (
    <div style={{ padding: "20px 28px", fontFamily: ui.pismo, maxWidth: 1100 }}>
      <h1 style={ui.nadpis}><i className="ti ti-brand-facebook" aria-hidden="true" style={{ color: "#1877F2" }}></i> Facebook leady</h1>
      <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>
        Kdo vyplní formulář ve facebookové reklamě, je do minuty v Průběhu jako nová poptávka
        {ucet?.nastaveni ? <> ({ucet.nastaveni.typ}, obchodník <b>{ucet.nastaveni.obchodnik}</b>)</> : null} a obchodník dostane upozornění.
      </p>

      {chyba && <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 0" }}>{chyba}</div>}
      {info && <div role="status" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 0" }}>{info}</div>}

      <div style={{ ...ui.karta, margin: "14px 0" }}>
        {!ucet ? "Načítám…" : ucet.chyba ? <span style={{ color: "#991b1b" }}>{ucet.chyba}</span> : !ucet.nastaveno ? (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <b>Ještě není nastavené.</b> V Supabase → Edge Functions → Secrets doplňte <code>META_APP_SECRET</code> (tajemství aplikace ProudOS Leady z Meta for Developers → Nastavení aplikace → Základní).
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
              {pripojeno ? (
                <>
                  <b style={{ color: "#166534" }}>● Připojeno</b>{ucet.pripojil ? ` (${ucet.pripojil})` : ""}
                  {(ucet.stranky || []).map((s) => (
                    <div key={s.page_id} style={{ color: "#475569", marginTop: 2 }}>
                      {s.nazev} — {s.odebira ? "leady chodí" : <span style={{ color: "#b45309" }}>odběr leadů nezapnutý</span>}
                      {s.posledni_sync ? ` · kontrola ${fmt(s.posledni_sync)}` : ""}
                    </div>
                  ))}
                </>
              ) : <b style={{ color: "#64748b" }}>Nepřipojeno</b>}
            </div>
            {isAdmin && !pripojeno && <button type="button" disabled={pracuji} style={ui.tlacitko("#1877F2")} onClick={pripojit}><i className="ti ti-plug-connected" aria-hidden="true"></i> {pracuji ? "Připojuji…" : "Připojit Facebook"}</button>}
            {pripojeno && <button type="button" disabled={pracuji} style={ui.tlacitkoObrys()} onClick={dotahnout}>{pracuji ? "Pracuji…" : "Dotáhnout starší leady"}</button>}
            {isAdmin && pripojeno && <button type="button" style={ui.tlacitkoObrys()} onClick={pripojit}>Přidat / obnovit stránky</button>}
            {isAdmin && pripojeno && <button type="button" style={{ ...ui.tlacitkoObrys(), color: "#991b1b" }} onClick={odpojit}>Odpojit</button>}
            {!isAdmin && !pripojeno && <span style={{ fontSize: 12, color: "#64748b" }}>Připojit může administrátor.</span>}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 15, margin: "18px 0 8px" }}>Přijaté leady ({leady.length})</h2>
      {leady.length === 0 ? <div style={{ color: "#64748b", fontSize: 13 }}>Zatím žádné.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#475569", fontSize: 11, textTransform: "uppercase" }}>
                {["Kdy", "Jméno", "Kontakt", "Město", "Roční spotřeba", "Objekt", "Kampaň / reklama", ""].map((h) => <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {leady.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(l.vyplneno || l.created_at)}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{l.jmeno || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {l.telefon && <div><a href={`tel:${l.telefon}`}>{l.telefon}</a></div>}
                    {l.email && <div><a href={`mailto:${l.email}`}>{l.email}</a></div>}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{l.mesto}</td>
                  <td style={{ padding: "6px 8px" }}>{l.spotreba}</td>
                  <td style={{ padding: "6px 8px" }}>{l.objekt}</td>
                  <td style={{ padding: "6px 8px", color: "#475569" }}>{[l.kampan, l.reklama].filter(Boolean).join(" · ") || l.formular}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {l.prubeh_id
                      ? <button type="button" style={{ ...ui.tlacitkoObrys(), padding: "4px 10px", fontSize: 12 }} onClick={() => onOtevritPrubeh?.(l.prubeh_id)}>Poptávka →</button>
                      : l.chyba ? <span style={{ color: "#991b1b", fontSize: 12 }} title={l.chyba}>⚠ {l.chyba}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
