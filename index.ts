// supabase/functions/hlaseni-odeslat/index.ts
//
// Engine modulu Hlášení. Vyhodnocuje pravidla z tabulky hlaseni_pravidla
// (SQL funkce hlaseni_vyhodnot) a posílá zprávy přes Pushover a/nebo Web Push.
//
// Volání:
//   - pg_cron každých 5 minut: hlavička x-cron-secret (tajemství z Vaultu), body {"akce":"tick"}
//     -> ranní souhrn v nastavených časech + okamžitá upozornění (mimo klidné hodiny)
//   - docházka na pozadí: akce "dochazka" (trigger na attendance + tick) posílá zaměstnancům notifikaci s odpracovaným časem
//   - aplikace (jen přihlášený admin, JWT): akce "test" (volitelně kanal: pushover|webpush), "nahled", "souhrn_ted"
//
// Kanály (přepínače v hlaseni_nastaveni):
//   - Pushover: Secrets PUSHOVER_TOKEN (API token aplikace), PUSHOVER_USER (user key)
//   - Web Push (notifikace přímo z aplikace): VAPID klíče jsou ve Vaultu (RPC hlaseni_vapid),
//     odběry zařízení v tabulce push_odbery (admin je zapíná v modulu Hlášení).
// SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY jsou k dispozici automaticky.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUSHOVER_TOKEN = Deno.env.get('PUSHOVER_TOKEN')
const PUSHOVER_USER = Deno.env.get('PUSHOVER_USER')
const APP_URL = 'https://moje-firma.vercel.app'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Pomocné funkce ──────────────────────────────────────────────────────────

function pragueNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)!.value
  const hh = g('hour') === '24' ? '00' : g('hour')
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${hh}:${g('minute')}` }
}
const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0) }
const csDate = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${m}.` }

