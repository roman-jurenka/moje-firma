import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// gps-trasa
// Trasa auta za den pro mapu v Knize jízd: body polohy z GPS Dozoru
// (/vehicles/history/{kod}) + začátky a konce jízd. Přihlášení do API
// má jen server (secrets GPSDOZOR_USER / GPSDOZOR_PASS), appka volá tuhle funkci.
// Auth: přihlášený uživatel appky (JWT), nebo sdílený klíč FAKTURY_PRIJEM_TOKEN.
// Body: { kod, datum: "YYYY-MM-DD" } → { body: [{ lat, lng, cas, rychlost }], jizdy: [{ zacatek, konec, z, do }] }
//       { pruzkum: true, kod, datum } → názvy polí, která API vrací (pro ladění)

const API = "https://a1.gpsguard.eu/api/v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

// API bere from/to v místním (pražském) čase — celý den 00:00–23:59
const hraniceDne = (datum: string): [string, string] => [`${datum}T00:00`, `${datum}T23:59`];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
const bod = (p: Record<string, unknown> | undefined) => {
  if (!p) return null;
  const lat = num(p.Latitude ?? p.Lat ?? p.lat), lng = num(p.Longitude ?? p.Lng ?? p.Lon ?? p.lng);
  return lat != null && lng != null && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authH = req.headers.get("authorization") ?? "";
  const nosic = authH.replace(/^Bearer\s+/i, "").trim();
  const token = Deno.env.get("FAKTURY_PRIJEM_TOKEN");
  let ok = !!token && nosic === token;
  if (!ok) {
    const u = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authH } }, auth: { persistSession: false } });
    const { data } = await u.auth.getUser();
    ok = !!data?.user;
  }
  if (!ok) return json({ error: "unauthorized" }, 401);

  let body: { kod?: string; datum?: string; pruzkum?: boolean } = {};
  try { body = await req.json(); } catch { /* níže */ }
  const kod = String(body.kod ?? "").trim();
  const datum = String(body.datum ?? "");
  if (!kod || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json({ error: "missing_kod_or_datum" }, 400);

  const user = Deno.env.get("GPSDOZOR_USER"), pass = Deno.env.get("GPSDOZOR_PASS");
  if (!user || !pass) return json({ error: "gpsdozor_not_configured" }, 500);
  const auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)));
  const api = async (path: string) => {
    const r = await fetch(API + path, { headers: { Authorization: auth, Accept: "application/json" } });
    const t = await r.text();
    if (!r.ok) throw new Error(`GPS Dozor ${r.status}: ${t.slice(0, 160)}`);
    return JSON.parse(t);
  };
  const [od, doo] = hraniceDne(datum);
  const k = encodeURIComponent(kod);

  try {
    const jizdyApi: Record<string, unknown>[] = await api(`/vehicle/${k}/trips?from=${od}&to=${doo}`);
    let historie: Record<string, unknown>[] = [];
    let chybaHistorie: string | null = null;
    try {
      const h = await api(`/vehicles/history/${k}?from=${od}&to=${doo}`);
      historie = Array.isArray(h?.[0]?.Positions) ? h[0].Positions : Array.isArray(h?.Positions) ? h.Positions : [];
    } catch (e) { chybaHistorie = String((e as Error).message ?? e); }

    if (body.pruzkum) {
      return json({ od, doo, jizda_pole: Object.keys(jizdyApi[0] ?? {}), jizda_ukazka: jizdyApi[0] ?? null, historie_pocet: historie.length, historie_pole: Object.keys(historie[0] ?? {}), historie_ukazka: historie[0] ?? null, chybaHistorie });
    }
    // body trasy — vynechat body blíž než ~15 m od předchozího (stání), max. 4000
    const vsechny = historie.map((p) => {
      const b = bod(p);
      return b ? { ...b, cas: String(p.Time ?? ""), rychlost: num(p.Speed) } : null;
    }).filter(Boolean) as { lat: number; lng: number; cas: string; rychlost: number | null }[];
    const body_: typeof vsechny = [];
    for (const b of vsechny) {
      const pr = body_[body_.length - 1];
      if (!pr || Math.abs(pr.lat - b.lat) > 0.00014 || Math.abs(pr.lng - b.lng) > 0.0002) body_.push(b);
    }
    const krok = Math.ceil(body_.length / 4000);
    const ridke = krok > 1 ? body_.filter((_, i) => i % krok === 0) : body_;
    const jizdy = jizdyApi.map((j) => ({
      zacatek: String(j.StartTime ?? ""), konec: String(j.FinishTime ?? ""),
      z: bod(j.StartPosition as Record<string, unknown>), do: bod(j.FinishPosition as Record<string, unknown>),
      z_adresa: j.StartAddress ?? null, do_adresa: j.FinishAddress ?? null, km: num(j.TotalDistance),
    }));
    return json({ body: ridke, jizdy, chybaHistorie });
  } catch (e) {
    return json({ error: "gps_failed", detail: String((e as Error).message ?? e) }, 502);
  }
});
