-- Consumidor final: cliente que acessa o portal por conta própria (convite "Consumidor final").
-- Tecnicamente é um perfil "corretor" marcado como consumidor: o processo dele fica no nome dele e nada do resto muda.
-- Antes de cadastrar e enviar para análise, a identidade precisa ser conferida pela equipe (vídeo).
alter table public.perfis add column if not exists consumidor boolean not null default false,
                          add column if not exists identidade_verificada_em timestamptz;
alter table public.convites_link add column if not exists consumidor boolean not null default false;

-- Só a equipe muda a verificação de identidade
create or replace function public.tg_perfis_identidade() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.sou_equipe()
     and (new.consumidor is distinct from old.consumidor or new.identidade_verificada_em is distinct from old.identidade_verificada_em) then
    raise exception 'Somente a equipe da CCA altera a verificação de identidade';
  end if;
  return new;
end $$;
create or replace trigger perfis_identidade before update on public.perfis for each row execute function public.tg_perfis_identidade();

create table if not exists public.verificacoes_identidade (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references public.perfis (id) on delete cascade,
  video_path     text not null,
  nome_arquivo   text,
  status         text not null default 'em_analise' check (status in ('em_analise', 'aprovada', 'recusada')),
  motivo         text,
  enviada_em     timestamptz not null default now(),
  analisada_em   timestamptz,
  analisada_por  uuid references public.perfis (id)
);
create index if not exists verificacoes_perfil_idx on public.verificacoes_identidade (perfil_id, enviada_em desc);
alter table public.verificacoes_identidade enable row level security;
create policy ver_verificacao on public.verificacoes_identidade for select to authenticated
  using (perfil_id = auth.uid() or public.sou_equipe());

-- Vídeos ficam num bucket privado, numa pasta com o id da própria pessoa
insert into storage.buckets (id, name, public) values ('identidade', 'identidade', false) on conflict (id) do nothing;
create policy identidade_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'identidade' and (storage.foldername(name))[1] = auth.uid()::text);
create policy identidade_ler on storage.objects for select to authenticated
  using (bucket_id = 'identidade' and ((storage.foldername(name))[1] = auth.uid()::text or public.sou_equipe()));

-- Consumidor envia o vídeo
create or replace function public.enviar_verificacao(p_path text, p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not coalesce((select consumidor from public.perfis where id = auth.uid()), false) then raise exception 'Sem permissão'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Arquivo inválido'; end if;
  if exists (select 1 from public.verificacoes_identidade where perfil_id = auth.uid() and status in ('em_analise', 'aprovada')) then
    raise exception 'Já existe uma verificação enviada';
  end if;
  insert into public.verificacoes_identidade (perfil_id, video_path, nome_arquivo) values (auth.uid(), p_path, nullif(trim(coalesce(p_nome, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Equipe aprova ou recusa
create or replace function public.analisar_verificacao(p_id uuid, p_aprovada boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_perfil uuid;
begin
  if not public.sou_equipe() or not public.tenho_permissao('conferir_documentos') then raise exception 'Sem permissão'; end if;
  if not p_aprovada and coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da recusa'; end if;
  update public.verificacoes_identidade set status = case when p_aprovada then 'aprovada' else 'recusada' end,
         motivo = case when p_aprovada then null else trim(p_motivo) end, analisada_em = now(), analisada_por = auth.uid()
   where id = p_id and status = 'em_analise' returning perfil_id into v_perfil;
  if v_perfil is null then raise exception 'Verificação não encontrada ou já analisada'; end if;
  update public.perfis set identidade_verificada_em = case when p_aprovada then now() end where id = v_perfil;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'verificar_identidade', jsonb_build_object('perfil', v_perfil, 'aprovada', p_aprovada));
end $$;

-- Situação da minha verificação (última)
create or replace function public.minha_verificacao() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('id', v.id, 'status', v.status, 'motivo', v.motivo, 'enviada_em', v.enviada_em, 'analisada_em', v.analisada_em)
                   from public.verificacoes_identidade v where v.perfil_id = auth.uid() order by v.enviada_em desc limit 1), 'null'::jsonb)
$$;

-- Equipe: fila de verificações
create or replace function public.listar_verificacoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.sou_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'motivo', v.motivo, 'video_path', v.video_path, 'nome_arquivo', v.nome_arquivo,
             'enviada_em', v.enviada_em, 'analisada_em', v.analisada_em, 'perfil_id', p.id, 'nome', p.nome, 'cpf', p.cpf, 'whatsapp', p.whatsapp, 'email', p.email)
           order by (v.status = 'em_analise') desc, v.enviada_em desc)
    from public.verificacoes_identidade v join public.perfis p on p.id = v.perfil_id), '[]'::jsonb) end
