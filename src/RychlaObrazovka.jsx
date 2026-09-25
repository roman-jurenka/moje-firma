import { useState, useEffect } from "react";
import * as ui from "./ui.js";

// Rychlá obrazovka po klepnutí na notifikaci o odpracovaném čase:
// odpracovaný čas + velká tlačítka „Zapsat odchod“ a „Nahrát fotky“.

const pad = (n) => String(n).padStart(2, "0");
const trvani = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${pad(m % 60)} min` : `${m} min`;
};
const hmToMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const hm = (t) => String(t || "").slice(0, 5);


// Naposledy použité zakázky (jen v tomto zařízení) – ať je nahoře ta, na které se právě pracuje.
const POSLEDNI_KLIC = "proudos-posledni-zakazky";
const nactiPosledni = () => {
  try { const v = JSON.parse(localStorage.getItem(POSLEDNI_KLIC) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const ulozPosledni = (id) => {
  try {
    const dalsi = [String(id), ...nactiPosledni().filter((x) => x !== String(id))].slice(0, 5);
    localStorage.setItem(POSLEDNI_KLIC, JSON.stringify(dalsi));
  } catch { /* úložiště není k dispozici */ }
};

// Celoobrazový výběr zakázky s hledáním (velké cíle pro klepnutí palcem).
function VyberZakazky({ zakazky, hodnota, onVyber, onZavrit }) {
  const [q, setQ] = useState("");
  const slova = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const posledni = nactiPosledni();
  const razene = [...zakazky].sort((a, b) => {
    const ia = posledni.indexOf(String(a.id)), ib = posledni.indexOf(String(b.id));
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return String(a.name || "").localeCompare(String(b.name || ""), "cs");
  });
  const nalezene = slova.length ? razene.filter((z) => slova.every((w) => String(z.name || "").toLowerCase().includes(w))) : razene;
  const radek = { width: "100%", textAlign: "left", background: "#ffffff14", color: "#fff", border: "1px solid #ffffff2e", borderRadius: 12, padding: "14px 14px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2100, background: "#0a2a44", color: "#fff", display: "flex", flexDirection: "column",
      padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 16px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Zakázka, na které dnes pracuješ</div>
        <button onClick={onZavrit} aria-label="Zpět" style={{ background: "#ffffff22", border: "none", color: "#fff", width: 40, height: 40, borderRadius: 20, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat zakázku…" autoFocus
        style={{ width: "100%", boxSizing: "border-box", padding: "14px", fontSize: 16, borderRadius: 12, border: "1px solid #ffffff40", background: "#ffffff1a", color: "#fff", marginBottom: 12, outline: "none" }}
      />
      <div style={{ flex: 1, overflowY: "auto", display: "grid", gap: 8, alignContent: "start" }}>
        {hodnota && (
          <button onClick={() => onVyber(null)} style={{ ...radek, background: "transparent", color: "#ffb4b4", borderColor: "#ffb4b455" }}>Bez zakázky (zrušit výběr)</button>
        )}
        {nalezene.length === 0 && <div style={{ opacity: 0.7, padding: 12 }}>Nic nenalezeno.</div>}
        {nalezene.map((z) => (
          <button key={z.id} onClick={() => onVyber(z.id)}
            style={{ ...radek, ...(String(z.id) === String(hodnota) ? { background: ui.barvy.akcent, color: ui.barvy.text, borderColor: ui.barvy.akcent } : {}) }}>
            {z.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RychlaObrazovka({ todayRecord, jmeno, zakazky = [], onZakazka, onZapsat, onFotky, onClose }) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [vyberOtevren, setVyberOtevren] = useState(false);
  // Před zapsáním příchodu ještě není kam zakázku uložit – držíme ji tady a předáme při zápisu příchodu.
  const [lokalni, setLokalni] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const otevrena = !!todayRecord && !todayRecord.checkout;
  const hotovo = !!todayRecord && !!todayRecord.checkout;
  const odpracovano = todayRecord ? (hotovo ? hmToMin(todayRecord.checkout) - hmToMin(todayRecord.checkin) : nowMin - hmToMin(todayRecord.checkin)) : 0;

  const zakazkaId = todayRecord ? (todayRecord.contract_id ?? null) : lokalni;
  const zakazka = zakazkaId != null ? zakazky.find((z) => String(z.id) === String(zakazkaId)) : null;

  const zapsat = async () => {
    setBusy(true);
    try { await onZapsat(otevrena ? undefined : (lokalni != null ? Number(lokalni) : undefined)); } finally { setBusy(false); }
  };

  const vyber = async (id) => {
    setVyberOtevren(false);
    const cid = id == null ? null : Number(id);
    if (cid != null) ulozPosledni(cid);
    if (todayRecord) {
      if (onZakazka) await onZakazka(cid);
    } else {
      setLokalni(cid);
    }
  };

  const velke = { width: "100%", border: "none", borderRadius: 16, padding: "20px 16px", fontSize: 19, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "linear-gradient(180deg,#0E3B5E 0%,#0a2a44 100%)", color: "#fff",
      display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 20px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>{jmeno}</div>
        <button onClick={onClose} aria-label="Zavřít" style={{ background: "#ffffff22", border: "none", color: "#fff", width: 40, height: 40, borderRadius: 20, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 6, padding: "24px 0" }}>
        {!todayRecord && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Dnes ještě nemáš příchod</div>
            <div style={{ fontSize: 14, opacity: 0.75 }}>Je {pad(now.getHours())}:{pad(now.getMinutes())}</div>
          </>
        )}
        {otevrena && (
          <>
            <div style={{ fontSize: 14, opacity: 0.75 }}>V práci od {hm(todayRecord.checkin)}</div>
            <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{trvani(odpracovano)}</div>
            <div style={{ fontSize: 14, opacity: 0.75 }}>odpracováno</div>
          </>
        )}
        {hotovo && (
          <>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Odchod zapsán v {hm(todayRecord.checkout)}</div>
            <div style={{ fontSize: 14, opacity: 0.75 }}>Dnes odpracováno {trvani(odpracovano)}</div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <button onClick={() => setVyberOtevren(true)} style={{ ...velke, fontSize: 16, fontWeight: 700, padding: "16px", background: zakazka ? "#ffffff26" : "transparent", color: "#fff", border: `1px ${zakazka ? "solid" : "dashed"} #ffffff55`, justifyContent: "space-between", textAlign: "left" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <i className="ti ti-briefcase" aria-hidden="true"></i>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{zakazka ? zakazka.name : (zakazkaId != null ? "Zakázka #" + zakazkaId : "Vybrat zakázku")}</span>
          </span>
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
        {!hotovo && (
          <button disabled={busy} onClick={zapsat} style={{ ...velke, background: otevrena ? ui.barvy.akcent : ui.barvy.uspech, color: otevrena ? ui.barvy.text : "#fff" }}>
            <i className={`ti ${otevrena ? "ti-player-stop" : "ti-player-play"}`} aria-hidden="true"></i>
            {busy ? "Zapisuji…" : otevrena ? "Zapsat odchod" : "Zapsat příchod"}
          </button>
        )}
        <button onClick={onFotky} style={{ ...velke, background: "#ffffff1f", color: "#fff", border: "1px solid #ffffff40" }}>
          <i className="ti ti-camera" aria-hidden="true"></i>
          Nahrát fotky
        </button>
      </div>
      {vyberOtevren && <VyberZakazky zakazky={zakazky} hodnota={zakazkaId} onVyber={vyber} onZavrit={() => setVyberOtevren(false)} />}
    </div>
  );
}

// Pruh na úvodní obrazovce: když je příchod otevřený, hned na očích čas + 2 tlačítka
// (záloha pro případ, že se po klepnutí na notifikaci rychlá obrazovka neotevře sama).
export function PracePruh({ todayRecord, onOtevrit, onFotky }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const min = now.getHours() * 60 + now.getMinutes() - hmToMin(todayRecord.checkin);
  const btn = { border: "none", borderRadius: 10, padding: "12px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", flex: 1, minWidth: 130 };
  return (
    <div style={{ background: "linear-gradient(135deg,#0E3B5E,#0a2a44)", color: "#fff", borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, opacity: 0.8 }}>V práci od {hm(todayRecord.checkin)}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{trvani(min)}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onOtevrit} style={{ ...btn, background: ui.barvy.akcent, color: ui.barvy.text }}>Zapsat odchod</button>
        <button onClick={onFotky} style={{ ...btn, background: "#ffffff1f", color: "#fff", border: "1px solid #ffffff40" }}>Nahrát fotky</button>
      </div>
    </div>
  );
}
