import { useState, useEffect } from "react";
import { login, logout, isConnected, getUser, backupToOneDrive, connectSharedAccount, getLastBackupInfo, recordBackupStatus } from "./onedrive.js";

const S = {
  card: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 4px #0000000a" },
  btn: (bg = "#0369a1") => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }),
  tag: (color) => ({ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }),
};

export default function OneDrivePanel({ supabase }) {
  const [connected, setConnected] = useState(isConnected());
  const [user, setUser] = useState(getUser());
  const [progress, setProgress] = useState(null);    // { msg, pct }
  const [lastBackup, setLastBackup] = useState(localStorage.getItem("od_last_backup"));
  const [sharedBackupInfo, setSharedBackupInfo] = useState(null); // poslední záloha odkudkoli (i automatická z jiného zařízení)
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(!isConnected());
  const [backupResult, setBackupResult] = useState(null); // { folder, failed, succeeded } — poslední zálohu, ať je vidět, co se případně nepovedlo
  const [retrying, setRetrying] = useState(false);

  // Pokud tenhle prohlížeč ještě nemá vlastní přihlášení, zkus načíst firemní sdílený účet
  useEffect(() => {
    if (isConnected()) { setChecking(false); return; }
    connectSharedAccount().then(ok => {
      if (ok) { setConnected(true); setUser(getUser()); }
      setChecking(false);
    });
  }, []);

  // Stav poslední zálohy (i té, kterou na pozadí spustil automaticky jiný
  // zaměstnanec na jiném zařízení) — viz onedrive.js maybeAutoBackup.
  useEffect(() => {
    getLastBackupInfo(supabase).then(setSharedBackupInfo).catch(() => {});
  }, [supabase]);

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
    setBackupResult(null);
    setProgress({ msg: "Připravuji zálohu...", pct: 0 });
    try {
      const result = await backupToOneDrive(supabase, (msg, pct) => setProgress({ msg, pct }));
      const now = new Date().toLocaleString("cs-CZ");
      localStorage.setItem("od_last_backup", now);
      setLastBackup(now);
      setBackupResult(result);
      await recordBackupStatus(supabase, result, false);
      setSharedBackupInfo(await getLastBackupInfo(supabase));
      if (result.failed.length === 0) {
        setProgress({ msg: `✓ Záloha uložena do ${result.folder}`, pct: 100 });
        setTimeout(() => setProgress(null), 4000);
      } else {
        // Dřív appka i tady hlásila "hotovo" bez ohledu na to, že se část
        // tabulek nenahrála — teď se selhání ukáže jako varování se seznamem
        // toho, co konkrétně chybí, místo falešně zeleného "100 % hotovo".
        setProgress(null);
      }
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  };

  // Zkusí znovu nahrát jen tabulky, které se minule nepovedly — ať se
  // nemusí spouštět celá záloha znovu jen kvůli jedné selhané tabulce.
  const handleRetryFailed = async () => {
    if (!backupResult?.failed?.length) return;
    setRetrying(true);
    setError(null);
    try {
      const failedTables = backupResult.failed.map(f => f.table);
      const result = await backupToOneDrive(supabase, (msg, pct) => setProgress({ msg, pct }), failedTables);
      const now = new Date().toLocaleString("cs-CZ");
      localStorage.setItem("od_last_backup", now);
      setLastBackup(now);
      const merged = {
        folder: result.folder,
        failed: result.failed,
        succeeded: [...(backupResult?.succeeded || []), ...result.succeeded],
      };
      setBackupResult(merged);
      await recordBackupStatus(supabase, merged, false);
      setSharedBackupInfo(await getLastBackupInfo(supabase));
      if (result.failed.length === 0) {
        setProgress({ msg: `✓ Doplněno — záloha je teď kompletní`, pct: 100 });
        setTimeout(() => setProgress(null), 4000);
      } else {
        setProgress(null);
      }
    } catch (e) {
      setError(e.message);
    }
    setRetrying(false);
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A", marginBottom: 20 }}>
        ☁️ OneDrive integrace
      </div>

      {/* STATUS */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: connected ? 16 : 0 }}>
          <div style={{ fontSize: 32 }}>{checking ? "⏳" : connected ? "🟢" : "⚪"}</div>
          <div>
            <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 15 }}>
              {checking ? "Připojuji se..." : connected ? "Připojeno k firemnímu OneDrive" : "Nepřipojeno"}
            </div>
            {connected && user?.name && (
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                {user.name}{user.email ? ` · ${user.email}` : ""}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {!checking && (connected
            ? <button style={S.btn("#475569")} onClick={handleLogout}>Odpojit (jen v tomto prohlížeči)</button>
            : <button style={S.btn("#0078d4")} onClick={handleLogin}>🔗 Připojit OneDrive</button>
          )}
        </div>

        {connected && (
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
              Data se ukládají do složky <strong style={{ color: "#0369a1" }}>FirmaCRM/</strong> na tomto OneDrive. Tenhle účet je nastavený jako sdílený pro celou firmu — všichni zaměstnanci k němu nahrávají fotky a dokumenty automaticky, bez vlastního přihlašování.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={S.btn("#10b981")} onClick={handleBackup} disabled={!!progress}>
                {progress ? "⏳ Zálohuji..." : "💾 Záloha teď"}
              </button>
              {lastBackup && !progress && (
                <span style={{ fontSize: 12, color: "#475569" }}>Poslední záloha v tomto prohlížeči: {lastBackup}</span>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>
              🕗 Automatická denní záloha: {sharedBackupInfo
                ? <>{sharedBackupInfo.date === new Date().toISOString().slice(0, 10) ? "dnes proběhla" : `naposledy ${sharedBackupInfo.date}`}
                    {" "}({new Date(sharedBackupInfo.timestamp).toLocaleString("cs-CZ")}{sharedBackupInfo.failed?.length > 0 ? `, ${sharedBackupInfo.failed.length} tabulek se nepovedlo` : ", vše v pořádku"})
                  </>
                : "zatím neproběhla — spustí se sama v pozadí, jakmile někdo příště otevře appku"}
            </div>

            {/* Progress bar */}
            {progress && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{progress.msg}</div>
                <div style={{ background: "#e2e8f0", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ background: "#10b981", height: "100%", width: `${progress.pct}%`, transition: "width 0.4s" }} />
                </div>
              </div>
            )}

            {/* Souhrn poslední zálohy — hlavně to, co se NEpovedlo, ať to appka
                nezamlčí za falešně zeleným "hotovo" (audit appky, bod 8) */}
            {!progress && backupResult && backupResult.failed.length > 0 && (
              <div style={{ marginTop: 14, background: "#fee2e244", border: "1px solid #ef444444", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>
                  ⚠️ Záloha dokončena jen částečně — {backupResult.failed.length} z {backupResult.failed.length + backupResult.succeeded.length} tabulek se nenahrálo
                </div>
                <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12, color: "#7f1d1d" }}>
                  {backupResult.failed.map(f => (
                    <li key={f.table}><strong>{f.table}</strong> — {f.message}</li>
                  ))}
                </ul>
                <button style={S.btn("#ef4444")} onClick={handleRetryFailed} disabled={retrying}>
                  {retrying ? "⏳ Zkouším znovu..." : "🔁 Zkusit znovu jen chybějící"}
                </button>
              </div>
            )}
            {!progress && backupResult && backupResult.failed.length === 0 && backupResult.succeeded.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: "#16a34a" }}>
                ✓ Všech {backupResult.succeeded.length} tabulek se nahrálo v pořádku.
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
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 12 }}>📁 Struktura složek na OneDrive</div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
          <div><span style={{ color: "#0369a1" }}>FirmaCRM/</span></div>
          <div>&nbsp;&nbsp;<span style={{ color: "#34d399" }}>Zálohy/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#64748b" }}>2026-07-12/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#475569" }}>contracts.csv, attendance.csv, ...</span></div>
          <div>&nbsp;&nbsp;<span style={{ color: "#34d399" }}>Zakázky/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#64748b" }}>Název zakázky/</span></div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#475569" }}>Fotky/, Dokumenty/</span></div>
        </div>
      </div>

      {/* NASTAVENÍ */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 12 }}>⚙️ Co se ukládá na OneDrive</div>
        {[
          ["💾 Zálohy databáze", "CSV export všech tabulek (zakázky, docházka, náklady...) — spouští se automaticky jednou denně na pozadí, ruční tlačítko funguje i tak", true],
          ["📷 Fotky zakázek", "Fotky nahrané v detailu zakázky → FirmaCRM/Zakázky/.../Fotky/", true],
          ["📄 Dokumenty zakázek", "Soubory nahrané v Dokumenty → FirmaCRM/Zakázky/.../Dokumenty/", true],
        ].map(([title, desc, active]) => (
          <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <span style={S.tag(active ? "#10b981" : "#475569")}>{active ? "✓ aktivní" : "brzy"}</span>
            <div>
              <div style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* NÁVOD — setup */}
      {!connected && (
        <div style={{ ...S.card, border: "1px solid #f59e0b44", background: "#fffbeb" }}>
          <div style={{ fontWeight: 700, color: "#b45309", marginBottom: 12 }}>📋 Jak nastavit připojení (jednou)</div>
          <ol style={{ color: "#475569", fontSize: 12, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
            <li>Jdi na <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>portal.azure.com</a> a přihlas se osobním Microsoft účtem</li>
            <li>Hledat: <strong style={{ color: "#1A1A1A" }}>App registrations</strong> → klikni <strong style={{ color: "#1A1A1A" }}>New registration</strong></li>
            <li>Název: <code style={{ color: "#16a34a" }}>FirmaCRM</code>, typ účtů: <strong style={{ color: "#1A1A1A" }}>Personal Microsoft accounts only</strong></li>
            <li>Redirect URI: <strong style={{ color: "#1A1A1A" }}>Single-page application (SPA)</strong> → vlož URL tvé aplikace (Vercel)</li>
            <li>Po registraci zkopíruj <strong style={{ color: "#1A1A1A" }}>Application (client) ID</strong></li>
            <li>Vlož CLIENT_ID do souboru <code style={{ color: "#16a34a" }}>src/onedrive.js</code> na řádek 7</li>
            <li>Udělej git commit + push, pak klikni <strong style={{ color: "#0078d4" }}>Připojit OneDrive</strong></li>
          </ol>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
            Připojuje se tu jen jednou — tvůj účet se automaticky nastaví jako sdílený pro celou firmu a zaměstnanci se k němu připojí sami, bez vlastního přihlašování.
          </div>
        </div>
      )}
    </div>
  );
}