function inQuietHours(hm: string, od: string, doo: string) {
  const n = toMin(hm), a = toMin(od), b = toMin(doo)
  if (a === b) return false
  return a > b ? (n >= a || n < b) : (n >= a && n < b)
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function authorize(req: Request): Promise<'cron' | 'admin' | null> {
  const secret = req.headers.get('x-cron-secret')
  if (secret) {
    const { data } = await db.rpc('hlaseni_cron_tajemstvi')
    return data && safeEqual(secret, String(data)) ? 'cron' : null
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: p } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return p?.role === 'admin' ? 'admin' : null
}

async function pushover(title: string, message: string, priority: number) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    return { ok: false, chyba: 'Chybí secrets PUSHOVER_TOKEN / PUSHOVER_USER v Edge Functions.', nastaveni: true }
  }
  const body = new URLSearchParams({
    token: PUSHOVER_TOKEN, user: PUSHOVER_USER,
    title: title.slice(0, 250), message: message.slice(0, 1024),
    priority: String(priority), url: APP_URL, url_title: 'Otevřít aplikaci',
  })
  try {
    const r = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body })
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok && j.status === 1, odpoved: JSON.stringify(j).slice(0, 500), chyba: r.ok && j.status === 1 ? null : (j.errors || []).join('; ') || `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, chyba: `Pushover nedostupný: ${(e as Error).message}` }
  }
}

let vapidReady = false
async function initVapid() {
  if (vapidReady) return true
  const { data } = await db.rpc('hlaseni_vapid')
  if (!data?.public || !data?.private) return false
  webpush.setVapidDetails(APP_URL, data.public, data.private)
  vapidReady = true
  return true
}

type Odber = { id: number; endpoint: string; p256dh: string; auth: string }
type PushPayload = {
  title: string; body: string; url?: string
  tag?: string; silent?: boolean; trvale?: boolean
  actions?: { action: string; title: string }[]
}

// Odešle payload na dané odběry. Neplatné odběry (404/410) mažeme.
async function odesliOdberum(odb: Odber[], payload: PushPayload, priority: number) {
  if (!odb.length) return { ok: false, chyba: 'Žádné zařízení nemá zapnuté notifikace v aplikaci.' }
  const data = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 900), url: payload.url || APP_URL })
  let ok = 0
  const chyby: string[] = []
  for (const o of odb) {
    try {
      await webpush.sendNotification({ endpoint: o.endpoint, keys: { p256dh: o.p256dh, auth: o.auth } }, data, { TTL: 3600, urgency: priority > 0 ? 'high' : 'normal' })
      ok++
      await db.from('push_odbery').update({ posledni_uspech: new Date().toISOString() }).eq('id', o.id)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_odbery').delete().eq('id', o.id)
      else chyby.push(`HTTP ${code ?? '?'}: ${(e as Error).message}`.slice(0, 120))
    }
  }
  return ok ? { ok: true, chyba: null } : { ok: false, chyba: chyby.join('; ') || 'Všechna zařízení mají neplatný odběr (odstraněno) – zapni notifikace na telefonu znovu.' }
}

// Web Push na všechna zařízení adminů, která si notifikace zapnula.
async function webPush(title: string, message: string, priority: number) {
  if (!(await initVapid())) return { ok: false, chyba: 'Chybí VAPID klíče (RPC hlaseni_vapid).' }
  const { data: odb, error } = await db.from('push_odbery').select('id, endpoint, p256dh, auth, profiles!inner(role)').eq('profiles.role', 'admin')
  if (error) return { ok: false, chyba: `Načtení odběrů: ${error.message}` }
  return odesliOdberum((odb || []) as Odber[], { title, body: message }, priority)
}

// Web Push na zařízení jednoho profilu (zaměstnance).
async function webPushProfil(profileId: string, payload: PushPayload) {
  if (!(await initVapid())) return { ok: false, chyba: 'Chybí VAPID klíče (RPC hlaseni_vapid).' }
  const { data: odb, error } = await db.from('push_odbery').select('id, endpoint, p256dh, auth').eq('profile_id', profileId)
  if (error) return { ok: false, chyba: `Načtení odběrů: ${error.message}` }
  return odesliOdberum((odb || []) as Odber[], payload, 0)
}

type Nastaveni = { pushover: boolean; webpush: boolean; dochazka_zapnuto?: boolean; dochazka_interval_min?: number; [k: string]: unknown }

// Pošle zprávu všemi zapnutými kanály; úspěch = aspoň jeden kanál doručil.
async function posli(nast: Nastaveni, title: string, message: string, priorita: number) {
  const chyby: string[] = []
  let ok = false
  if (nast.pushover) {
    const r = await pushover(title, message, priorita)
    if (r.ok) ok = true; else chyby.push(`Pushover: ${r.chyba}`)
  }
  if (nast.webpush) {
    const r = await webPush(title, message, priorita)
    if (r.ok) ok = true; else chyby.push(`Push v aplikaci: ${r.chyba}`)
  }
  if (!nast.pushover && !nast.webpush) chyby.push('Není zapnutý žádný kanál.')
  return { ok, chyba: ok ? null : chyby.join('; ') }
}

// Vrátí text problému, pokud zapnuté kanály nemají čím poslat (nic se pak nezapisuje do historie).
async function chybaKanalu(nast: Nastaveni): Promise<string | null> {
  if (nast.pushover && PUSHOVER_TOKEN && PUSHOVER_USER) return null
  if (nast.webpush && (await initVapid())) {
    const { count } = await db.from('push_odbery').select('id', { count: 'exact', head: true })
    if (count) return null
  }
  if (!nast.pushover && !nast.webpush) return 'Není zapnutý žádný kanál (Pushover ani push v aplikaci).'
  return 'Zapnutý kanál není nastavený: doplň PUSHOVER_TOKEN / PUSHOVER_USER v Secrets, nebo zapni notifikace na telefonu (záložka Kanály).'
}

type Rule = {
  id: number; typ: string; nazev: string; zapnuto: boolean; rezim: 'souhrn' | 'okamzite' | 'oboji'
  priorita: number; parametry: Record<string, unknown>; opakovat_po_hodinach: number
}
type Item = { klic: string; radek: string }

async function polozky(rule: Rule, nowLocal: string): Promise<Item[]> {
  const { data, error } = await db.rpc('hlaseni_vyhodnot', { p_typ: rule.typ, p_par: rule.parametry || {}, p_now: nowLocal })
  if (error) throw new Error(`${rule.nazev}: ${error.message}`)
  return (data || []) as Item[]
}

const jeOkamzite = (r: Rule) => r.typ === 'vlastni_pripominka' || r.rezim !== 'souhrn'
const jeSouhrn = (r: Rule) => r.typ !== 'vlastni_pripominka' && r.rezim !== 'okamzite'

function sestavSouhrn(bloky: { rule: Rule; items: Item[] }[], hlavicky = true) {
  for (const cap of [5, 3, 1]) {
    const text = bloky.map(({ rule, items }) => {
      const radky = items.slice(0, cap).map((i) => `• ${i.radek}`)
      if (items.length > cap) radky.push(`… a dalších ${items.length - cap}`)
      return (hlavicky ? `${rule.nazev} (${items.length})\n` : '') + radky.join('\n')
    }).join('\n\n')
    if (text.length <= 1000 || cap === 1) return text.length <= 1024 ? text : text.slice(0, 1020) + '…'
  }
  return ''
}

async function zapisZpravu(z: { kanal: string; slot?: string | null; titulek: string; zprava: string; priorita: number; pocet: number; ok: boolean; odpoved?: string | null }) {
  await db.from('hlaseni_zpravy').insert({
    kanal: z.kanal, slot: z.slot ?? null, titulek: z.titulek, zprava: z.zprava,
    priorita: z.priorita, pocet_polozek: z.pocet, uspech: z.ok, odpoved: z.odpoved ?? null,
  })
}

// Chybu Pushoveru zapíšeme max. jednou za hodinu, ať se historie nezaplaví při výpadku.
async function zapisChybu(kanal: string, titulek: string, chyba: string) {
  const od = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('hlaseni_zpravy').select('id', { count: 'exact', head: true }).eq('uspech', false).gt('created_at', od)
  if (!count) await zapisZpravu({ kanal, titulek, zprava: '', priorita: 0, pocet: 0, ok: false, odpoved: chyba })
}

async function nactiPravidla(): Promise<Rule[]> {
  const { data, error } = await db.from('hlaseni_pravidla').select('*').order('poradi').order('id')
  if (error) throw new Error(error.message)
  return (data || []) as Rule[]
}

// ── Souhrn ──────────────────────────────────────────────────────────────────

async function odesliSouhrn(nast: Nastaveni, rules: Rule[], nowLocal: string, date: string, kanal: 'souhrn' | 'rucne', slot: string | null, posilatPrazdny: boolean) {
  const bloky: { rule: Rule; items: Item[] }[] = []
  for (const rule of rules.filter((r) => r.zapnuto && jeSouhrn(r))) {
    const items = await polozky(rule, nowLocal)
    if (items.length) bloky.push({ rule, items })
  }
  const titulek = `Přehled – ${csDate(date)}`
  if (!bloky.length && !posilatPrazdny) return { status: 'nic', pocet: 0 }

  const problem = await chybaKanalu(nast)
  if (problem) return { status: 'chyba', pocet: 0, chyba: problem }

  // Rezervace slotu (proti dvojímu odeslání při překryvu běhů)
  let claimId: number | null = null
  if (slot) {
    const { data, error } = await db.from('hlaseni_zpravy').insert({ kanal, slot, titulek, uspech: true }).select('id').single()
    if (error) return { status: 'preskoceno', pocet: 0 }
    claimId = data.id
  }

  const zprava = bloky.length ? sestavSouhrn(bloky) : 'Vše v pořádku, nic k hlášení.'
  const priorita = Math.max(0, ...bloky.map((b) => b.rule.priorita))
  const pocet = bloky.reduce((s, b) => s + b.items.length, 0)
  const res = await posli(nast, titulek, zprava, priorita)

  if (res.ok) {
    if (claimId) await db.from('hlaseni_zpravy').update({ zprava, priorita, pocet_polozek: pocet }).eq('id', claimId)
    else await zapisZpravu({ kanal, titulek, zprava, priorita, pocet, ok: true })
  } else {
    // Rezervaci uvolníme, další tick to zkusí znovu; chybu zapíšeme max. 1× za hodinu.
    if (claimId) await db.from('hlaseni_zpravy').delete().eq('id', claimId)
    if (slot) await zapisChybu(kanal, titulek, res.chyba || 'neznámá chyba')
    else await zapisZpravu({ kanal, titulek, zprava, priorita, pocet, ok: false, odpoved: res.chyba })
  }
  return { status: res.ok ? 'odeslano' : 'chyba', pocet, chyba: res.ok ? null : res.chyba }
}

// ── Okamžitá upozornění ─────────────────────────────────────────────────────

async function odesliOkamzita(nast: Nastaveni, rules: Rule[], nowLocal: string) {
  let odeslano = 0
  const problem = await chybaKanalu(nast)
  if (problem) return { odeslano, chyba: problem }
  for (const rule of rules.filter((r) => r.zapnuto && jeOkamzite(r))) {
    const items = await polozky(rule, nowLocal)
    if (!items.length) continue
    const od = new Date(Date.now() - rule.opakovat_po_hodinach * 3600_000).toISOString()
    const { data: videno } = await db.from('hlaseni_log').select('klic').eq('pravidlo_id', rule.id).in('klic', items.map((i) => i.klic)).gt('odeslano_at', od)
    const uzBylo = new Set((videno || []).map((v: { klic: string }) => v.klic))
    const nove = items.filter((i) => !uzBylo.has(i.klic))
    if (!nove.length) continue

    const zprava = sestavSouhrn([{ rule, items: nove }], false)
    const res = await posli(nast, rule.nazev, zprava, rule.priorita)
    if (res.ok) {
      await db.from('hlaseni_log').insert(nove.map((i) => ({ pravidlo_id: rule.id, klic: i.klic })))
      await zapisZpravu({ kanal: 'okamzite', titulek: rule.nazev, zprava, priorita: rule.priorita, pocet: nove.length, ok: true })
      odeslano += nove.length
    } else {
      await zapisChybu('okamzite', rule.nazev, res.chyba || 'neznámá chyba')
    }
  }
  return { odeslano }
}

// ── Docházka na pozadí ──────────────────────────────────────────────────────
// Zaměstnanec s otevřeným příchodem dostane notifikaci „V práci od 7:03“, která se
// každých X minut přepisuje (stejný tag) novým odpracovaným časem. Po zapsání odchodu
// se přepíše závěrečnou zprávou. Spouští ji trigger na tabulce attendance (hned)
// a pg_cron tick (každých 5 min).

const dnesMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const absMin = (d: string, hm: string) => dnesMs(d) / 60000 + toMin(hm.slice(0, 5))
const trvaniText = (min: number) => { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min` }

