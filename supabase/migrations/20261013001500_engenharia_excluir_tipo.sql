-- Aplicada no banco via execute_sql (exclusão lógica: nada é apagado de verdade, só some das listas).
-- 1) editar_engenharia: corretor também muda o TIPO depois de enviado (até o boleto); marca "Documentos novos" para a equipe.
-- 2) excluir_engenharia(p_id): quem pediu/gestor até a análise; equipe sempre. Grava excluida_em/excluida_por.
-- 3) posso_ver_engenharia e listar_engenharias ignoram pedidos excluídos.
alter table public.engenharias add column if not exists excluida_em timestamptz, add column if not exists excluida_por uuid references public.perfis (id);
-- (corpos das funções: ver banco — editar_engenharia, excluir_engenharia, posso_ver_engenharia, listar_engenharias)
