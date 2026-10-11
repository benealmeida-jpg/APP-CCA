-- Fator social: os documentos dos dependentes passam a ser ** (sem eles o processo não vai para análise)
update public.tipos_documento set regra = '**'
 where codigo in ('FATOR_SOCIAL_RG_CERTIDAO', 'FATOR_SOCIAL_RG_CNH', 'DECLARACAO_DEPENDENTE');

-- Documentos ** de dependentes que faltam ou foram recusados
create or replace function public.dependentes_bloqueiam_analise(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with c as (
    select cl.id, cl.dependentes_info, coalesce(cl.dependentes, 0) as n
    from public.clientes cl where cl.id = p_cliente
  ),
  dep as (
    select e.valor as info, e.ordem::int as ordem
    from c, jsonb_array_elements(c.dependentes_info) with ordinality as e(valor, ordem)
    where e.ordem <= c.n
  ),
  exigidos as (
    select dep.ordem, t.codigo
    from dep join public.tipos_documento t on t.ativo and t.por_dependente and t.regra = '**'
    where exists (select 1 from jsonb_array_elements(t.condicao) k where dep.info @> k)
  )
  select exists (
    select 1 from exigidos x
    where not exists (
      select 1 from public.documentos d
      where d.cliente_id = p_cliente and d.tipo_codigo = x.codigo and d.dependente_ordem = x.ordem
        and d.situacao in ('em_conferencia', 'aceito'))
  )
$$;

create or replace function public.pode_ir_para_analise(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.documentos_necessarios_v2(p_cliente) d
    where d.regra = '**' and d.situacao in ('pendente', 'recusado')
  ) and not public.dependentes_bloqueiam_analise(p_cliente)
$$;

revoke execute on function public.dependentes_bloqueiam_analise(uuid) from public, anon;
grant execute on function public.dependentes_bloqueiam_analise(uuid) to authenticated;
