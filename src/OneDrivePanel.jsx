import { useState } from "react";
import { login, logout, isConnected, getUser, backupToOneDrive } from "./onedrive.js";

const S = {
  card: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  btn: (bg = "#2563eb") => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }),
  tag: (color) => ({ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }),
};

export default function OneDrivePanel({ supabase }) {
  const [connected, setConnected] = useState(isConnected());
  const [user, setUser] = useState(getUser());
  const [progress, setProgress] = useState(null);    // { msg, pct }
  const [lastBackup, setLastBackup] = useState(localStorage.getItem("od_last_backup"));
  const [error, setError] = useState(null);

  const handleLogin = () => {
    setError(null);
    login();
  };

  const handleLogout = () => {
    logout();
    setConnected(false);
    setUser({ name: null, email: null });
  };

  const handleBackup = async () => {
    setError(null);
    setProgress({ msg: "Připravuji zálohu...", pct: 0 });
    try {
      const folder = await backupToOneDrive(supabase, (msg, pct) => setProgress({ msg, pct }));
      const now = new Date().toLocaleString("cs-CZ");
      localStorage.setItem("od_last_backup", now);
      setLastBackup(now);
      setProgress({ msg: `✓ Záloha uložena do ${folder}`, pct: 100 });
      setTimeout(() => setProgress(null), 4000);
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 20 }}>
        ☁️ OneDrive integrace
      </div>

      {/* STATUS */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: connected ? 16 : 0 }}>
          <div style={{ fontSize: 32 }}>{connected ? "🟢" : "⚪"}</div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>
              {connected ? "Připojeno k OneDrive" : "Nepřipojeno"}
            </div>
            {connected && user?.name && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {user.name}{user.email ? ` · ${user.email}` : ""}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {connected
            ? <button style={S.btn("#334155")} onClick={handleLogout}>Odpojit</button>
            : <button style={S.btn("#0078d4")} onClick={handleLogin}>🔗 Připojit OneDrive</button>
          }
        </div>

        {connected && (
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
              Data se ukládají do složky <strong style={{ color: "#93c5fd" }}>FirmaCRM/</strong> na tvém OneDrive.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={S.btn("#10b981")} onClick={handleBackup} disabled={!!progress}>
                {progress ? "⏳ Zálohuji..." : "💾 Záloha teď"}
              </button>
              {lastBackup && !progress && (
                <span style={{ fontSize: 12, color: "#475569" }}>Poslední záloha: {lastBackup}</span>
              )}
            </div>

            {/* Progress bar */}
            {progress && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>{progress.msg}</div>
                <div style={{ background: "#1e293b", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ background: "#10b981", height: "100%", width: `${progress.pct}%`, transition: "width 0.4s" }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ background: "#fee2e244", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* INFO */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12 }}>📁 Struktura složek na OneDrive</div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
          <div><span style={{ color: "#60a5fa" }}>FirmaCRM/</span></div>
          <div>&nbsp;&nbsp;<span style={{ color: "#34d399" }}>Zálohy/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#94a3b8" }}>2026-07-12/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#64748b" }}>contracts.csv, attendance.csv, ...</span></div>
          <div>&nbsp;&nbsp;<span style={{ color: "#34d399" }}>Zakázky/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#94a3b8" }}>Název zakázky/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#64748b" }}>Fotky/, Dokumenty/</span></div>
        </div>
      </div>

      {/* NASTAVENÍ */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12 }}>⚙️ Co se ukládá na OneDrive</div>
        {[
          ["💾 Zálohy databáze", "CSV export všech tabulek (zakázky, docházka, náklady...)", true],
          ["📷 Fotky zakázek", "Fotky nahrané v detailu zakázky → FirmaCRM/Zakázky/.../Fotky/", true],
          ["📄 Dokumenty zakázek", "Soubory nahrané v Dokumenty → FirmaCRM/Zakázky/.../Dokumenty/", true],
        ].map(([title, desc, active]) => (
          <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <span style={S.tag(active ? "#10b981" : "#475569")}>{active ? "✓ aktivní" : "brzy"}</span>
            <div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* NÁVOD — setup */}
      {!connected && (
        <div style={{ ...S.card, border: "1px solid #f59e0b44", background: "#0f172a" }}>
          <div style={{ fontWeight: 700, color: "#f59e0b", marginBottom: 12 }}>📋 Jak nastavit připojení (jednou)</div>
          <ol style={{ color: "#94a3b8", fontSize: 12, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
            <li>Jdi na <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>portal.azure.com</a> a přihlas se osobním Microsoft účtem</li>
            <li>Hledat: <strong style={{ color: "#fff" }}>App registrations</strong> → klikni <strong style={{ color: "#fff" }}>New registration</strong></li>
            <li>Název: <code style={{ color: "#34d399" }}>FirmaCRM</code>, typ účtů: <strong style={{ color: "#fff" }}>Personal Microsoft accounts only</strong></li>
            <li>Redirect URI: <strong style={{ color: "#fff" }}>Single-page application (SPA)</strong> → vlož URL tvé aplikace (Vercel)</li>
            <li>Po registraci zkopíruj <strong style={{ color: "#fff" }}>Application (client) ID</strong></li>
            <li>Vlož CLIENT_ID do souboru <code style={{ color: "#34d399" }}>src/onedrive.js</code> na řádek 7</li>
            <li>Udělej git commit + push, pak klikni <strong style={{ color: "#0078d4" }}>Připojit OneDrive</strong></li>
          </ol>
        </div>
      )}
    </div>
  );
}
