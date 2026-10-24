-- Segurança (verificador do Supabase):
-- 1) Funções de gatilho não podem ser chamadas pela API: ninguém precisa de EXECUTE (o gatilho dispara assim mesmo).
-- 2) doc_do_comprador é usada em regra de acesso de usuários logados: só tira de quem não tem login.
-- 3) search_path fixo nas funções que não tinham (evita que outro schema "sequestre" nomes).
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
revoke execute on function public.doc_do_comprador(text) from public, anon;
grant execute on function public.doc_do_comprador(text) to authenticated;

alter function public.tg_perfis_protecao() set search_path = public;
alter function public.tg_documento_ia_limpar() set search_path = public;
alter function public.tg_clientes_imovel() set search_path = public;
alter function public.bloquear_entrevista_fora_da_funcao() set search_path = public;
alter function public.etapa_desde(text, text) set search_path = public;
alter function public.eh_doc_imovel(text) set search_path = public;
alter function public.doc_imovel_para_cliente(text) set search_path = public;
alter function public.doc_cliente_para_imovel(text) set search_path = public;
alter function public.servico_engenharia(text) set search_path = public;
alter function public.doc_travado(text, jsonb) set search_path = public;
