-- CTPS do comprador (número e série), pedida pelo SIOPI para renda formal e uso do FGTS
alter table public.clientes add column if not exists ctps_numero text;
alter table public.clientes add column if not exists ctps_serie text;
alter table public.participantes add column if not exists ctps_numero text;
alter table public.participantes add column if not exists ctps_serie text;

-- Nome do documento deixa claro que a CTPS digital em PDF é a preferida
update public.tipos_documento set nome = 'Carteira de trabalho (de preferência a CTPS digital em PDF)' where codigo = 'CARTEIRA_TRABALHO';
update public.tipos_documento set nome = 'Carteira de trabalho em PDF (de preferência a CTPS digital)' where codigo = 'CARTEIRA_TRABALHO';
