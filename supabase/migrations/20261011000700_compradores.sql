-- Vários compradores no mesmo processo (titular + até 3 pessoas).
-- O titular continua na tabela clientes; as demais pessoas ficam em participantes.
-- papel: 'comprador' (compõe renda) ou 'conjuge' (cônjuge sem renda, qualificado no contrato).

create table if not exists public.participantes (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes (id) on delete cascade,
  ordem              int  not null check (ordem between 2 and 4),
  papel              text not null check (papel in ('comprador', 'conjuge')),
  conjuge_do_titular boolean not null default false,
  nome               text not null,
  cpf                text not null,
  data_nascimento    date,
  celular            text,
  email              text,
  estado_civil       text,
  pis                text,
  tipo_renda         text,
  renda_bruta        numeric(12,2),
  renda_formal       numeric(12,2),
  renda_informal     numeric(12,2),
  renda_considerada  numeric(12,2),
  declara_ir         boolean,
  ir_retificado      boolean,
  extras             jsonb not null default '{}'::jsonb,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (cliente_id, ordem),
  unique (cliente_id, cpf)
);

create index if not exists participantes_cliente_idx on public.participantes (cliente_id);

alter table public.participantes enable row level security;
create policy ver_participante on public.participantes for select to authenticated
  using (public.posso_ver_cliente(cliente_id));
create policy gravar_participante on public.participantes for all to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and (c.corretor_id = auth.uid() or public.sou_equipe())))
  with check (exists (select 1 from public.clientes c where c.id = cliente_id and (c.corretor_id = auth.uid() or public.sou_equipe())));

-- Documentos por pessoa (nulo = titular)
alter table public.documentos
  add column if not exists participante_id uuid references public.participantes (id) on delete cascade,
  add column if not exists versao_pessoa int;

-- Quais documentos são pedidos para cada pessoa
alter table public.tipos_documento add column if not exists por_pessoa boolean not null default false;
update public.tipos_documento set por_pessoa = true where codigo in (
  'RG_CNH','PIS','COMPROVANTE_RESIDENCIA','CERTIDAO_ESTADO_CIVIL','CONTRACHEQUES','CARTEIRA_TRABALHO',
  'COMPROVANTE_RENDA_INF','DECLARACAO_IR','RECIBO_IR','IR_RETIFICADORA','RECIBO_IR_RETIFICADORA',
  'DEFIS_ULTIMO_ANO','DEFIS_PENULTIMO_ANO');

-- Versão: "versao" continua única por cliente+tipo; "versao_pessoa" é a que aparece para o corretor
create or replace function public.tg_documentos_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_pessoa int;
begin
  if new.participante_id is not null and not exists (
       select 1 from public.participantes p where p.id = new.participante_id and p.cliente_id = new.cliente_id) then
    raise exception 'Pessoa não pertence a este cliente';
  end if;
  select coalesce(max(versao), 0) into v_max
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo;
  select count(*) into v_pessoa
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id;
  new.versao := v_max + 1;
  new.versao_pessoa := v_pessoa + 1;
  new.situacao := 'em_conferencia';
  new.enviado_por := auth.uid();
  new.motivo_recusa := null; new.observacao_recusa := null;
  new.conferido_por := null; new.conferido_em := null;
  update public.documentos set situacao = 'substituido'
   where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id and situacao <> 'substituido';
  return new;
end $$;

-- Documentos exigidos para o processo, pessoa por pessoa
create or replace function public.documentos_necessarios_v2(p_cliente uuid)
returns table (
  participante_id uuid, pessoa_nome text, pessoa_papel text, pessoa_ordem int,
  tipo_codigo text, nome text, grupo text, regra text, ordem int,
  documento_id uuid, versao int, situacao text, motivo_recusa text,
  observacao_recusa text, nome_original text, arquivo_path text
)
language sql stable security definer set search_path = public as $$
  with cli as (
    select to_jsonb(cl.*) as j, cl.nome from public.clientes cl
    where cl.id = p_cliente and public.posso_ver_cliente(p_cliente)
  ),
  pessoas as (
    select null::uuid as pid, 1 as ordem, 'titular'::text as papel, cli.nome, cli.j from cli
    union all
    select p.id, p.ordem, p.papel, p.nome,
           cli.j || (to_jsonb(p.*) - 'id' - 'cliente_id' - 'ordem' - 'criado_em' - 'atualizado_em')
    from public.participantes p cross join cli
    where p.cliente_id = p_cliente
  ),
  atual as (
    select distinct on (d.tipo_codigo, d.participante_id) d.*
    from public.documentos d
    where d.cliente_id = p_cliente and d.situacao <> 'substituido'
    order by d.tipo_codigo, d.participante_id, d.versao desc
  )
  select pe.pid, pe.nome, pe.papel, pe.ordem,
         t.codigo, t.nome, t.grupo, t.regra, t.ordem,
         a.id, coalesce(a.versao_pessoa, a.versao), coalesce(a.situacao, 'pendente'), a.motivo_recusa,
         a.observacao_recusa, a.nome_original, a.arquivo_path
  from public.tipos_documento t
  join pessoas pe on (t.por_pessoa or pe.pid is null)
  left join atual a on a.tipo_codigo = t.codigo and a.participante_id is not distinct from pe.pid
  where t.ativo
    and (jsonb_array_length(t.condicao) = 0
         or exists (select 1 from jsonb_array_elements(t.condicao) e where pe.j @> e))
  order by pe.ordem, t.ordem
$$;

revoke execute on function public.documentos_necessarios_v2(uuid) from public, anon;
grant execute on function public.documentos_necessarios_v2(uuid) to authenticated;

create or replace function public.pode_ir_para_analise(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.documentos_necessarios_v2(p_cliente) d
    where d.regra = '**' and d.situacao in ('pendente', 'recusado')
  )
$$;

create or replace view public.clientes_resumo with (security_invoker = true) as
select c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
       s.nome as status_nome, s.ordem as status_ordem,
       c.corretor_id, p.nome as corretor_nome,
       c.imobiliaria_id, coalesce(i.nome, 'Autônomo') as imobiliaria_nome,
       c.atualizado_em,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'pendente')       as docs_pendentes,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'recusado')       as docs_recusados,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'em_conferencia') as docs_em_conferencia,
       public.pode_ir_para_analise(c.id) as pode_ir_para_analise,
       (select count(*) from public.participantes x where x.cliente_id = c.id) + 1 as pessoas
from public.clientes c
join public.status_etapas s on s.codigo = c.status
join public.perfis p on p.id = c.corretor_id
left join public.imobiliarias i on i.id = c.imobiliaria_id;
