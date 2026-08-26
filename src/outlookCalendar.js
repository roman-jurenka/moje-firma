// ─── Outlook Kalendář + Úkoly — OAuth2 PKCE + Microsoft Graph API ────────────
// Na rozdíl od OneDrive (jeden sdílený firemní účet) je tohle OSOBNÍ připojení
// každého zaměstnance k JEHO VLASTNÍMU Outlook účtu — kalendář a úkoly jsou
// soukromá věc člověka, ne firemní sdílený prostor. Token se ukládá do
// Supabase (tabulka calendar_connections) chráněné RLS tak, že řádek smí
// číst/zapisovat jen jeho vlastník (auth.uid() = profile_id) — nikdo jiný
// v appce (ani admin přes běžný klientský přístup) se k cizímu tokenu nedostane.
//
// Synchronizace je jen JEDNOSMĚRNÁ: co vytvoříš/upravíš v ProudOS (kalendářní
// akce, úkol s termínem) se pošle do Outlooku. Změny udělané přímo v Outlooku
// se do appky nevrací — jednodušší a bez rizika konfliktů.
//
// Použitá Azure appka je stejná jako u OneDrive integrace (stejný CLIENT_ID),
// jen potřebuje navíc povolená oprávnění Calendars.ReadWrite a Tasks.ReadWrite
// v Azure Portal → App registrations → (tahle appka) → API permissions.

import { supabase } from "./supabase.js";

export const CAL_CLIENT_ID = "acc593cf-5c70-408d-bc5d-ccb99a043972";
const TENANT = "common"; // multitenant — funguje pro firemní i osobní Microsoft účty
const REDIRECT_URI = window.location.origin + "/";
const SCOPES = "User.Read Calendars.ReadWrite Tasks.ReadWrite offline_access";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";
const TASK_LIST_NAME = "ProudOS úkoly";

// PKCE state se ukládá pod jiným klíčem než OneDrive (od_...), ať se ty dva
// nezávislé OAuth flow nepletou, i když sdílí stejnou redirect_uri.
const LS = {
  set: (k, v) => localStorage.setItem("cal_" + k, JSON.stringify(v)),
  get: (k) => { try { return JSON.parse(localStorage.getItem("cal_" + k)); } catch { return null; } },
  del: (k) => localStorage.removeItem("cal_" + k),
};

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

async function myProfileId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// ─── Stav připojení (cache v paměti pro tuto session appky) ──────────────────
let cachedConnection = null;

