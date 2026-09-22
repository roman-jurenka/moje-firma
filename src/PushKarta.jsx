import { useState, useEffect, useCallback } from "react";
import { zjistiPushStav, zapniPush, vypniPush } from "./pushUtil.js";

// Karta „Upozornění v telefonu“ – zaměstnanec si tu zapne notifikaci s odpracovaným časem
// (V práci od 7:03 · 4 h 30 min) a rychlými akcemi Odchod / Nahrát fotky.

const TEXTY = {
  zjistuji: "Zjišťuji stav…",
  nepodporuje: "Tento prohlížeč push notifikace nepodporuje.",
  nainstalovat: "Na iPhonu fungují notifikace jen v aplikaci přidané na plochu. V Safari klepni na Sdílet (čtvereček se šipkou) → „Přidat na plochu“, otevři ProudOS z ikony na ploše a vrať se sem.",
  zamitnuto: "Oznámení jsou v tomto zařízení zakázaná. Povol je v Nastavení telefonu → Oznámení → ProudOS.",
  vypnuto: "Upozornění na tomto zařízení nejsou zapnutá.",
  zapnuto: "Upozornění jsou zapnutá. Po zapsání příchodu ti v telefonu naskočí notifikace s odpracovaným časem.",
};

export default function PushKarta({ style = {}, kompaktni = false }) {
  const [stav, setStav] = useState("zjistuji");
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState(null);

  const obnov = useCallback(async () => setStav(await zjistiPushStav()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    obnov();
  }, [obnov]);

  const zapnout = async () => {
    setBusy(true); setChyba(null);
    const r = await zapniPush();
    if (!r.ok) setChyba(r.text);
    await obnov();
    setBusy(false);
  };
  const vypnout = async () => {
    setBusy(true); setChyba(null);
    const r = await vypniPush();
    if (!r.ok) setChyba(r.text);
    await obnov();
    setBusy(false);
  };
  const mistniTest = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.showNotification("Test upozornění", { body: "Takhle bude vypadat notifikace z ProudOS.", icon: "/icons/icon-192.png", tag: "mistni-test" });
    } catch (e) {
      setChyba("Test se nepovedl: " + (e?.message || e));
    }
  };

  const btn = { border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: kompaktni ? 14 : 18, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px #0000000a", ...style }}>
      <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 6 }}>🔔 Upozornění v telefonu</div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
        Když zapíšeš příchod, v telefonu se objeví notifikace s odpracovaným časem. Klepnutím otevřeš rychlou obrazovku s tlačítky Zapsat odchod a Nahrát fotky.
      </div>
      <div style={{ fontSize: 13, padding: 10, borderRadius: 8, background: stav === "zapnuto" ? "#ecfdf5" : stav === "zamitnuto" || stav === "nepodporuje" ? "#fef2f2" : "#f1f5f9", color: "#334155", marginBottom: 10 }}>
        {TEXTY[stav]}
      </div>
      {chyba && <div style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>{chyba}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stav === "vypnuto" && <button disabled={busy} onClick={zapnout} style={{ ...btn, background: "#F5C518", color: "#1A1A1A" }}>{busy ? "Zapínám…" : "Zapnout na tomto zařízení"}</button>}
        {stav === "zapnuto" && <button disabled={busy} onClick={vypnout} style={{ ...btn, background: "transparent", color: "#0369a1", border: "1px solid #0369a1" }}>{busy ? "Vypínám…" : "Vypnout"}</button>}
        {stav === "zapnuto" && <button onClick={mistniTest} style={{ ...btn, background: "transparent", color: "#475569", border: "1px solid #cbd5e1" }}>Zkušební upozornění</button>}
      </div>
    </div>
  );
}
