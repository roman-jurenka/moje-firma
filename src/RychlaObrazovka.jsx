import { useState, useEffect } from "react";

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

export default function RychlaObrazovka({ todayRecord, jmeno, onZapsat, onFotky, onClose }) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const otevrena = !!todayRecord && !todayRecord.checkout;
  const hotovo = !!todayRecord && !!todayRecord.checkout;
  const odpracovano = todayRecord ? (hotovo ? hmToMin(todayRecord.checkout) - hmToMin(todayRecord.checkin) : nowMin - hmToMin(todayRecord.checkin)) : 0;

  const zapsat = async () => {
    setBusy(true);
    try { await onZapsat(); } finally { setBusy(false); }
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
        {!hotovo && (
          <button disabled={busy} onClick={zapsat} style={{ ...velke, background: otevrena ? "#F5C518" : "#34d399", color: "#1A1A1A" }}>
            <i className={`ti ${otevrena ? "ti-player-stop" : "ti-player-play"}`} aria-hidden="true"></i>
            {busy ? "Zapisuji…" : otevrena ? "Zapsat odchod" : "Zapsat příchod"}
          </button>
        )}
        <button onClick={onFotky} style={{ ...velke, background: "#ffffff1f", color: "#fff", border: "1px solid #ffffff40" }}>
          <i className="ti ti-camera" aria-hidden="true"></i>
          Nahrát fotky
        </button>
      </div>
    </div>
  );
}
