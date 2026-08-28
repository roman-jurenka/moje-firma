// ─── OneDrive Integration — OAuth2 PKCE + Microsoft Graph API ────────────────
// Osobní Microsoft účet (consumers tenant)
// Nastav CLIENT_ID po registraci aplikace v Azure portálu

import { supabase } from "./supabase.js";

export const OD_CLIENT_ID = "acc593cf-5c70-408d-bc5d-ccb99a043972";
const TENANT = "common"; // multitenant — funguje pro firemní i osobní účty
const REDIRECT_URI = window.location.origin + "/";
const SCOPES = "User.Read Files.ReadWrite offline_access";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";
const FOLDER_ROOT = "FirmaCRM";

// Sdílený firemní účet — všichni zaměstnanci používají stejné připojení
// (uložené v Supabase), místo aby se každý přihlašoval zvlášť.
const SETTINGS_TABLE = "app_settings";
const SHARED_KEY = "onedrive_shared";

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(hash);
  return { verifier, challenge };
}

// ─── Token storage ────────────────────────────────────────────────────────────
const LS = {
  set: (k, v) => localStorage.setItem("od_" + k, JSON.stringify(v)),
  get: (k) => { try { return JSON.parse(localStorage.getItem("od_" + k)); } catch { return null; } },
  del: (k) => localStorage.removeItem("od_" + k),
};

export function isConnected() {
  return !!LS.get("access_token") && !!LS.get("user_name");
}

