import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// gps-prijem
// Volá ji večerní úloha „Jízdy z GPS Dozoru“ (Claude v Chromu čte Knihu jízd
// na o1.gpsguard.eu). Uloží vozidlo a jeho jízdy do gps_vozidla / gps_jizdy
// (duplicity podle vozidlo + datum + začátek se přepíší). Nic dalšího nemění —
// jízdy se jen zobrazují ve schvalování docházky.
//
// Auth: stejný sdílený klíč jako faktury-prijem (secret FAKTURY_PRIJEM_TOKEN),
// posílá se jako `Authorization: Bearer <klíč>`. Nasazená s verify_jwt=false.
//
// GET (stejný klíč) vrátí poslední uloženou jízdu každého vozidla a počty jízd
// po dnech, aby úloha věděla, od kterého dne dopisovat a které dny chybí.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

interface Jizda {
  datum: string;        // YYYY-MM-DD
  zacatek: string;      // HH:MM
  konec?: string;       // HH:MM
  z_adresa?: string;    // počáteční bod
  do_adresa?: string;   // cílový bod
  km?: number;
  doba_min?: number;    // čas jízdy v minutách
  stani_min?: number;   // stání v minutách
}
interface Vstup {
  vozidlo: { kod: string; nazev?: string; spz?: string };
  jizdy: Jizda[];
}

const cas = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : null);
const datum = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const ocekavany = Deno.env.get("FAKTURY_PRIJEM_TOKEN");
  const prisly = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!ocekavany || prisly !== ocekavany) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // poslední zápis za každé vozidlo
  if (req.method === "GET") {
    const { data: vozidla, error } = await supabase.from("gps_vozidla").select("kod, nazev, spz");
    if (error) return json({ error: "vozidla_select_failed", detail: error.message }, 500);
    const out = [];
    for (const v of vozidla ?? []) {
      const { data: posl } = await supabase.from("gps_jizdy").select("datum, zacatek, konec")
        .eq("vozidlo_kod", v.kod).order("datum", { ascending: false }).order("zacatek", { ascending: false })
        .limit(1).maybeSingle();
      // počty jízd po dnech za posledních 35 dní — úloha je porovná s Knihou jízd a doplní vynechané dny
      const { data: radky } = await supabase.from("gps_jizdy").select("datum, km")
        .eq("vozidlo_kod", v.kod).gte("datum", new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10));
      const dny: Record<string, { pocet: number; km: number }> = {};
      for (const r of radky ?? []) {
        const d = (dny[r.datum] ??= { pocet: 0, km: 0 });
        d.pocet++; d.km = Math.round((d.km + Number(r.km ?? 0)) * 10) / 10;
      }
      out.push({
        ...v, posledni_datum: posl?.datum ?? null, posledni_zacatek: posl?.zacatek ?? null, posledni_konec: posl?.konec ?? null,
        dny: Object.entries(dny).sort(([a], [b]) => a.localeCompare(b)).map(([datum, x]) => ({ datum, ...x })),
      });
    }
    return json({ ok: true, vozidla: out });
  }

  let vstup: Vstup;
  try { vstup = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const kod = String(vstup?.vozidlo?.kod ?? "").trim();
  if (!kod) return json({ error: "missing_vozidlo_kod" }, 400);
  if (!Array.isArray(vstup.jizdy)) return json({ error: "missing_jizdy" }, 400);

  // vozidlo: nové dostane výchozího řidiče z nastavení, existující se jen doplní
  const { data: stavajici } = await supabase.from("gps_vozidla").select("kod").eq("kod", kod).maybeSingle();
  if (!stavajici) {
    const { data: nast } = await supabase.from("app_settings").select("value").eq("key", "gps_vychozi_ridic").maybeSingle();
    const { error } = await supabase.from("gps_vozidla").insert({
      kod, nazev: vstup.vozidlo.nazev ?? null, spz: vstup.vozidlo.spz ?? null,
      ridic_employee_id: nast?.value?.employee_id ?? null,
    });
    if (error) return json({ error: "vozidlo_insert_failed", detail: error.message }, 500);
  } else {
    await supabase.from("gps_vozidla").update({
      ...(vstup.vozidlo.nazev ? { nazev: vstup.vozidlo.nazev } : {}),
      ...(vstup.vozidlo.spz ? { spz: vstup.vozidlo.spz } : {}),
    }).eq("kod", kod);
  }

  const radky = vstup.jizdy
    .map((j) => ({
      vozidlo_kod: kod, datum: datum(j.datum), zacatek: cas(j.zacatek), konec: cas(j.konec),
      z_adresa: j.z_adresa ?? null, do_adresa: j.do_adresa ?? null,
      km: Number.isFinite(Number(j.km)) ? Number(j.km) : null,
      doba_min: Number.isFinite(Number(j.doba_min)) ? Math.round(Number(j.doba_min)) : null,
      stani_min: Number.isFinite(Number(j.stani_min)) ? Math.round(Number(j.stani_min)) : null,
    }))
    .filter((r) => r.datum && r.zacatek);
  if (!radky.length) return json({ ok: true, ulozeno: 0 });

  const { error } = await supabase.from("gps_jizdy").upsert(radky, { onConflict: "vozidlo_kod,datum,zacatek" });
  if (error) return json({ error: "jizdy_upsert_failed", detail: error.message }, 500);
  return json({ ok: true, ulozeno: radky.length, vynechano: vstup.jizdy.length - radky.length });
});
