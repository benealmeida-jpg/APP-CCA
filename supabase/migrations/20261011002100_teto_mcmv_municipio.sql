-- Teto do imóvel nas Faixas 1 e 2 do MCMV por município (tabela oficial da Caixa, Agente Operador do FGTS)
alter table public.municipios
  add column if not exists teto_mcmv_f12 numeric(12,2),
  add column if not exists recorte_mcmv text,
  add column if not exists populacao_mcmv integer,
  add column if not exists teto_vigencia date;

-- Teto do município gravado no cliente no momento do cadastro
alter table public.clientes add column if not exists imovel_teto_f12 numeric(12,2);
