-- Limpeza: remove 4 funções antigas que já foram substituídas por versões novas (_v2)
-- e não são mais chamadas pelo app nem por outras funções do banco (conferido em 26/10/2026).
-- Remover função não apaga dado nenhum.
--
-- 1) mo_anexar_assinado (antiga, sem trava): permitia trocar um MO/DAMP já lançado na Caixa
--    e apagava a marca de "lançado". A mo_anexar_assinado_v2 tem a regra antifraude
--    (depois de lançado, só a CCA troca) e registra quem assinou e se foi digital.
-- 2) listar_vendedores: substituída por listar_vendedores_v2 (mesma trava, com o nome do responsável).
-- 3) documentos_do_vendedor: substituída por documentos_do_vendedor_v2 (mesma trava, com a data de emissão).
-- 4) documentos_necessarios: substituída por documentos_necessarios_v2 (considera todos os compradores).
drop function if exists public.mo_anexar_assinado(uuid, text, text);
drop function if exists public.listar_vendedores();
drop function if exists public.documentos_do_vendedor(uuid);
drop function if exists public.documentos_necessarios(uuid);
