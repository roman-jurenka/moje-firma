import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// gps-sync
// Stáhne jízdy služebních aut přímo z API GPS Dozoru (https://a1.gpsguard.eu/api/v1/)
// a uloží je do gps_vozidla / gps_jizdy — stejně jako gps-prijem, jen bez Chromu.
// Každý běh projde posledních `dni` dní (výchozí 31), takže dopíše nové jízdy
// i doplní dny, které dřív chyběly. Den, za který API vrátí jízdy, se nahradí
// celý (jízdy, které GPS Dozor mezitím sloučil nebo přečasoval, nezůstanou viset).
//
// Přihlášení do API: secrets GPSDOZOR_USER a GPSDOZOR_PASS (Basic auth).
// Spouští ji pg_cron (hlavička x-cron-secret = tajemství hlaseni_cron_secret z Vaultu),
// ručně jde zavolat se sdíleným klíčem `Authorization: Bearer <FAKTURY_PRIJEM_TOKEN>`.
// Nasazená s verify_jwt=false. Volitelné body: {"dni": 7}.
// Výsledek posledního běhu je v app_settings pod klíčem gps_sync_stav.

const API = "https://a1.gpsguard.eu/api/v1";
const TZ = "Europe/Prague";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function authorize(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await db.rpc("hlaseni_cron_tajemstvi");
    return !!data && safeEqual(secret, String(data));
  }
  const token = Deno.env.get("FAKTURY_PRIJEM_TOKEN");
  const prisly = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return !!token && !!prisly && safeEqual(prisly, token);
}

