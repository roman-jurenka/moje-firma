-- Uložený podpis (vzor) — každý uživatel si jednou nakreslí podpis a nastaví
-- si vlastní PIN. Příště pak dokumenty podepisuje jen zadáním PINu, bez
-- nutnosti znovu kreslit. PIN se neukládá v čitelné podobě, jen jako SHA-256 otisk.
-- Spustit ručně v Supabase SQL editoru.

create table if not exists saved_signatures (
  id bigint generated always as identity primary key,
  owner_auth_id uuid not null unique,   -- vazba na přihlášeného uživatele (auth.users.id)
  owner_name text,
  signature text not null,               -- base64 PNG vzoru podpisu
  pin_hash text not null,                -- SHA-256 otisk PINu, který si uživatel sám zvolil
  updated_at timestamptz not null default now()
);

alter table saved_signatures enable row level security;

create policy "saved_signatures_all" on saved_signatures
  for all to authenticated using (true) with check (true);
