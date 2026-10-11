-- Localização do imóvel, valor, cotista FGTS e enquadramento (faixa MCMV e prazo máximo)
alter table public.clientes
  add column if not exists imovel_uf text,
  add column if not exists imovel_municipio text,
  add column if not exists imovel_zona text check (imovel_zona in ('Urbana', 'Rural')),
  add column if not exists imovel_regiao_metropolitana boolean,
  add column if not exists valor_imovel numeric(14,2),
  add column if not exists cotista_fgts boolean,
  add column if not exists faixa_mcmv smallint,
  add column if not exists prazo_maximo_meses smallint;

insert into public.parametros (chave, valor, descricao) values
  ('mcmv_faixa1_urbana', '3200', 'MCMV urbano – Faixa 1: renda bruta familiar mensal até (Portaria MCID 333/2026)'),
  ('mcmv_faixa2_urbana', '5000', 'MCMV urbano – Faixa 2: renda mensal até'),
  ('mcmv_faixa3_urbana', '9600', 'MCMV urbano – Faixa 3: renda mensal até'),
  ('mcmv_faixa4_urbana', '13000', 'MCMV urbano – Faixa 4: renda mensal até (acima disso não é MCMV)'),
  ('mcmv_faixa1_rural_anual', '50000', 'MCMV rural – Faixa 1: renda bruta familiar anual até'),
  ('mcmv_faixa2_rural_anual', '70900', 'MCMV rural – Faixa 2: renda anual até'),
  ('mcmv_faixa3_rural_anual', '134000', 'MCMV rural – Faixa 3: renda anual até'),
  ('mcmv_faixa4_rural_anual', '165000', 'MCMV rural – Faixa 4: renda anual até'),
  ('mcmv_teto_imovel_faixa12', '275000', 'Teto do imóvel nas Faixas 1 e 2 (maior teto municipal; varia de R$ 210 mil a R$ 275 mil por município)'),
  ('mcmv_teto_imovel_faixa3', '400000', 'Teto do imóvel na Faixa 3'),
  ('mcmv_teto_imovel_faixa4', '600000', 'Teto do imóvel na Faixa 4 (acima disso não é MCMV)'),
  ('idade_maxima_final', '85', 'Idade máxima do comprador mais velho ao fim do financiamento (anos)'),
  ('prazo_maximo_meses', '420', 'Prazo máximo do financiamento na Caixa (meses)')
on conflict (chave) do nothing;