export async function getConnection(forceReload = false) {
  if (cachedConnection && !forceReload) return cachedConnection;
  const profileId = await myProfileId();
  if (!profileId) return null;
  const { data } = await supabase.from("calendar_connections").select("*")
    .eq("profile_id", profileId).eq("provider", "outlook").maybeSingle();
  cachedConnection = data || null;
  return cachedConnection;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export async function login() {
  const { verifier, challenge } = await generatePKCE();
  const state = base64url(crypto.getRandomValues(new Uint8Array(8)));
  LS.set("pkce_verifier", verifier);
  LS.set("pkce_state", state);

  const params = new URLSearchParams({
    client_id: CAL_CLIENT_ID,
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

// ─── CALLBACK — zavolej po přesměrování zpět do appky ────────────────────────
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return false;
  if (state !== LS.get("pkce_state")) return false; // patří jinému OAuth flow (např. OneDrive) — tenhle handler mlčky skončí

  const verifier = LS.get("pkce_verifier");
  const body = new URLSearchParams({
    client_id: CAL_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  const res = await fetch(`${AUTH_BASE}/token`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const data = await res.json();
  if (data.error) { console.error("Outlook token error:", data); return false; }

  const profileId = await myProfileId();
  if (!profileId) return false;

  const meRes = await fetch(`${GRAPH}/me`, { headers: { Authorization: "Bearer " + data.access_token } });
  const me = await meRes.json().catch(() => ({}));

  await supabase.from("calendar_connections").upsert({
    profile_id: profileId,
    provider: "outlook",
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    connected_email: me.mail || me.userPrincipalName || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id,provider" });

  LS.del("pkce_verifier");
  LS.del("pkce_state");
  window.history.replaceState({}, "", window.location.pathname);
  await getConnection(true);
  return true;
}

// ─── ODPOJENÍ ─────────────────────────────────────────────────────────────────
export async function disconnect() {
  const profileId = await myProfileId();
  if (!profileId) return;
  await supabase.from("calendar_connections").delete().eq("profile_id", profileId).eq("provider", "outlook");
  cachedConnection = null;
}

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────
async function getValidToken() {
  const conn = await getConnection();
  if (!conn) throw new Error("Outlook není připojen");
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60000) return conn.access_token;

  const body = new URLSearchParams({
    client_id: CAL_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
    scope: SCOPES,
  });
  const res = await fetch(`${AUTH_BASE}/token`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const data = await res.json();
  if (data.error) throw new Error("Obnovení Outlook tokenu selhalo: " + data.error_description);

  const patch = {
    access_token: data.access_token,
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (data.refresh_token) patch.refresh_token = data.refresh_token;
  await supabase.from("calendar_connections").update(patch).eq("id", conn.id);
  cachedConnection = { ...conn, ...patch };
  return data.access_token;
}

// ─── GRAPH helpers ────────────────────────────────────────────────────────────
async function graphFetch(path, options = {}) {
  const token = await getValidToken();
  const res = await fetch(GRAPH + path, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph ${options.method || "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Seznam úkolů "ProudOS úkoly" v Microsoft To Do (vytvoří se při prvním použití) ──
async function ensureTaskList() {
  const conn = await getConnection();
  if (conn?.outlook_task_list_id) return conn.outlook_task_list_id;

  const lists = await graphFetch("/me/todo/lists");
  let list = (lists.value || []).find(l => l.displayName === TASK_LIST_NAME);
  if (!list) list = await graphFetch("/me/todo/lists", { method: "POST", body: JSON.stringify({ displayName: TASK_LIST_NAME }) });

  await supabase.from("calendar_connections").update({ outlook_task_list_id: list.id }).eq("id", conn.id);
  cachedConnection = { ...conn, outlook_task_list_id: list.id };
  return list.id;
}

// ─── PUSH kalendářní události ────────────────────────────────────────────────
// event: { title, date (YYYY-MM-DD), work_type, customer_name, address,
//          work_description, contact_name, contact_phone, outlook_event_id }
// Vrátí outlook_event_id — volající si ho uloží zpět do calendar_events.outlook_event_id,
// ať se příště stejná událost jen upraví (PATCH), ne duplikuje.
export async function pushCalendarEvent(event) {
  const body = {
    subject: `${event.work_type || "Práce"}${event.customer_name ? " – " + event.customer_name : ""}${event.title ? ": " + event.title : ""}`,
    body: { contentType: "text", content: [event.work_description, event.address, event.contact_name, event.contact_phone].filter(Boolean).join("\n") },
    start: { dateTime: `${event.date}T08:00:00`, timeZone: "Europe/Prague" },
    end: { dateTime: `${event.date}T17:00:00`, timeZone: "Europe/Prague" },
    isAllDay: false,
    ...(event.address ? { location: { displayName: event.address } } : {}),
  };
  if (event.outlook_event_id) {
    await graphFetch(`/me/events/${event.outlook_event_id}`, { method: "PATCH", body: JSON.stringify(body) });
    return event.outlook_event_id;
  }
  const created = await graphFetch("/me/events", { method: "POST", body: JSON.stringify(body) });
  return created.id;
}

export async function deleteCalendarEvent(outlookEventId) {
  if (!outlookEventId) return;
  try { await graphFetch(`/me/events/${outlookEventId}`, { method: "DELETE" }); } catch { /* už neexistuje nebo bez přístupu — nevadí */ }
}

// ─── PUSH úkolu do Microsoft To Do ───────────────────────────────────────────
// task: { title, due (YYYY-MM-DD), done, outlook_task_id }
export async function pushTask(task) {
  const listId = await ensureTaskList();
  const body = {
    title: task.title,
    status: task.done ? "completed" : "notStarted",
    ...(task.due ? { dueDateTime: { dateTime: `${task.due}T00:00:00`, timeZone: "Europe/Prague" } } : {}),
  };
  if (task.outlook_task_id) {
    await graphFetch(`/me/todo/lists/${listId}/tasks/${task.outlook_task_id}`, { method: "PATCH", body: JSON.stringify(body) });
    return task.outlook_task_id;
  }
  const created = await graphFetch(`/me/todo/lists/${listId}/tasks`, { method: "POST", body: JSON.stringify(body) });
  return created.id;
}

export async function deleteTask(outlookTaskId) {
  if (!outlookTaskId) return;
  const conn = await getConnection();
  if (!conn?.outlook_task_list_id) return;
  try { await graphFetch(`/me/todo/lists/${conn.outlook_task_list_id}/tasks/${outlookTaskId}`, { method: "DELETE" }); } catch { /* nevadí */ }
}
