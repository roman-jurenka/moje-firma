// Supabase Edge Function: invite-employee
//
// Jediné místo v celém systému, kde smí žít "service role" klíč — proto
// tohle nemůže běžet v prohlížeči (appce), ale jen tady, na Supabase serveru.
// Appka tuto funkci volá tlačítkem "Vytvořit přístup a poslat pozvánku" v HR.
//
// Postup nastavení (jen jednou):
// 1. Supabase dashboard → Edge Functions → "Deploy a new function" → "Via Editor"
// 2. Název funkce: invite-employee
// 3. Smaž vzorový kód a vlož místo něj tenhle celý soubor
// 4. Deploy
// Service role klíč (SUPABASE_SERVICE_ROLE_KEY) i URL projektu jsou v Edge
// Functions dostupné automaticky, nic dalšího není potřeba nastavovat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Chybí email." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Ověř, že volá přihlášený uživatel appky (ne kdokoliv zvenčí)
    const authHeader = req.headers.get("Authorization") || "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Nepřihlášeno." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Jen administrátor smí zakládat nové přístupy
    const { data: profile } = await callerClient.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Jen administrátor může zakládat přístupy." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Založ Auth účet a rovnou pošli pozvánku s odkazem na nastavení hesla
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, userId: data.user?.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
