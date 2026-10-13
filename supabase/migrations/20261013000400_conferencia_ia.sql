-- Pré-conferência de documentos por IA (Claude, API paga da Anthropic).
-- Quando um documento chega, o banco chama a função "conferir-ia", que olha o arquivo e grava uma sugestão.
-- A decisão (aceitar/recusar) continua sendo da equipe.

alter table public.documentos add column if not exists ia jsonb;
alter table public.documentos add column if not exists ia_em timestamptz;
alter table public.documentos_vendedor add column if not exists ia jsonb;
alter table public.documentos_vendedor add column if not exists ia_em timestamptz;

insert into public.parametros (chave, valor, descricao) values
  ('ia_conferencia', 'sim', 'Pré-conferência dos documentos por IA (sim/nao)'),
  ('ia_limite_mes', '3000', 'Máximo de documentos analisados pela IA por mês (controle de custo)')
on conflict (chave) do nothing;

-- Uso e custo (só o servidor grava; o ADM consulta o total do mês)
create table if not exists public.ia_uso (
  id              bigint generated always as identity primary key,
  em              timestamptz not null default now(),
  tabela          text not null,
  documento_id    uuid,
  tokens_entrada  int not null default 0,
  tokens_saida    int not null default 0,
  custo_usd       numeric(12, 6) not null default 0,
  ok              boolean not null default true,
  erro            text
);
create index if not exists ia_uso_em_idx on public.ia_uso (em);
alter table public.ia_uso enable row level security;

create or replace function public.ia_uso_mes()
returns table (documentos bigint, erros bigint, custo_usd numeric, limite int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where ok), count(*) filter (where not ok), coalesce(sum(custo_usd), 0),
         coalesce((select nullif(valor, '')::int from public.parametros where chave = 'ia_limite_mes'), 3000)
  from public.ia_uso
  where em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    and public.sou_admin()
$$;
revoke execute on function public.ia_uso_mes() from public, anon;
grant execute on function public.ia_uso_mes() to authenticated;

-- Chave da Anthropic guardada como as outras integrações (ninguém lê pelo app)
create or replace function public.admin_salvar_integracao(p_chave text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_chave not in ('meta_token', 'meta_phone_id', 'meta_waba_id', 'smtp_usuario', 'smtp_senha', 'anthropic_chave') then raise exception 'Configuração inválida'; end if;
  if coalesce(trim(p_valor), '') = '' then
    delete from public.integracoes where chave = p_chave;
  else
    insert into public.integracoes (chave, valor, atualizado_por) values (p_chave, trim(p_valor), auth.uid())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'alterar_integracao', jsonb_build_object('chave', p_chave));
end $$;

create or replace function public.integracoes_configuradas()
returns table (chave text, configurado boolean, final text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select k.chave, i.chave is not null,
         case when i.chave is null then null
              when k.chave in ('meta_token', 'anthropic_chave') then '…' || right(i.valor, 4)
              when k.chave = 'smtp_senha' then 'guardada'
              else i.valor end,
         i.atualizado_em
  from (values ('meta_phone_id'), ('meta_waba_id'), ('meta_token'), ('smtp_usuario'), ('smtp_senha'), ('anthropic_chave')) k(chave)
  left join public.integracoes i on i.chave = k.chave
  where public.sou_admin()
$$;

-- Chama a função da IA (sem travar o envio do documento se algo falhar)
create or replace function public.chamar_conferencia_ia(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_seg text;
begin
  if coalesce((select valor from public.parametros where chave = 'ia_conferencia'), 'sim') <> 'sim' then return; end if;
  if not exists (select 1 from public.integracoes where chave = 'anthropic_chave') then return; end if;
  select valor into v_seg from public.integracoes where chave = 'segredo_interno';
  perform net.http_post(
    url := 'https://gfyvbqbllvjynqssrozu.supabase.co/functions/v1/conferir-ia',
    body := jsonb_build_object('acao', 'conferir', 'tabela', p_tabela, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg),
    timeout_milliseconds := 60000);
exception when others then
  null;
end $$;
revoke execute on function public.chamar_conferencia_ia(text, uuid) from public, anon, authenticated;

-- Quem envia não escolhe o resultado da IA
create or replace function public.tg_documento_ia_limpar() returns trigger
language plpgsql as $$
begin
  new.ia := null; new.ia_em := null;
  return new;
end $$;

create or replace function public.tg_documento_ia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.situacao = 'em_conferencia' then perform public.chamar_conferencia_ia(tg_table_name, new.id); end if;
  return new;
end $$;

create or replace trigger documentos_ia_limpar before insert on public.documentos for each row execute function public.tg_documento_ia_limpar();
create or replace trigger documentos_ia after insert on public.documentos for each row execute function public.tg_documento_ia();
create or replace trigger documentos_vendedor_ia_limpar before insert on public.documentos_vendedor for each row execute function public.tg_documento_ia_limpar();
create or replace trigger documentos_vendedor_ia after insert on public.documentos_vendedor for each row execute function public.tg_documento_ia();