async function dochazkaTick(nast: { dochazka_zapnuto?: boolean; dochazka_interval_min?: number }) {
  if (nast.dochazka_zapnuto === false) return { stav: 'vypnuto' }
  const { date, hm } = pragueNow()
  const nowAbs = absMin(date, hm)
  const interval = Math.min(240, Math.max(5, nast.dochazka_interval_min || 30))
  const vcera = new Date(dnesMs(date) - 86400_000).toISOString().slice(0, 10)

  const { data: odb } = await db.from('push_odbery').select('profile_id, profiles!inner(employee_id)')
  const profilZaznamu = new Map<number, string>()
  for (const o of (odb || []) as unknown as { profile_id: string; profiles: { employee_id: number | null } | { employee_id: number | null }[] }[]) {
    const pr = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles
    if (pr?.employee_id != null) profilZaznamu.set(Number(pr.employee_id), o.profile_id)
  }
  if (!profilZaznamu.size) return { stav: 'nikdo', odeslano: 0 }

  const { data: rows } = await db.from('attendance').select('id, employee_id, date, checkin, checkout, created_at').gte('date', vcera).not('checkin', 'is', null)
  const cesta = 'https://moje-firma.vercel.app/?rychle='
  const akceTl = [{ action: 'odchod', title: 'Zapsat odchod' }, { action: 'fotky', title: 'Nahrát fotky' }]
  let odeslano = 0

  for (const r of (rows || []) as { id: number; employee_id: number; date: string; checkin: string; checkout: string | null; created_at: string | null }[]) {
    const profil = profilZaznamu.get(Number(r.employee_id))
    if (!profil) continue
    const start = absMin(r.date, r.checkin)
    const { data: ex } = await db.from('dochazka_push').select('*').eq('attendance_id', r.id).maybeSingle()

    if (r.checkout) {
      // odchod zapsán -> závěrečná zpráva (jen když předtím běžela notifikace)
      if (!ex || ex.stav !== 'bezi') continue
      const { data: claimed } = await db.from('dochazka_push').update({ stav: 'konec', posledni_at: new Date().toISOString() }).eq('attendance_id', r.id).eq('stav', 'bezi').select('attendance_id')
      if (!claimed?.length) continue
      let konec = absMin(r.date, r.checkout); if (konec < start) konec += 1440
      await webPushProfil(profil, { title: `Odchod zapsán ${r.checkout.slice(0, 5)}`, body: `Dnes odpracováno ${trvaniText(konec - start)}.`, tag: 'dochazka', url: APP_URL })
      odeslano++
      continue
    }

    let elapsed = nowAbs - start
    // Appka bere „dnešek“ podle UTC, takže mezi 0:00 a 2:00 uloží příchod s datem předchozího dne (o 24 h víc).
    if (elapsed >= 1380 && r.created_at) {
      const zVytvoreni = (Date.now() - new Date(r.created_at).getTime()) / 60000
      if (Math.abs(elapsed - 1440 - zVytvoreni) < 90) elapsed -= 1440
    }
    if (elapsed < 0) continue

    if (elapsed >= 720) {
      // 12 h a víc bez odchodu – jednou upozornit a přestat
      if (ex?.stav === 'zapomenuto' || ex?.stav === 'konec') continue
      if (!ex) {
        const { error } = await db.from('dochazka_push').insert({ attendance_id: r.id, employee_id: r.employee_id, stav: 'zapomenuto' })
        if (error) continue
      } else {
        const { data: claimed } = await db.from('dochazka_push').update({ stav: 'zapomenuto', posledni_at: new Date().toISOString() }).eq('attendance_id', r.id).eq('stav', 'bezi').select('attendance_id')
        if (!claimed?.length) continue
      }
      await webPushProfil(profil, { title: 'Nezapomněl jsi zapsat odchod?', body: `Příchod ${r.checkin.slice(0, 5)} je stále otevřený (${trvaniText(elapsed)}).`, tag: 'dochazka', trvale: true, url: cesta + 'odchod', actions: akceTl })
      odeslano++
      continue
    }

    const zprava = { title: `V práci od ${r.checkin.slice(0, 5)}`, body: `Odpracováno ${trvaniText(elapsed)}. Klepni pro odchod nebo fotky.`, tag: 'dochazka', trvale: true, url: cesta + 'odchod', actions: akceTl }
    if (!ex) {
      const { error } = await db.from('dochazka_push').insert({ attendance_id: r.id, employee_id: r.employee_id })
      if (error) continue // souběžný běh už start odeslal
      await webPushProfil(profil, zprava)
      odeslano++
    } else if (ex.stav === 'bezi' && Date.now() - new Date(ex.posledni_at).getTime() >= (interval - 2) * 60_000) {
      const { data: claimed } = await db.from('dochazka_push').update({ posledni_at: new Date().toISOString() }).eq('attendance_id', r.id).eq('stav', 'bezi').eq('posledni_at', ex.posledni_at).select('attendance_id')
      if (!claimed?.length) continue
      await webPushProfil(profil, { ...zprava, silent: true })
      odeslano++
    }
  }
  return { stav: 'ok', odeslano }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ chyba: 'Použij POST.' }, 405)

  try {
    const role = await authorize(req)
    if (!role) return json({ chyba: 'Neautorizováno.' }, 401)

    const body = await req.json().catch(() => ({}))
    const akce = String(body.akce || 'tick')
    const { date, hm } = pragueNow()
    const nowLocal = `${date} ${hm}:00`

    const { data: nastRow } = await db.from('hlaseni_nastaveni').select('*').eq('id', 1).single()
    if (!nastRow) return json({ chyba: 'Chybí řádek nastavení hlášení.' }, 500)
    const nast = nastRow as Nastaveni & { zapnuto: boolean; souhrn_casy: string[]; klid_od: string; klid_do: string; posilat_prazdny_souhrn: boolean }

    if (akce === 'test') {
      // body.kanal = 'pushover' | 'webpush' zkusí jen daný kanál (i když je jinak vypnutý), jinak všechny zapnuté
      const kanal = body.kanal === 'pushover' || body.kanal === 'webpush' ? body.kanal : null
      const zprava = `Test z aplikace, ${hm}. Když tohle vidíš, hlášení fungují.`
      const res = kanal === 'pushover' ? await pushover('Test hlášení', zprava, 0)
        : kanal === 'webpush' ? await webPush('Test hlášení', zprava, 0)
        : await posli(nast, 'Test hlášení', zprava, 0)
      await zapisZpravu({ kanal: 'test', titulek: `Test hlášení${kanal ? ` (${kanal === 'webpush' ? 'push v aplikaci' : 'Pushover'})` : ''}`, zprava, priorita: 0, pocet: 0, ok: res.ok, odpoved: res.ok ? null : res.chyba })
      return json(res.ok ? { status: 'odeslano' } : { status: 'chyba', chyba: res.chyba }, 200)
    }

    if (akce === 'dochazka') return json({ status: 'ok', dochazka: await dochazkaTick(nast) })

    if (akce === 'nahled') {
      const rules = await nactiPravidla()
      const out = []
      for (const r of rules) {
        try {
          const items = await polozky(r, nowLocal)
          out.push({ id: r.id, pocet: items.length, polozky: items.slice(0, 8).map((i) => i.radek) })
        } catch (e) { out.push({ id: r.id, pocet: 0, polozky: [], chyba: (e as Error).message }) }
      }
      return json({ status: 'ok', pravidla: out })
    }

    if (akce === 'souhrn_ted') {
      const rules = await nactiPravidla()
      return json(await odesliSouhrn(nast, rules, nowLocal, date, 'rucne', null, true))
    }

    if (akce === 'tick') {
      const vysledek: Record<string, unknown> = {}
      vysledek.dochazka = await dochazkaTick(nast).catch((e) => ({ chyba: (e as Error).message }))
      if (!nast.zapnuto) return json({ status: 'vypnuto', ...vysledek })
      const rules = await nactiPravidla()

      // 1) Souhrny v nastavených časech (dohnání zmeškaného běhu max. 60 min po nastaveném čase)
      for (const cas of (nast.souhrn_casy || []) as string[]) {
        const diff = toMin(hm) - toMin(cas)
        if (diff < 0 || diff >= 60) continue
        vysledek[`souhrn_${cas}`] = await odesliSouhrn(nast, rules, nowLocal, date, 'souhrn', `${date} ${cas}`, !!nast.posilat_prazdny_souhrn)
      }

      // 2) Okamžitá upozornění mimo klidné hodiny
      if (!inQuietHours(hm, nast.klid_od, nast.klid_do)) vysledek.okamzita = await odesliOkamzita(nast, rules, nowLocal)
      else vysledek.okamzita = 'klidne_hodiny'

      // 3) Úklid staré historie
      await db.from('hlaseni_log').delete().lt('odeslano_at', new Date(Date.now() - 60 * 86400_000).toISOString())
      await db.from('hlaseni_zpravy').delete().lt('created_at', new Date(Date.now() - 90 * 86400_000).toISOString())

      return json({ status: 'ok', cas: nowLocal, ...vysledek })
    }

    return json({ chyba: `Neznámá akce: ${akce}` }, 400)
  } catch (e) {
    return json({ chyba: (e as Error).message }, 500)
  }
})
