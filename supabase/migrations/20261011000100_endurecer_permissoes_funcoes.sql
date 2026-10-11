alter function public.tg_clientes_protecao() set search_path = public;
alter function public.tg_perfis_protecao() set search_path = public;

-- Ninguém sem login executa funções do app
revoke execute on all functions in schema public from public, anon;

-- Funções de gatilho não são chamadas diretamente por ninguém
revoke execute on function public.tg_clientes_novo(), public.tg_clientes_protecao(), public.tg_documentos_novo(),
  public.tg_documentos_evento(), public.tg_novo_usuario(), public.tg_perfis_protecao() from authenticated;

-- Usuários logados: funções de permissão (usadas pelas regras de acesso) e ações do app,
-- todas com verificação interna de quem está chamando
grant execute on function public.meu_papel(), public.sou_equipe(), public.minha_imobiliaria(),
  public.posso_ver_cliente(uuid), public.documentos_necessarios(uuid), public.pode_ir_para_analise(uuid),
  public.enviar_cadastro(uuid), public.mudar_status(uuid, text), public.conferir_documento(uuid, boolean, text, text),
  public.registrar_acesso(text, uuid, jsonb) to authenticated;

-- Novas funções criadas no futuro não ficam públicas por padrão
alter default privileges in schema public revoke execute on functions from public, anon;
