-- Sincroniza o arquivo de migrações com o banco: funções e colunas que foram aplicadas direto no banco
-- (mesmo conteúdo que já está no ar; no banco real não muda nada).
alter table public.campanha_premios add column if not exists entregar_para text;
alter table public.campanhas add column if not exists pontos_avulso integer not null default 2;
alter table public.campanhas add column if not exists pontos_empreendimento integer not null default 1;
alter table public.imobiliarias add column if not exists premio_para text;

create or replace function public.posso_ver_engenharia(p_eng uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.engenharias e
    where e.id = p_eng and e.excluida_em is null and (
      e.criado_por = auth.uid()
      or public.sou_equipe()
      or (public.meu_papel() = 'gestor_imobiliaria' and e.imobiliaria_id is not null
          and e.imobiliaria_id = (select p.imobiliaria_id from public.perfis p where p.id = auth.uid()))
    ))
$function$;

create or replace function public.editar_engenharia(p_id uuid, p_tipo text, p_endereco text, p_cidade text, p_uf text, p_matricula text, p_cartorio text, p_quem_paga text, p_telefone text, p_email text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare e record; v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''); v_mail text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not public.posso_ver_engenharia(p_id) then raise exception 'Sem permissão'; end if;
  select * into e from public.engenharias where id = p_id;
  if not public.sou_equipe() and e.etapa not in ('documentacao', 'em_analise', 'boleto') then raise exception 'Depois que o boleto é pago, só a CCA altera os dados'; end if;
  if p_tipo not in ('novo_fgts', 'novo_sbpe', 'usado', 'atc', 'ctp') then raise exception 'Tipo de imóvel inválido'; end if;
  if v_tel is not null and length(v_tel) < 10 then raise exception 'Telefone do vendedor inválido'; end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail do vendedor inválido'; end if;
  update public.engenharias set tipo = p_tipo,
    codigo_servico = case p_tipo when 'atc' then 'B438 - F30 - P173 - Análise Aquisição Terr e Const' when 'ctp' then 'B437 - F30 - P172 - Análise Const Terreno Próprio' else 'A413 - F30 - P171 - Avaliação Finan. Habitacional' end,
    imovel_endereco = nullif(trim(coalesce(p_endereco, '')), ''), imovel_cidade = nullif(trim(coalesce(p_cidade, '')), ''), imovel_uf = upper(nullif(trim(coalesce(p_uf, '')), '')),
    matricula = nullif(trim(coalesce(p_matricula, '')), ''), cartorio_rgi = nullif(trim(coalesce(p_cartorio, '')), ''), quem_paga = nullif(p_quem_paga, ''), atualizado_em = now(),
    docs_novos = case when p_tipo <> e.tipo and e.etapa <> 'documentacao' and not public.sou_equipe() then true else docs_novos end
  where id = p_id;
  update public.vendedores set telefone = coalesce(v_tel, telefone), email = coalesce(v_mail, email), atualizado_em = now() where id = e.vendedor_id;
end $function$;

