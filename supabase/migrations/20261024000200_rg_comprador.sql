-- RG e órgão emissor de cada comprador (preenche a carta de cancelamento e o requerimento da busca de bens)
alter table public.clientes add column if not exists rg_numero text;
alter table public.clientes add column if not exists rg_orgao text;
alter table public.participantes add column if not exists rg_numero text;
alter table public.participantes add column if not exists rg_orgao text;
