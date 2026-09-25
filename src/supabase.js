import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rbnqulgmywtvuryabzjc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibnF1bGdteXd0dnVyeWFiempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3ODI3MTgsImV4cCI6MjA5MzM1ODcxOH0.Nl-CLAqRLQQNPSfauzBC0CyJ61Yd7JBrEuIdeK6Sudg'

// ─── Hlídač zápisů ───────────────────────────────────────────────────────────
// Většina míst v appce po zápisu do databáze nekontroluje chybu — když zápis
// neprošel (chybí oprávnění, chybná data…), appka tvrdila, že je uloženo.
// Tady se každý odmítnutý zápis (insert/update/delete) ohlásí událostí
// "dbChyba", kterou MainApp zobrazí jako hlášku dole na obrazovce.
// Nehlásí se: RPC funkce (jejich chyby ukazují volající sami), výpadek sítě
// (ten řeší offline fronta) a 409 = duplicita, se kterou kód počítá (čísla
// faktur, nabídek a zakázek se při srážce zkoušejí znovu).
const ZAPISY = ['POST', 'PATCH', 'PUT', 'DELETE']

const hlidanyFetch = async (input, init = {}) => {
  const res = await fetch(input, init)
  const url = typeof input === 'string' ? input : input.url
  const metoda = (init.method || 'GET').toUpperCase()
  if (!res.ok && res.status !== 409 && ZAPISY.includes(metoda)
      && url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/')) {
    const tabulka = url.split('/rest/v1/')[1].split('?')[0]
    res.clone().json()
      .catch(() => ({ message: `HTTP ${res.status}` }))
      .then(chyba => window.dispatchEvent(new CustomEvent('dbChyba', { detail: { ...chyba, tabulka } })))
  }
  return res
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: hlidanyFetch } })
