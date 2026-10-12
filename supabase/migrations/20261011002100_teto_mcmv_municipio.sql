-- Teto do imóvel nas Faixas 1 e 2 do MCMV por município (tabela oficial da Caixa, Agente Operador do FGTS)
alter table public.municipios
  add column if not exists teto_mcmv_f12 numeric(12,2),
  add column if not exists recorte_mcmv text,
  add column if not exists populacao_mcmv integer,
  add column if not exists teto_vigencia date;

-- Teto do município gravado no cliente no momento do cadastro
alter table public.clientes add column if not exists imovel_teto_f12 numeric(12,2);

-- Região metropolitana (RM, RIDE ou aglomeração urbana) e hierarquia REGIC, conforme a mesma tabela da Caixa
alter table public.municipios
  add column if not exists regiao_metropolitana boolean,
  add column if not exists nome_rm text,
  add column if not exists hierarquia_regic text;
-- Carga: data/tetos_mcmv_codigos.json (gerado da planilha oficial), aplicada via extensão http no Supabase.
