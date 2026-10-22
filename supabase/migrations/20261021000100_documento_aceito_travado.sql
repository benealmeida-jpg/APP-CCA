-- Documento aceito pela CCA (ou aprovado na pré-conferência da IA) fica travado:
-- só a equipe da CCA pode substituir, excluir ou alterar. Evita trocar um documento que já foi lançado na Caixa.
create or replace function public.doc_travado(p_situacao text, p_ia jsonb) returns boolean
language sql immutable as $$
  select p_situacao = 'aceito'
      or (p_situacao = 'em_conferencia' and coalesce((p_ia->>'analisado')::boolean, false) and p_ia->>'sugestao' = 'aceitar')
$$;

create or replace function public.tg_documentos_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_pessoa int; v_multiplo boolean;
begin
  if new.participante_id is not null and not exists (
       select 1 from public.participantes p where p.id = new.participante_id and p.cliente_id = new.cliente_id) then
    raise exception 'Pessoa não pertence a este cliente';
  end if;
  select coalesce(multiplo, false) into v_multiplo from public.tipos_documento where codigo = new.tipo_codigo;
  if not v_multiplo and not public.sou_equipe() and exists (
       select 1 from public.documentos d where d.cliente_id = new.cliente_id and d.tipo_codigo = new.tipo_codigo
          and d.participante_id is not distinct from new.participante_id and d.dependente_ordem is not distinct from new.dependente_ordem
          and d.situacao <> 'substituido' and public.doc_travado(d.situacao, d.ia)) then
    raise exception 'Este documento já foi aceito. Só a CCA pode trocá-lo: peça pela conversa com a CCA.';
  end if;
  select coalesce(max(versao), 0) into v_max
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo;
  select count(*) into v_pessoa
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id
     and dependente_ordem is not distinct from new.dependente_ordem;
  new.versao := v_max + 1;
  new.versao_pessoa := case when v_multiplo then 1 else v_pessoa + 1 end;
  new.situacao := 'em_conferencia';
  new.enviado_por := auth.uid();
  new.motivo_recusa := null; new.observacao_recusa := null;
  new.conferido_por := null; new.conferido_em := null;
  if not v_multiplo then
    update public.documentos set situacao = 'substituido'
     where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
       and participante_id is not distinct from new.participante_id
       and dependente_ordem is not distinct from new.dependente_ordem
       and situacao <> 'substituido';
  end if;
  return new;
end $$;

create or replace function public.registrar_documento_vendedor(p_cliente uuid, p_tipo text, p_path text, p_nome text, p_mime text, p_tamanho bigint)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_vend uuid; v_max int; v_id uuid;
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  select vendedor_id into v_vend from public.clientes where id = p_cliente;
  if v_vend is null then raise exception 'Informe os dados do vendedor antes de anexar os documentos dele'; end if;
  if split_part(p_path, '/', 1) <> v_vend::text then raise exception 'Caminho do arquivo inválido'; end if;
  if not exists (select 1 from public.tipos_documento where codigo = p_tipo and alvo like 'vendedor%') then
    raise exception 'Tipo de documento inválido';
  end if;
  if not public.sou_equipe() and exists (select 1 from public.documentos_vendedor d where d.vendedor_id = v_vend and d.tipo_codigo = p_tipo
       and d.situacao <> 'substituido' and public.doc_travado(d.situacao, d.ia)) then
    raise exception 'Este documento já foi aceito. Só a CCA pode trocá-lo: peça pela conversa com a CCA.';
  end if;
  select coalesce(max(versao), 0) into v_max from public.documentos_vendedor where vendedor_id = v_vend and tipo_codigo = p_tipo;
  update public.documentos_vendedor set situacao = 'substituido'
   where vendedor_id = v_vend and tipo_codigo = p_tipo and situacao <> 'substituido';
  insert into public.documentos_vendedor (vendedor_id, tipo_codigo, versao, arquivo_path, nome_original, mime, tamanho_bytes, cliente_id, enviado_por)
  values (v_vend, p_tipo, v_max + 1, p_path, p_nome, p_mime, p_tamanho, p_cliente, auth.uid())
  returning id into v_id;
  insert into public.eventos (tipo, cliente_id, dados)
  values ('documento_vendedor_enviado', p_cliente, jsonb_build_object('documento', v_id, 'tipo', p_tipo));
  return v_id;
end $$;

create or replace function public.registrar_doc_imovel(p_imovel uuid, p_tipo text, p_path text, p_nome text, p_mime text, p_tamanho bigint, p_origem text default 'imovel', p_engenharia uuid default null, p_emitido date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.imovel_docs; v_etapa text; v_atual text;
begin
  if not public.posso_ver_imovel(p_imovel) then raise exception 'Imóvel não encontrado'; end if;
  if not public.eh_doc_imovel(p_tipo) then raise exception 'Documento inválido'; end if;
  select situacao into v_atual from public.imovel_docs where imovel_id = p_imovel and tipo = p_tipo order by enviado_em desc limit 1;
  if v_atual = 'aceito' and not public.sou_equipe() then
    raise exception 'Este documento já foi aceito. Só a CCA pode trocá-lo: peça pela conversa com a CCA.';
  end if;
  insert into public.imovel_docs (imovel_id, tipo, nome_original, arquivo_path, mime, tamanho_bytes, enviado_por, emitido_em, origem)
  values (p_imovel, p_tipo, p_nome, p_path, p_mime, p_tamanho, auth.uid(), p_emitido, coalesce(p_origem, 'imovel')) returning * into d;
  update public.imoveis set atualizado_em = now() where id = p_imovel;
  if p_engenharia is not null and public.posso_ver_engenharia(p_engenharia) then
    select etapa into v_etapa from public.engenharias where id = p_engenharia and imovel_id = p_imovel;
    if v_etapa is not null and v_etapa <> 'documentacao' and not public.sou_equipe() then
      update public.engenharias set docs_novos = true, atualizado_em = now() where id = p_engenharia;
      insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'doc_adicionado', 'engenharia_id', p_engenharia));
    else
      update public.engenharias set atualizado_em = now() where id = p_engenharia;
    end if;
  end if;
  return to_jsonb(d);
end $$;

-- Data de emissão de documento aceito: só a CCA altera
create or replace function public.definir_emissao_documento(p_doc uuid, p_vendedor boolean, p_data date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_sit text; v_ia jsonb;
begin
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de emissão inválida'; end if;
  if p_vendedor then select cliente_id, situacao, ia into v_cli, v_sit, v_ia from public.documentos_vendedor where id = p_doc;
  else select cliente_id, situacao, ia into v_cli, v_sit, v_ia from public.documentos where id = p_doc; end if;
  if v_cli is null or not public.posso_editar_cliente(v_cli) then raise exception 'Sem permissão'; end if;
  if public.doc_travado(v_sit, v_ia) and not public.sou_equipe() then
    raise exception 'Este documento já foi aceito. Só a CCA pode alterar a data: peça pela conversa com a CCA.';
  end if;
  if p_vendedor then update public.documentos_vendedor set emitido_em = p_data where id = p_doc;
  else update public.documentos set emitido_em = p_data where id = p_doc; end if;
end $$;
