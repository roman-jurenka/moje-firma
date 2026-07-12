// ─── OneDrive Integration — OAuth2 PKCE + Microsoft Graph API ────────────────
// Osobní Microsoft účet (consumers tenant)
// Nastav CLIENT_ID po registraci aplikace v Azure portálu

export const OD_CLIENT_ID = "acc593cf-5c70-408d-bc5d-ccb99a043972";
const TENANT = "common"; // multitenant — funguje pro firemní i osobní účty
const REDIRECT_URI = window.location.origin + "/";
const SCOPES = "User.Read Files.ReadWrite offline_access";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";
const FOLDER_ROOT = "FirmaCRM";

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

  // Vyčistit URL od OAuth parametrů
  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export function logout() {
  ["access_token", "refresh_token", "token_expires", "user_name", "user_email"].forEach(k => LS.del(k));
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
// Vrátí webUrl (sharing link)
export async function uploadFile(folderPath, fileName, content, contentType = "application/octet-stream") {
  await ensureFolder(folderPath);
  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, "_");
  const fullPath = `${folderPath}/${safeName}`;
  const result = await graphPut(`/me/drive/root:/${fullPath}:/content`, content, contentType);

  // Vytvoř sharing link
  try {
    const share = await graphPost(`/me/drive/items/${result.id}/createLink`, { type: "view", scope: "anonymous" });
    return share.link?.webUrl || result.webUrl;
  } catch {
    return result.webUrl;
  }
}

// Verze pro File objekt z input[type=file]
export async function uploadFileObject(folderPath, file) {
  const buffer = await file.arrayBuffer();
  return uploadFile(folderPath, file.name, buffer, file.type || "application/octet-stream");
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

export async function backupToOneDrive(supabase, onProgress) {
  const date = new Date().toISOString().slice(0, 10);
  const folder = `${FOLDER_ROOT}/Zálohy/${date}`;

  const tables = [
    "contracts", "employees", "attendance", "contract_cost_entries",
    "customers", "deals", "tasks", "invoices", "delivery_notes",
    "delivery_note_items", "harmonogram", "products",
  ];

  onProgress?.("Připravuji zálohu...", 0);

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    onProgress?.(`Exportuji ${table}...`, Math.round((i / tables.length) * 90));
    try {
      const { data } = await supabase.from(table).select("*");
      const csv = toCSV(data || []);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM pro Excel
      const buffer = await blob.arrayBuffer();
      await uploadFile(folder, `${table}.csv`, buffer, "text/csv");
    } catch (e) {
      console.warn(`Záloha tabulky ${table} selhala:`, e.message);
    }
  }

  onProgress?.("Záloha dokončena ✓", 100);
  return `${FOLDER_ROOT}/Zálohy/${date}`;
}
