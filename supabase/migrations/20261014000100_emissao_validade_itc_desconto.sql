-- Data de emissão e validade de certidões; ITC (vendedor com 60 anos ou mais); desconto de 50% nas taxas do cartório
alter table public.tipos_documento
  add column if not exists pede_emissao boolean not null default false,
  add column if not exists validade_dias integer,
  add column if not exists validade_uteis boolean not null default false;
alter table public.documentos add column if not exists emitido_em date;
alter table public.documentos_vendedor add column if not exists emitido_em date;
alter table public.vendedores
  add column if not exists data_nascimento date,
  add column if not exists residencia_municipio text,
  add column if not exists residencia_uf text;
alter table public.clientes
  add column if not exists desconto_cartorio boolean,
  add column if not exists grerj_numero text,
  add column if not exists grerj_valor numeric(12,2),
  add column if not exists grerj_pago_em date,
  add column if not exists requerimento_enviado_em date;

insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, ativo, por_pessoa, por_dependente, alvo, multiplo, pede_emissao, validade_dias, validade_uteis)
values
 ('ONUS_REAIS', 'Certidão de ônus reais (informe a data de emissão; vale 30 dias úteis)', 'Imóvel', '*', '[]', 30, true, false, false, 'imovel', false, true, 30, true),
 ('VEND_ITC_RESIDENCIA', 'Certidão de ITC no endereço de residência do vendedor (vale 90 dias)', 'Vendedor', '*', '[]', 78, true, false, false, 'vendedor_pf', false, true, 90, false),
 ('VEND_ITC_IMOVEL', 'Certidão de ITC no endereço do imóvel (vale 90 dias)', 'Vendedor', '*', '[]', 79, true, false, false, 'vendedor_pf', false, true, 90, false),
 ('CERT_BUSCA_ESCRITURA', 'Certidão de busca específica de escritura (a CCA solicita no cartório distribuidor)', 'Imóvel', '', '[]', 40, true, false, false, 'imovel', false, false, null, false),
 ('CERT_BUSCA_RGI', 'Certidão de busca específica de RGI (a CCA solicita no cartório distribuidor)', 'Imóvel', '', '[]', 41, true, false, false, 'imovel', false, false, null, false)
on conflict (codigo) do update set nome = excluded.nome, pede_emissao = excluded.pede_emissao,
  validade_dias = excluded.validade_dias, validade_uteis = excluded.validade_uteis;

update public.tipos_documento
   set nome = 'Certidão simplificada da JUCERJA (informe a data de emissão; vale 180 dias)', pede_emissao = true, validade_dias = 180, validade_uteis = false
 where codigo = 'VEND_PJ_CERTIDAO_JUNTA';

-- Data de emissão do documento (corretor/equipe do processo ou equipe da CCA)
create or replace function public.definir_emissao_documento(p_doc uuid, p_vendedor boolean, p_data date) returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de emissão inválida'; end if;
  if p_vendedor then select cliente_id into v_cli from public.documentos_vendedor where id = p_doc;
  else select cliente_id into v_cli from public.documentos where id = p_doc; end if;
  if v_cli is null or not public.posso_editar_cliente(v_cli) then raise exception 'Sem permissão'; end if;
  if p_vendedor then update public.documentos_vendedor set emitido_em = p_data where id = p_doc;
  else update public.documentos set emitido_em = p_data where id = p_doc; end if;
end $$;
revoke execute on function public.definir_emissao_documento(uuid, boolean, date) from public, anon;
grant execute on function public.definir_emissao_documento(uuid, boolean, date) to authenticated;

-- documentos do vendedor passam a trazer a data de emissão
-- (o retorno muda: função nova ao lado da antiga, que não é mais usada)
create or replace function public.documentos_do_vendedor_v2(p_cliente uuid)
returns table(id uuid, tipo_codigo text, versao integer, situacao text, enviado_em timestamptz, motivo_recusa text, observacao_recusa text,
              nome_original text, arquivo_path text, vendedor_id uuid, emitido_em date)
language sql stable security definer set search_path = public as $$
  select distinct on (d.tipo_codigo)
         d.id, d.tipo_codigo, d.versao, d.situacao, d.enviado_em, d.motivo_recusa, d.observacao_recusa,
         case when public.sou_equipe() or d.enviado_por = auth.uid() then d.nome_original end,
         case when public.sou_equipe() or d.enviado_por = auth.uid() then d.arquivo_path end,
         d.vendedor_id, d.emitido_em
  from public.clientes c
  join public.documentos_vendedor d on d.vendedor_id = c.vendedor_id and d.situacao <> 'substituido'
  where c.id = p_cliente and public.posso_ver_cliente(p_cliente)
  order by d.tipo_codigo, d.versao desc
$$;
revoke execute on function public.documentos_do_vendedor_v2(uuid) from public, anon;
grant execute on function public.documentos_do_vendedor_v2(uuid) to authenticated;