$$;

revoke execute on function public.enviar_verificacao(text, text), public.analisar_verificacao(uuid, boolean, text),
  public.minha_verificacao(), public.listar_verificacoes() from public, anon;
grant execute on function public.enviar_verificacao(text, text), public.analisar_verificacao(uuid, boolean, text),
  public.minha_verificacao(), public.listar_verificacoes() to authenticated;

-- Consumidor só cadastra (um processo) e envia depois de verificado
create or replace function public.consumidor_liberado() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select consumidor and identidade_verificada_em is null from public.perfis where id = auth.uid()), false)
$$;
grant execute on function public.consumidor_liberado() to authenticated;
revoke execute on function public.consumidor_liberado() from public, anon;

create or replace function public.tg_clientes_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() = 'gestor_imobiliaria' then
    if new.corretor_id is null or not exists (
         select 1 from public.perfis p where p.id = new.corretor_id and p.imobiliaria_id = public.minha_imobiliaria()) then
      new.corretor_id := auth.uid();
    end if;
  elsif not public.sou_equipe() then
    new.corretor_id := auth.uid();
  end if;
  if not public.sou_equipe() and coalesce((select consumidor from public.perfis where id = auth.uid()), false) then
    if not public.consumidor_liberado() then raise exception 'Sua identidade ainda não foi verificada pela CCA'; end if;
    if exists (select 1 from public.clientes where corretor_id = auth.uid()) then raise exception 'Você já tem um cadastro. Abra o seu processo.'; end if;
  end if;
  select imobiliaria_id into new.imobiliaria_id from public.perfis where id = new.corretor_id;
  new.status := 'cadastro_recebido';
  return new;
end $$;

create or replace function public.enviar_cadastro(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.clientes;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null or not public.posso_editar_cliente(p_cliente) then
    raise exception 'Cliente não encontrado';
  end if;
  if not public.consumidor_liberado() then raise exception 'Sua identidade ainda não foi verificada pela CCA'; end if;
  if v.autorizacao_lgpd_em is null then
    raise exception 'Falta a confirmação de autorização do cliente (LGPD)';
  end if;
  if not v.rascunho then
    return;
  end if;
  update public.clientes
     set rascunho = false,
         enviado_em = coalesce(enviado_em, now()),
         status = case when public.pode_ir_para_analise(p_cliente)
                       then 'cadastro_recebido' else 'documentacao_pendente' end
   where id = p_cliente;
  insert into public.eventos (tipo, cliente_id) values ('cliente_enviado', p_cliente);
end $$;

-- Engenharia é só para corretor e imobiliária (não para consumidor final)
create or replace function public.criar_engenharia(p_vendedor uuid, p_tipo text, p_endereco text, p_cidade text, p_uf text, p_matricula text, p_quem_paga text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_imob uuid;
begin
  if public.meu_papel() not in ('corretor', 'gestor_imobiliaria')
     or coalesce((select consumidor from public.perfis where id = auth.uid()), false) then
    raise exception 'Só corretor ou imobiliária pedem engenharia';
  end if;
  select imobiliaria_id into v_imob from public.perfis where id = auth.uid();
  insert into public.engenharias (vendedor_id, criado_por, imobiliaria_id, tipo, codigo_servico, imovel_endereco, imovel_cidade, imovel_uf, matricula, quem_paga)
  values (p_vendedor, auth.uid(), v_imob, p_tipo,
          case p_tipo when 'atc' then 'B438 - F30 - P173 - Análise Aquisição Terr e Const'
                      when 'ctp' then 'B437 - F30 - P172 - Análise Const Terreno Próprio'
                      else 'A413 - F30 - P171 - Avaliação Finan. Habitacional' end,
          nullif(trim(coalesce(p_endereco, '')), ''), nullif(trim(coalesce(p_cidade, '')), ''), upper(nullif(trim(coalesce(p_uf, '')), '')),
          nullif(trim(coalesce(p_matricula, '')), ''), nullif(p_quem_paga, ''))
  returning id into v_id;
  return v_id;
end $$;
