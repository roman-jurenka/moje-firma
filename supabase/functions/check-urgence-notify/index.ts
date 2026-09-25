// Zrušeno (audit 2026-09): starší předchůdce funkce hlaseni-odeslat.
// Původní verze neměla žádnou ochranu a kdokoli ji mohl spustit a poslat
// Pushover notifikaci. Funkci je možné v Supabase dashboardu smazat.
Deno.serve(() => new Response(JSON.stringify({ chyba: 'Funkce byla zrušena, použij hlaseni-odeslat.' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
