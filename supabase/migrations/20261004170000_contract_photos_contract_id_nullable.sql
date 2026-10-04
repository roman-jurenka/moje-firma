-- Fotky z obhlidky (a servisu) jeste nemaji zakazku - vazi se pres prubeh_id / ticket_id
-- a k zakazce se priradi samy (trigger zakazky_prubeh_prirad_fotky), az vznikne.
alter table public.contract_photos alter column contract_id drop not null;
