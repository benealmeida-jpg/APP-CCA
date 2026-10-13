-- Avisos automáticos: vídeo de identidade (consumidor final) e etapas da Engenharia.
-- Cada passo grava um evento; a função "avisos" decide o canal (WhatsApp, notificação do app e e-mail).
create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;
revoke execute on function public.pegar_eventos_aviso(int) from public, anon, authenticated;

create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;

-- Identidade: aviso à equipe quando o vídeo chega e ao cliente quando é conferido
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
  insert into public.eventos (tipo, dados) values ('verificacao', jsonb_build_object('fase', 'enviada', 'perfil_id', auth.uid()));
  return v_id;
end $$;

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
  insert into public.eventos (tipo, dados) values ('verificacao', jsonb_build_object('fase', 'analisada', 'perfil_id', v_perfil, 'aprovada', p_aprovada, 'motivo', case when p_aprovada then null else trim(p_motivo) end));
end $$;

-- Engenharia: a quem avisar a cada passo (fase) é decidido na função "avisos"
create or replace function public.enviar_engenharia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) or public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.engenharias set etapa = 'em_analise', atualizado_em = now() where id = p_id and etapa = 'documentacao';
  if found then insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'enviada', 'engenharia_id', p_id)); end if;
end $$;

create or replace function public.engenharia_equipe_avancar(p_id uuid, p_etapa text, p_os_numero text, p_os_data date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  if p_etapa not in ('documentacao', 'em_analise', 'boleto', 'pago', 'os_recebida', 'laudo') then raise exception 'Etapa inválida'; end if;
  update public.engenharias set etapa = p_etapa,
         os_numero = coalesce(nullif(trim(coalesce(p_os_numero, '')), ''), os_numero), os_data = coalesce(p_os_data, os_data),
         atualizado_em = now() where id = p_id;
  if p_etapa in ('boleto', 'os_recebida') then
    insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', p_etapa, 'engenharia_id', p_id));
  end if;
end $$;

create or replace function public.engenharia_informar_pagamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) then raise exception 'Sem permissão'; end if;
  update public.engenharias set etapa = 'pago', atualizado_em = now() where id = p_id and etapa = 'boleto';
  if found then insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'pago', 'engenharia_id', p_id)); end if;
end $$;

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
  insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'laudo', 'engenharia_id', p_id, 'aprovado', p_aprovado));
end $$;

create or replace function public.engenharia_contestar(p_id uuid, p_tipo text, p_links text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_engenharia(p_id) or public.sou_equipe() then raise exception 'Sem permissão'; end if;
  if p_tipo not in ('reavaliacao', 'segunda_instancia') then raise exception 'Escolha reavaliação ou segunda instância'; end if;
  update public.engenharias set contestacao = p_tipo, links_anuncios = case when p_tipo = 'reavaliacao' then p_links end, atualizado_em = now()
   where id = p_id and laudo_aprovado is true;
  if found then insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'contestou', 'engenharia_id', p_id, 'tipo', p_tipo)); end if;
end $$;

-- Lista de clientes (equipe): marca quem é consumidor final
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
       ((select count(*) from public.participantes x where x.cliente_id = c.id) + 1) as pessoas,
       c.criado_em, c.enviado_em,
       coalesce((select max(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = c.status), c.enviado_em, c.criado_em) as status_desde,
       (select count(*) from public.conversa m where m.cliente_id = c.id and m.autor_id <> auth.uid()
          and m.criada_em > coalesce((select l.lida_em from public.conversa_lida l where l.cliente_id = c.id and l.usuario_id = auth.uid()), '-infinity'::timestamptz)) as conversa_nao_lidas,
       (select max(m.criada_em) from public.conversa m where m.cliente_id = c.id) as conversa_ultima,
       p.consumidor as corretor_consumidor
from public.clientes c
join public.status_etapas s on s.codigo = c.status
join public.perfis p on p.id = c.corretor_id
left join public.imobiliarias i on i.id = c.imobiliaria_id;