create or replace function public.equipe_editar_vendedor(p_id uuid, p_nome text, p_cpf_cnpj text, p_responsavel text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_doc text := regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g');
begin
  if not public.sou_equipe() then raise exception 'Só a equipe da CCA altera nome e CPF/CNPJ'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ inválido'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do vendedor'; end if;
  if exists (select 1 from public.vendedores where cpf_cnpj = v_doc and id <> p_id) then raise exception 'Já existe outro vendedor com esse CPF/CNPJ'; end if;
  update public.vendedores set nome = trim(p_nome), cpf_cnpj = v_doc, tipo = case when length(v_doc) = 11 then 'PF' else 'PJ' end,
    responsavel_nome = nullif(trim(coalesce(p_responsavel, '')), ''), atualizado_em = now() where id = p_id;
end $function$;

create or replace function public.equipe_ver_engenharia(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.engenharias set docs_novos = false where id = p_id and docs_novos;
end $function$;

create or replace function public.excluir_engenharia(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare e record;
begin
  if not public.posso_ver_engenharia(p_id) then raise exception 'Sem permissão'; end if;
  select * into e from public.engenharias where id = p_id;
  if not public.sou_equipe() and e.etapa not in ('documentacao', 'em_analise') then
    raise exception 'Depois que o boleto é emitido, só a CCA exclui o pedido. Fale com a equipe.'; end if;
  update public.engenharias set excluida_em = now(), excluida_por = auth.uid() where id = p_id;
end $function$;

create or replace function public.registrar_grerj(p_cliente uuid, p_numero text, p_valor numeric, p_pago_em date, p_requerimento_em date)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.clientes set grerj_numero = nullif(trim(p_numero), ''), grerj_valor = p_valor, grerj_pago_em = p_pago_em,
         requerimento_enviado_em = p_requerimento_em
   where id = p_cliente;
  insert into public.eventos (tipo, cliente_id, dados)
  values ('grerj_registrada', p_cliente, jsonb_build_object('numero', p_numero, 'valor', p_valor, 'pago_em', p_pago_em, 'requerimento_em', p_requerimento_em));
end $function$;

create or replace function public.contrato_registrar_arquivo(p_cliente uuid, p_tipo text, p_nome text, p_path text, p_mime text, p_tamanho bigint)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status text; v_nome text; v_id uuid; v_equipe boolean; v_msg text; v_conversa text; v_ir text; v_para text;
  v_cca text[] := array['minuta','planilha_progressao','carta_credito','contrato_assinado','validador_assinatura','procuracao_gerente'];
begin
  select status, nome into v_status, v_nome from public.clientes where id = p_cliente for update;
  if v_status is null then raise exception 'Cliente não encontrado'; end if;
  v_equipe := public.sou_equipe();
  if p_tipo = any(v_cca) then
    if not (v_equipe and public.tenho_permissao('mudar_status')) then raise exception 'Somente a equipe da CCA anexa este arquivo'; end if;
  else
    if not public.posso_ver_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
    if not v_equipe then
      if p_tipo = 'minuta_assinada' and v_status <> 'minuta_em_maos' then raise exception 'A minuta assinada só pode ser enviada na etapa Contrato'; end if;
      if p_tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais') and v_status <> 'registro_cartorio' then raise exception 'Estes documentos só podem ser enviados na etapa Registro'; end if;
    end if;
  end if;

  update public.contrato_arquivos set substituido = true where cliente_id = p_cliente and tipo = p_tipo and not substituido;
  insert into public.contrato_arquivos (cliente_id, tipo, nome_original, arquivo_path, mime, tamanho_bytes, enviado_por)
    values (p_cliente, p_tipo, p_nome, p_path, p_mime, p_tamanho, auth.uid()) returning id into v_id;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'contrato_arquivo', p_cliente, jsonb_build_object('tipo', p_tipo));

  if p_tipo in ('minuta', 'planilha_progressao', 'carta_credito') then
    if v_status = 'conformidade'
       and (select count(distinct tipo) from public.contrato_arquivos where cliente_id = p_cliente and not substituido and tipo in ('minuta', 'planilha_progressao', 'carta_credito')) = 3 then
      v_ir := 'minuta_em_maos'; v_para := 'minuta_em_maos';
      v_msg := 'A minuta de ' || v_nome || ' está disponível para assinatura. Abra o cliente no Portal, baixe a minuta, colha as assinaturas do comprador e do vendedor e envie a minuta assinada.';
    elsif v_status = 'minuta_em_maos' and p_tipo = 'minuta' then
      v_msg := 'A minuta de ' || v_nome || ' foi atualizada. Baixe a versão nova no Portal antes de colher as assinaturas.'; v_para := v_status;
    end if;
  elsif p_tipo = 'minuta_assinada' then
    if not v_equipe then v_conversa := 'Enviei a minuta assinada pelas partes (comprador e vendedor). Ela já está no sistema.'; end if;
  elsif p_tipo in ('contrato_assinado', 'validador_assinatura', 'procuracao_gerente') then
    if v_status = 'minuta_em_maos'
       and (select count(distinct tipo) from public.contrato_arquivos where cliente_id = p_cliente and not substituido and tipo in ('contrato_assinado', 'validador_assinatura', 'procuracao_gerente')) = 3 then
      v_ir := 'registro_cartorio'; v_para := 'contrato_assinado';
      v_msg := 'O contrato de ' || v_nome || ' está assinado! Todos os documentos já estão no Portal, disponíveis para baixar e imprimir. Próximo passo: levar o contrato ao cartório de registro de imóveis. Depois de registrado, envie aqui o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro.';
    end if;
  elsif p_tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais') then
    if v_status = 'registro_cartorio'
       and (select count(distinct tipo) from public.contrato_arquivos where cliente_id = p_cliente and not substituido and tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais')) = 3 then
      v_ir := 'conformidade_final';
      if not v_equipe then v_conversa := 'Enviei o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro. Pode seguir para a conformidade.'; end if;
    end if;
  end if;

  if v_ir is not null then
    perform set_config('app.mudanca_status_autorizada', 'sim', true);
    if v_ir = 'registro_cartorio' then
      insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_status, 'contrato_assinado', auth.uid());
      insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, 'contrato_assinado', 'registro_cartorio', auth.uid());
    else
      insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_status, v_ir, auth.uid());
    end if;
    update public.clientes set status = v_ir where id = p_cliente;
  end if;
  if v_msg is not null then
    insert into public.eventos (tipo, cliente_id, dados)
      values ('status_mudou', p_cliente, jsonb_build_object('de', v_status, 'para', v_para, 'mensagem', v_msg));
  end if;
  if v_conversa is not null then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(), v_conversa);
  end if;
  return v_id;
end $function$;

revoke execute on function public.editar_engenharia(uuid, text, text, text, text, text, text, text, text, text), public.equipe_editar_vendedor(uuid, text, text, text),
  public.equipe_ver_engenharia(uuid), public.excluir_engenharia(uuid), public.registrar_grerj(uuid, text, numeric, date, date),
  public.contrato_registrar_arquivo(uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.editar_engenharia(uuid, text, text, text, text, text, text, text, text, text), public.equipe_editar_vendedor(uuid, text, text, text),
  public.equipe_ver_engenharia(uuid), public.excluir_engenharia(uuid), public.registrar_grerj(uuid, text, numeric, date, date),
  public.contrato_registrar_arquivo(uuid, text, text, text, text, bigint) to authenticated;
