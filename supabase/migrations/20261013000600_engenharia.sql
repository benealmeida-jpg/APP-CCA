-- Engenharia: avaliação do imóvel pela Caixa. É sempre em nome do VENDEDOR e não depende de uma venda.
-- O laudo é confidencial da Caixa: NÃO se anexa. A equipe lança só o resultado (aprovado, valor, data) e as PEPTs.

create table if not exists public.engenharias (
  id               uuid primary key default gen_random_uuid(),
  vendedor_id      uuid not null references public.vendedores (id),
  criado_por       uuid not null references public.perfis (id),
  imobiliaria_id   uuid references public.imobiliarias (id),
  tipo             text not null check (tipo in ('novo_fgts', 'novo_sbpe', 'usado', 'atc', 'ctp')),
  codigo_servico   text not null,
  imovel_endereco  text,
  imovel_cidade    text,
  imovel_uf        text,
  matricula        text,
  quem_paga        text check (quem_paga in ('vendedor', 'comprador', 'imobiliaria', 'corretor')),
  etapa            text not null default 'documentacao'
                   check (etapa in ('documentacao', 'em_analise', 'boleto', 'pago', 'os_recebida', 'laudo')),
  os_numero        text,
  os_data          date,
  laudo_aprovado   boolean,
  avaliacao_valor  numeric(14, 2),
  avaliacao_data   date,
  validade_em      date generated always as (avaliacao_data + 180) stored,   -- 180 dias da avaliação
  contestacao      text check (contestacao in ('reavaliacao', 'segunda_instancia')),
  links_anuncios   text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists engenharias_vendedor_idx on public.engenharias (vendedor_id);
create index if not exists engenharias_criado_por_idx on public.engenharias (criado_por);

create table if not exists public.engenharia_pepts (
  id             uuid primary key default gen_random_uuid(),
  engenharia_id  uuid not null references public.engenharias (id) on delete cascade,
  motivo         text not null,
  registrada_em  timestamptz not null default now(),
  resolvida_em   timestamptz
);

create table if not exists public.engenharia_docs (
  id             uuid primary key default gen_random_uuid(),
  engenharia_id  uuid not null references public.engenharias (id) on delete cascade,
  tipo           text not null,
  pept_id        uuid references public.engenharia_pepts (id),
  nome_original  text,
  arquivo_path   text not null,
  enviado_por    uuid references public.perfis (id),
  enviado_em     timestamptz not null default now()
);
create index if not exists engenharia_docs_eng_idx on public.engenharia_docs (engenharia_id);

alter table public.engenharias      enable row level security;
alter table public.engenharia_pepts enable row level security;
alter table public.engenharia_docs  enable row level security;

create or replace function public.posso_ver_engenharia(p_eng uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engenharias e
    where e.id = p_eng and (
      e.criado_por = auth.uid()
      or public.sou_equipe()
      or (public.meu_papel() = 'gestor_imobiliaria' and e.imobiliaria_id is not null
          and e.imobiliaria_id = (select p.imobiliaria_id from public.perfis p where p.id = auth.uid()))
    ))
$$;

create policy eng_ver on public.engenharias for select to authenticated using (public.posso_ver_engenharia(id));
create policy engp_ver on public.engenharia_pepts for select to authenticated using (public.posso_ver_engenharia(engenharia_id));
create policy engd_ver on public.engenharia_docs for select to authenticated using (public.posso_ver_engenharia(engenharia_id));
-- Documentos: quem pode ver a solicitação pode anexar (corretor/imobiliária dela e equipe)
create policy engd_inserir on public.engenharia_docs for insert to authenticated
  with check (public.posso_ver_engenharia(engenharia_id) and enviado_por = auth.uid());

-- Arquivos (bucket privado)
insert into storage.buckets (id, name, public) values ('engenharia', 'engenharia', false) on conflict (id) do nothing;
create policy eng_ler on storage.objects for select to authenticated
  using (bucket_id = 'engenharia' and public.posso_ver_engenharia(((storage.foldername(name))[1])::uuid));
create policy eng_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'engenharia' and public.posso_ver_engenharia(((storage.foldername(name))[1])::uuid));

-- Vendedor rápido (a engenharia não nasce de um cliente)
create or replace function public.cadastrar_vendedor_basico(p_cpf_cnpj text, p_nome text, p_responsavel text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_doc text := regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g'); v_id uuid;
begin
  if public.meu_papel() is null then raise exception 'Sem permissão'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ do vendedor inválido'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do vendedor'; end if;
  select id into v_id from public.vendedores where cpf_cnpj = v_doc;
  if v_id is null then
    insert into public.vendedores (tipo, cpf_cnpj, nome, responsavel_nome, criado_por)
    values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_nome), nullif(trim(coalesce(p_responsavel, '')), ''), auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.criar_engenharia(p_vendedor uuid, p_tipo text, p_endereco text, p_cidade text, p_uf text, p_matricula text, p_quem_paga text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_imob uuid;
begin
  if public.meu_papel() not in ('corretor', 'gestor_imobiliaria') then raise exception 'Só corretor ou imobiliária pedem engenharia'; end if;
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

-- Corretor/imobiliária envia a documentação para a CCA
create or replace function public.enviar_engenharia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) or public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.engenharias set etapa = 'em_analise', atualizado_em = now() where id = p_id and etapa = 'documentacao';
end $$;

