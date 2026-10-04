-- Material z faktury prirazeny do zakazky projde skladem: prijem (warehouse_movement_id)
-- a hned vydej na zakazku (warehouse_movement_out_id).
alter table public.invoice_queue_items add column if not exists warehouse_movement_out_id bigint references public.warehouse_movements(id);