export function getUser() {
  return { name: LS.get("user_name"), email: LS.get("user_email") };
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export async function login() {
  if (!OD_CLIENT_ID) {
    alert("OneDrive není nakonfigurováno — vlož CLIENT_ID do src/onedrive.js");
    return;
  }
  const { verifier, challenge } = await generatePKCE();
  const state = base64url(crypto.getRandomValues(new Uint8Array(8)));
  LS.set("pkce_verifier", verifier);
  LS.set("pkce_state", state);

  const params = new URLSearchParams({
    client_id: OD_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_mode: "query",
  });
  window.location.href = `${AUTH_BASE}/authorize?${params}`;
}

// ─── CALLBACK — zavolej po přesměrování zpět do aplikace ─────────────────────
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return false;
  if (state !== LS.get("pkce_state")) { console.error("PKCE state mismatch"); return false; }

  const verifier = LS.get("pkce_verifier");
  const body = new URLSearchParams({
    client_id: OD_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(`${AUTH_BASE}/token`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const data = await res.json();
  if (data.error) { console.error("Token error:", data); return false; }

  LS.set("access_token", data.access_token);
  LS.set("refresh_token", data.refresh_token);
  LS.set("token_expires", Date.now() + data.expires_in * 1000);

  // Načíst profil uživatele
  const me = await graphGet("/me");
  LS.set("user_name", me.displayName || me.userPrincipalName);
  LS.set("user_email", me.mail || me.userPrincipalName);

  LS.del("pkce_verifier");
  LS.del("pkce_state");

  // Toto přihlášení se automaticky stává firemním sdíleným účtem —
  // ostatní zaměstnanci se k němu připojí bez vlastního přihlašování.
  LS.set("shared_mode", true);
  await pushSharedToken();

  // Vyčistit URL od OAuth parametrů
  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export function logout() {
  ["access_token", "refresh_token", "token_expires", "user_name", "user_email", "shared_mode"].forEach(k => LS.del(k));
}

// ─── SDÍLENÝ FIREMNÍ ÚČET (Supabase) ──────────────────────────────────────────
// Uloží aktuální refresh token jako firemní sdílený účet
async function pushSharedToken() {
  try {
    await supabase.from(SETTINGS_TABLE).upsert({
      key: SHARED_KEY,
      value: {
        refresh_token: LS.get("refresh_token"),
        user_name: LS.get("user_name"),
        user_email: LS.get("user_email"),
      },
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Nepodařilo se uložit sdílený OneDrive účet:", e.message);
  }
}

// Info o firemním účtu (i bez připojení v tomto prohlížeči)
export async function getSharedAccountInfo() {
  const { data } = await supabase.from(SETTINGS_TABLE).select("value").eq("key", SHARED_KEY).maybeSingle();
  return data?.value || null;
}

// Načte firemní sdílený účet do tohoto prohlížeče (pokud tu ještě není žádné
// vlastní připojení). Volá se automaticky při otevření OneDrive/fotek.
export async function connectSharedAccount() {
  if (isConnected()) return true;
  const shared = await getSharedAccountInfo();
  if (!shared?.refresh_token) return false;
  LS.set("refresh_token", shared.refresh_token);
  LS.set("user_name", shared.user_name);
  LS.set("user_email", shared.user_email);
  LS.set("token_expires", 0);
  LS.set("shared_mode", true);
  try {
    await getValidToken();
    return true;
  } catch (e) {
    console.warn("Sdílený OneDrive účet už není platný:", e.message);
    return false;
  }
}

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────
async function getValidToken() {
  const expires = LS.get("token_expires") || 0;
  if (Date.now() < expires - 60000) return LS.get("access_token");

  const refresh = LS.get("refresh_token");
  if (!refresh) throw new Error("Nejsi přihlášen k OneDrive");

  const body = new URLSearchParams({
    client_id: OD_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: SCOPES,
  });
  const res = await fetch(`${AUTH_BASE}/token`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const data = await res.json();
  if (data.error) throw new Error("Token refresh failed: " + data.error_description);

  LS.set("access_token", data.access_token);
  if (data.refresh_token) LS.set("refresh_token", data.refresh_token);
  LS.set("token_expires", Date.now() + data.expires_in * 1000);

  // Microsoft refresh token po použití rotuje — pokud tenhle prohlížeč běží
  // jako firemní sdílený účet, ulož nový token zpět, ať zůstane platný i pro ostatní.
  if (LS.get("shared_mode")) await pushSharedToken();

  return data.access_token;
}

// ─── GRAPH API helpers ────────────────────────────────────────────────────────
async function graphGet(path) {
  const token = await getValidToken();
  const res = await fetch(GRAPH + path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error(`Graph GET ${path} → ${res.status}`);
  return res.json();
}

async function graphPut(path, body, contentType = "application/octet-stream") {
  const token = await getValidToken();
  const res = await fetch(GRAPH + path, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": contentType },
    body,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Graph PUT ${path} → ${res.status}: ${e}`); }
  return res.json();
}

async function graphPost(path, body) {
  const token = await getValidToken();
  const res = await fetch(GRAPH + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Graph POST ${path} → ${res.status}: ${e}`); }
  return res.json();
}

// ─── SLOŽKY ───────────────────────────────────────────────────────────────────
async function ensureFolder(path) {
  // path = "FirmaCRM/Zakázky/Moje zakázka"
  const parts = path.split("/");
  let current = "";
  for (const part of parts) {
    const parent = current ? `/me/drive/root:/${current}:/children` : "/me/drive/root/children";
    current = current ? `${current}/${part}` : part;
    try {
      await graphPost(parent, { name: part, folder: {}, "@microsoft.graph.conflictBehavior": "ignore" });
    } catch { /* složka už existuje */ }
  }
}

// ─── NAHRÁT SOUBOR NA ONEDRIVE ────────────────────────────────────────────────
// Vrátí { webUrl, itemId } — webUrl je odkaz na otevření v OneDrive (nemusí
// jít vždy použít přímo jako <img src>, viz getDirectDownloadUrl), itemId
// slouží k pozdějšímu načtení čerstvého přímého odkazu na obsah souboru.
export async function uploadFile(folderPath, fileName, content, contentType = "application/octet-stream") {
  await ensureFolder(folderPath);
  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, "_");
  const fullPath = `${folderPath}/${safeName}`;
  const result = await graphPut(`/me/drive/root:/${fullPath}:/content`, content, contentType);

  // Vytvoř sharing link (na organizačních/firemních tenantech bývá anonymní
  // sdílení zakázané politikou — pak se použije autentizovaný webUrl, který
  // ale nejde přímo vykreslit jako <img src>; proto si necháváme i itemId).
  let webUrl = result.webUrl;
  try {
    const share = await graphPost(`/me/drive/items/${result.id}/createLink`, { type: "view", scope: "anonymous" });
    webUrl = share.link?.webUrl || result.webUrl;
  } catch { /* anonymní odkaz se nepovedlo vytvořit, použije se webUrl ze souboru */ }

  return { webUrl, itemId: result.id };
}

// Verze pro File objekt z input[type=file]
export async function uploadFileObject(folderPath, file) {
  const buffer = await file.arrayBuffer();
  return uploadFile(folderPath, file.name, buffer, file.type || "application/octet-stream");
}

// ─── ČERSTVÝ PŘÍMÝ ODKAZ NA OBSAH SOUBORU ─────────────────────────────────────
// Na rozdíl od sdíleného webUrl funguje spolehlivě vždy (jde přes náš vlastní
// přihlášený přístup), ale platí jen dočasně — volej těsně před zobrazením.
export async function getDirectDownloadUrl(itemId) {
  if (!itemId) return null;
  try {
    const item = await graphGet(`/me/drive/items/${itemId}`);
    return item["@microsoft.graph.downloadUrl"] || null;
  } catch {
    return null;
  }
}

// ─── CESTA KE SLOŽCE ZAKÁZKY ──────────────────────────────────────────────────
// zakazkaFolderPath("Novák Jan", "Fotky") → "FirmaCRM/Zakázky/Novák Jan/Fotky"
export function zakazkaFolderPath(nazevZakazky, podslozka) {
  const safe = (nazevZakazky || "Nezařazená zakázka").replace(/[\\/:*?"<>|]/g, "_").trim() || "Nezařazená zakázka";
  return `${FOLDER_ROOT}/Zakázky/${safe}/${podslozka}`;
}

// Přímý (stažitelný) odkaz na obrázek — pro <img src> náhledy
export function toDirectImageUrl(webUrl) {
  if (!webUrl) return webUrl;
  return webUrl + (webUrl.includes("?") ? "&" : "?") + "download=1";
}

// ─── ZÁLOHA DAT ZE SUPABASE ───────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows || rows.length === 0) return "Žádná data\n";
  const keys = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map(r => keys.map(k => escape(r[k])).join(","))].join("\n");
}

// Vrací { folder, failed, succeeded } místo pouhé cesty ke složce — dřív se
// chyba jednotlivé tabulky jen tiše zalogovala do konzole a záloha se i tak
// nahlásila jako "100 % hotovo", takže nikdo netušil, že část dat na
// OneDrive ve skutečnosti nedorazila (audit appky, bod 8). Volající (viz
// OneDrivePanel.jsx) teď z výsledku pozná přesně, co se nepovedlo, místo
// falešného zeleného "hotovo".
export async function backupToOneDrive(supabase, onProgress, tablesOverride) {
  const date = new Date().toISOString().slice(0, 10);
  const folder = `${FOLDER_ROOT}/Zálohy/${date}`;

  const tables = tablesOverride || [
    "contracts", "employees", "attendance", "contract_cost_entries",
    "customers", "deals", "tasks", "invoices", "delivery_notes",
    "delivery_note_items", "harmonogram", "products",
  ];

  onProgress?.("Připravuji zálohu...", 0);

  const failed = [];
  const succeeded = [];
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    onProgress?.(`Exportuji ${table}...`, Math.round((i / tables.length) * 90));
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      const csv = toCSV(data || []);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM pro Excel
      const buffer = await blob.arrayBuffer();
      await uploadFile(folder, `${table}.csv`, buffer, "text/csv");
      succeeded.push(table);
    } catch (e) {
      console.warn(`Záloha tabulky ${table} selhala:`, e.message);
      failed.push({ table, message: e.message });
    }
  }

  onProgress?.(failed.length === 0 ? "Záloha dokončena ✓" : `Záloha dokončena s chybami (${failed.length}/${tables.length})`, 100);
  return { folder, failed, succeeded };
}

// ─── PLÁNOVANÁ AUTOMATICKÁ ZÁLOHA ─────────────────────────────────────────────
// Appka nemá vlastní server/cron — zálohu proto spustí automaticky na pozadí
// první zaměstnanec, který ten den appku otevře (prakticky jistota, protože se
// appka používá denně kvůli docházce). Stav "poslední zálohy" se ukládá do
// Supabase (ne jen do localStorage), ať je vidět napříč všemi zařízeními a ať
// se záloha nespouští opakovaně, i když appku otevře víc lidí ve stejný den.
const BACKUP_STATUS_KEY = "onedrive_last_backup";
const BACKUP_LOCK_KEY = "onedrive_backup_lock";
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 min — kdyby záloha spadla uprostřed, zámek po chvíli sám vyprší

export async function getLastBackupInfo(supabase) {
  const { data } = await supabase.from(SETTINGS_TABLE).select("value").eq("key", BACKUP_STATUS_KEY).maybeSingle();
  return data?.value || null;
}

// Zapíše stav poslední zálohy sdíleně (Supabase), ať ji vidí i ostatní
// zaměstnanci/zařízení — volá se jak po automatické, tak po ruční záloze
// (OneDrivePanel), aby se automatická záloha zbytečně nespouštěla znovu
// týž den jen proto, že už ji někdo pustil ručně.
export async function recordBackupStatus(supabase, result, auto = false) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from(SETTINGS_TABLE).upsert({
    key: BACKUP_STATUS_KEY,
    value: { date: today, timestamp: new Date().toISOString(), folder: result.folder, succeeded: result.succeeded, failed: result.failed, auto },
    updated_at: new Date().toISOString(),
  });
}

// Volá se jednou při startu appky. Nic neudělá, pokud: OneDrive není
// nastavené / sdílený účet není platný, dnešní záloha už proběhla, nebo právě
// běží (zámek) v jiném prohlížeči. Běží potichu na pozadí — bez progress baru,
// bez alertů; případné selhání se jen zapíše do stavu zálohy pro OneDrivePanel.
export async function maybeAutoBackup(supabase) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const last = await getLastBackupInfo(supabase);
    if (last?.date === today) return; // dnes už proběhla (automaticky i ručně)

    const { data: lockRow } = await supabase.from(SETTINGS_TABLE).select("value").eq("key", BACKUP_LOCK_KEY).maybeSingle();
    const lockedAt = lockRow?.value?.startedAt ? new Date(lockRow.value.startedAt).getTime() : 0;
    if (lockedAt && Date.now() - lockedAt < LOCK_TTL_MS) return; // jiný prohlížeč právě zálohuje

    await supabase.from(SETTINGS_TABLE).upsert({ key: BACKUP_LOCK_KEY, value: { startedAt: new Date().toISOString() }, updated_at: new Date().toISOString() });

    const connected = isConnected() || await connectSharedAccount();
    if (!connected) return; // OneDrive vůbec nepřipojené — nemá smysl zkoušet

    const result = await backupToOneDrive(supabase);
    await recordBackupStatus(supabase, result, true);
  } catch (e) {
    console.warn("Automatická záloha OneDrive selhala:", e.message);
  }
}
