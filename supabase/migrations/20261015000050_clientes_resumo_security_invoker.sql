-- A lista de clientes volta a respeitar as permissões de cada pessoa (cada um vê só os próprios clientes).
-- A troca da visão em 14/10 tirou o security_invoker sem querer. Aplicada no banco em 15/10.
alter view public.clientes_resumo set (security_invoker = true);
