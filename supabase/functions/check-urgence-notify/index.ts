// supabase/functions/check-urgence-notify/index.ts
//
// POZOR (audit 2026-09): starší předchůdce funkce hlaseni-odeslat. Nic ji
// pravidelně nevolá (pg_cron volá jen hlaseni-odeslat) a je nasazená bez
// ověření přihlášení (verify_jwt = false) ani vlastního tokenu — kdokoli,
// kdo zná adresu, může spustit odeslání Pushover notifikace. Doporučeno
// ji v Supabase smazat.
//
// Kontroluje urgentni_zakazky, urgentni_faktury, urgentni_sklad,
// urgentni_dochazka a denni_souhrn_prikazy a posila jednu souhrnnou
// notifikaci pres Pushover.
//
// Potrebne secrets (Project Settings -> Edge Functions -> Secrets):
//   PUSHOVER_TOKEN, PUSHOVER_USER
// SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY jsou k dispozici automaticky.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const pushoverToken = Deno.env.get('PUSHOVER_TOKEN')!
const pushoverUser = Deno.env.get('PUSHOVER_USER')!

Deno.serve(async (_req) => {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const [zakazky, faktury, sklad, dochazka, souhrn] = await Promise.all([
    supabase.from('urgentni_zakazky').select('*'),
    supabase.from('urgentni_faktury').select('*'),
    supabase.from('urgentni_sklad').select('*'),
    supabase.from('urgentni_dochazka').select('*'),
    supabase.from('denni_souhrn_prikazy').select('*').single(),
  ])

  const zprava: string[] = []

  if (zakazky.data?.length) {
    zprava.push(
      `⚠️ Zpožděné zakázky (${zakazky.data.length}): ${zakazky.data.map((z: any) => z.name).join(', ')}`
    )
  }

  if (faktury.data?.length) {
    zprava.push(
      `💰 Faktury po splatnosti (${faktury.data.length}): ${faktury.data.map((f: any) => f.number).join(', ')}`
    )
  }

  if (sklad.data?.length) {
    zprava.push(
      `📦 Sklad pod minimem (${sklad.data.length}): ${sklad.data.map((s: any) => s.name).join(', ')}`
    )
  }

  if (dochazka.data?.length) {
    zprava.push(`🕒 Chybějící docházka: ${dochazka.data.map((d: any) => d.name).join(', ')}`)
  }

  if (souhrn.data) {
    const s = souhrn.data as any
    zprava.push(
      `📋 Příkazy (24h): ${s.zpracovano_24h} zpracováno, ${s.ceka_na_schvaleni} čeká na schválení, ${s.chyby_24h} chyb`
    )
  }

  if (zprava.length === 0) {
    return new Response(JSON.stringify({ status: 'ok', message: 'Nic k hlaseni' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const jeUrgentni = Boolean(zakazky.data?.length || faktury.data?.length || sklad.data?.length)

  const pushoverRes = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: pushoverToken,
      user: pushoverUser,
      title: 'Co máme — denní přehled',
      message: zprava.join('\n'),
      priority: jeUrgentni ? 1 : 0,
    }),
  })

  return new Response(
    JSON.stringify({ status: 'sent', pushover: await pushoverRes.json() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