-- Equipe: avança a etapa (boleto anexado, OS recebida...) e guarda os dados da OS
create or replace function public.engenharia_equipe_avancar(p_id uuid, p_etapa text, p_os_numero text, p_os_data date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  if p_etapa not in ('documentacao', 'em_analise', 'boleto', 'pago', 'os_recebida', 'laudo') then raise exception 'Etapa inválida'; end if;
  update public.engenharias set etapa = p_etapa,
         os_numero = coalesce(nullif(trim(coalesce(p_os_numero, '')), ''), os_numero), os_data = coalesce(p_os_data, os_data),
         atualizado_em = now() where id = p_id;
end $$;

-- Corretor: avisa que pagou (anexou o comprovante)
create or replace function public.engenharia_informar_pagamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) then raise exception 'Sem permissão'; end if;
  update public.engenharias set etapa = 'pago', atualizado_em = now() where id = p_id and etapa = 'boleto';
end $$;

-- Equipe: lança o resultado (sem anexar o laudo). Reprovado: uma PEPT por motivo.
create or replace function public.engenharia_lancar_laudo(p_id uuid, p_aprovado boolean, p_valor numeric, p_data date, p_motivos text[])
returns void
language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  if p_aprovado and (p_valor is null or p_data is null) then raise exception 'Informe o valor e a data da avaliação'; end if;
  if not p_aprovado and coalesce(array_length(p_motivos, 1), 0) = 0 then raise exception 'Informe o motivo da reprovação (PEPT)'; end if;
  update public.engenharias set etapa = 'laudo', laudo_aprovado = p_aprovado,
         avaliacao_valor = case when p_aprovado then p_valor end, avaliacao_data = case when p_aprovado then p_data end,
         contestacao = null, links_anuncios = null, atualizado_em = now() where id = p_id;
  if not p_aprovado then
    foreach m in array p_motivos loop
      if nullif(trim(m), '') is not null then insert into public.engenharia_pepts (engenharia_id, motivo) values (p_id, trim(m)); end if;
    end loop;
  end if;
end $$;

-- Equipe: marca a PEPT como resolvida (documentos enviados ao engenheiro, que reavalia)
create or replace function public.engenharia_resolver_pept(p_pept uuid, p_resolvida boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  update public.engenharia_pepts set resolvida_em = case when p_resolvida then now() end where id = p_pept;
end $$;

-- Corretor/imobiliária: discorda do valor (reavaliação com 5 a 10 links, ou segunda instância)
create or replace function public.engenharia_contestar(p_id uuid, p_tipo text, p_links text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) or public.sou_equipe() then raise exception 'Sem permissão'; end if;
  if p_tipo not in ('reavaliacao', 'segunda_instancia') then raise exception 'Escolha reavaliação ou segunda instância'; end if;
  update public.engenharias set contestacao = p_tipo, links_anuncios = case when p_tipo = 'reavaliacao' then p_links end, atualizado_em = now()
   where id = p_id and laudo_aprovado is true;
end $$;

revoke execute on function public.posso_ver_engenharia(uuid), public.cadastrar_vendedor_basico(text, text, text),
  public.criar_engenharia(uuid, text, text, text, text, text, text), public.enviar_engenharia(uuid),
  public.engenharia_equipe_avancar(uuid, text, text, date), public.engenharia_informar_pagamento(uuid),
  public.engenharia_lancar_laudo(uuid, boolean, numeric, date, text[]), public.engenharia_resolver_pept(uuid, boolean),
  public.engenharia_contestar(uuid, text, text) from public, anon;
grant execute on function public.posso_ver_engenharia(uuid), public.cadastrar_vendedor_basico(text, text, text),
  public.criar_engenharia(uuid, text, text, text, text, text, text), public.enviar_engenharia(uuid),
  public.engenharia_equipe_avancar(uuid, text, text, date), public.engenharia_informar_pagamento(uuid),
  public.engenharia_lancar_laudo(uuid, boolean, numeric, date, text[]), public.engenharia_resolver_pept(uuid, boolean),
  public.engenharia_contestar(uuid, text, text) to authenticated;

-- Lista (com vendedor, PEPTs e documentos) só do que a pessoa pode ver
create or replace function public.listar_engenharias() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'atualizado_em') desc), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object(
      'vendedor', (select jsonb_build_object('id', v.id, 'nome', v.nome, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'responsavel_nome', v.responsavel_nome) from public.vendedores v where v.id = e.vendedor_id),
      'criado_por_nome', (select p.nome from public.perfis p where p.id = e.criado_por),
      'criado_por_apelido', (select p.apelido from public.perfis p where p.id = e.criado_por),
      'imobiliaria_nome', (select i.nome from public.imobiliarias i where i.id = e.imobiliaria_id),
      'pepts', coalesce((select jsonb_agg(to_jsonb(t) order by t.registrada_em) from public.engenharia_pepts t where t.engenharia_id = e.id), '[]'::jsonb),
      'docs', coalesce((select jsonb_agg(to_jsonb(d) order by d.enviado_em) from public.engenharia_docs d where d.engenharia_id = e.id), '[]'::jsonb)
    ) as x
    from public.engenharias e where public.posso_ver_engenharia(e.id)
  ) s
$$;
revoke execute on function public.listar_engenharias() from public, anon;
grant execute on function public.listar_engenharias() to authenticated;
