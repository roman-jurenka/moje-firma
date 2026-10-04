-- Odeslané nabídky: uložení kopie na OneDrive (složka Dokumenty zakázky).
-- onedrive_chyba = neúspěšný pokus; dokud není onedrive_url, appka upozorňuje
-- a nabízí Zkusit znovu.
alter table public.nabidky_odeslane add column if not exists onedrive_url text;
alter table public.nabidky_odeslane add column if not exists onedrive_chyba text;
