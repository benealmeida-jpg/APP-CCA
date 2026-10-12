-- Zona rural e região metropolitana (pendência d06-rural-rm)
-- 1) FGTS (MCMV, Pró-Cotista e uso do saldo) só para imóvel residencial urbano: o app bloqueia zona rural nessas linhas.
-- 2) Uso do saldo do FGTS: imóvel na cidade onde o comprador trabalha ou mora há 1 ano+ (inclui vizinhas e a mesma RM),
--    e o comprador não pode ter imóvel residencial nessa região nem financiamento ativo no SFH.
alter table public.clientes
  add column if not exists fgts_local_ok boolean,
  add column if not exists fgts_tem_imovel_regiao boolean;

-- As faixas rurais (renda anual) são do MCMV Rural (Entidade Organizadora). Ficam só como referência.
update public.parametros set descricao = 'MCMV Rural (só via Entidade Organizadora, não usado no CCA) – Faixa Rural 1: renda bruta familiar anual até' where chave = 'mcmv_faixa1_rural_anual';
update public.parametros set descricao = 'MCMV Rural (só via Entidade Organizadora, não usado no CCA) – Faixa Rural 2: renda anual até' where chave = 'mcmv_faixa2_rural_anual';
update public.parametros set descricao = 'MCMV Rural (só via Entidade Organizadora, não usado no CCA) – Faixa Rural 3: renda anual até' where chave = 'mcmv_faixa3_rural_anual';
update public.parametros set descricao = 'Sem Faixa 4 rural na Portaria MCID 333/2026 – não usado' where chave = 'mcmv_faixa4_rural_anual';