// UTC čas z API → místní datum a čas (YYYY-MM-DD, HH:MM)
const fmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const mistni = (iso: string) => {
  const [d, t] = fmt.format(new Date(iso)).split(" ");
  return { datum: d, cas: t };
};
const minuty = (s?: string) => {
  const m = /^(\d+):(\d{2})/.exec(s ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// datum+čas pro parametry API (bez zóny), posun o dny od teď
const apiCas = (d: Date) => d.toISOString().slice(0, 16);

interface ApiJizda {
  Id: number; StartTime: string; FinishTime: string; StartAddress?: string; FinishAddress?: string;
  TotalDistance?: number; TripLength?: string; TripWaitingTime?: string; IsFinished?: boolean;
}

async function api<T>(path: string, auth: string): Promise<T> {
  const r = await fetch(API + path, { headers: { Authorization: auth, Accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(`GPS Dozor ${r.status} ${path.split("?")[0]}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function ulozStav(stav: unknown) {
  await db.from("app_settings").upsert({ key: "gps_sync_stav", value: stav }, { onConflict: "key" });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);

  const user = Deno.env.get("GPSDOZOR_USER");
  const pass = Deno.env.get("GPSDOZOR_PASS");
  if (!user || !pass) {
    const stav = { cas: new Date().toISOString(), ok: false, chyba: "chybi_prihlaseni_gpsdozor (secrets GPSDOZOR_USER / GPSDOZOR_PASS)" };
    await ulozStav(stav);
    return json(stav, 500);
  }
  const auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)));

  let body: { dni?: number } = {};
  try { body = await req.json(); } catch { /* prázdné body je v pořádku */ }
  const dni = Math.min(Math.max(Math.round(Number(body.dni) || 31), 1), 31);

  const ted = new Date();
  const odDatum = mistni(new Date(ted.getTime() - (dni - 1) * 864e5).toISOString()).datum;
  // API nesnese budoucí „to“ ani dlouhý rozsah → po týdnech, s dnem rezervy kvůli časové zóně
  const okna: [string, string][] = [];
  for (let zac = new Date(ted.getTime() - (dni + 1) * 864e5); zac < ted; ) {
    const kon = new Date(Math.min(zac.getTime() + 7 * 864e5, ted.getTime()));
    okna.push([apiCas(zac), apiCas(kon)]);
    zac = kon;
  }

  const vysledek: Record<string, unknown>[] = [];
  try {
    const skupiny = await api<{ Code: string }[]>("/groups", auth);
    const vozidla: { Code: string; Name?: string; SPZ?: string }[] = [];
    for (const g of skupiny) vozidla.push(...await api<typeof vozidla>(`/vehicles/group/${encodeURIComponent(g.Code)}`, auth));

    const { data: nast } = await db.from("app_settings").select("value").eq("key", "gps_vychozi_ridic").maybeSingle();

    for (const v of vozidla) {
      const kod = v.Code;
      // vozidlo: nové dostane výchozího řidiče z nastavení, existující se jen doplní
      const { data: stavajici } = await db.from("gps_vozidla").select("kod").eq("kod", kod).maybeSingle();
      if (!stavajici) {
        const { error } = await db.from("gps_vozidla").insert({
          kod, nazev: v.Name ?? null, spz: v.SPZ ?? null, ridic_employee_id: nast?.value?.employee_id ?? null,
        });
        if (error) throw new Error(`vozidlo ${kod}: ${error.message}`);
      } else {
        await db.from("gps_vozidla").update({
          ...(v.Name ? { nazev: v.Name } : {}), ...(v.SPZ ? { spz: v.SPZ } : {}),
        }).eq("kod", kod);
      }

      const videne = new Set<number>();
      const radky = [];
      for (const [from, to] of okna) {
        const jizdy = await api<ApiJizda[]>(`/vehicle/${encodeURIComponent(kod)}/trips?from=${from}&to=${to}`, auth);
        for (const j of jizdy) {
          if (videne.has(j.Id) || j.IsFinished === false) continue;
          videne.add(j.Id);
          const z = mistni(j.StartTime), k = mistni(j.FinishTime);
          if (z.datum < odDatum) continue;
          radky.push({
            vozidlo_kod: kod, datum: z.datum, zacatek: z.cas, konec: k.cas,
            z_adresa: j.StartAddress ?? null, do_adresa: j.FinishAddress ?? null,
            km: Number.isFinite(Number(j.TotalDistance)) ? Math.round(Number(j.TotalDistance) * 10) / 10 : null,
            doba_min: minuty(j.TripLength), stani_min: minuty(j.TripWaitingTime),
          });
        }
      }

      // dny z API se nahradí celé: smazat uložené jízdy těch dnů, které už v API nejsou
      const dnyApi = [...new Set(radky.map((r) => r.datum))];
      let smazano = 0;
      if (dnyApi.length) {
        const { data: ulozene } = await db.from("gps_jizdy").select("datum, zacatek").eq("vozidlo_kod", kod).in("datum", dnyApi);
        const klice = new Set(radky.map((r) => `${r.datum} ${r.zacatek}`));
        for (const u of ulozene ?? []) {
          const zac = String(u.zacatek).slice(0, 5);
          if (klice.has(`${u.datum} ${zac}`)) continue;
          const { error } = await db.from("gps_jizdy").delete().eq("vozidlo_kod", kod).eq("datum", u.datum).eq("zacatek", u.zacatek);
          if (!error) smazano++;
        }
        const { error } = await db.from("gps_jizdy").upsert(radky, { onConflict: "vozidlo_kod,datum,zacatek" });
        if (error) throw new Error(`jízdy ${kod}: ${error.message}`);
      }
      vysledek.push({ kod, nazev: v.Name, spz: v.SPZ, jizd: radky.length, dnu: dnyApi.length, smazano });
    }
  } catch (e) {
    const stav = { cas: new Date().toISOString(), ok: false, od: odDatum, chyba: String((e as Error).message ?? e), vozidla: vysledek };
    await ulozStav(stav);
    return json(stav, 502);
  }

  const stav = { cas: new Date().toISOString(), ok: true, od: odDatum, vozidla: vysledek };
  await ulozStav(stav);
  return json(stav);
});
