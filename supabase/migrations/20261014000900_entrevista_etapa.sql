-- A entrevista com o gerente vira uma etapa do processo (depois de Cliente Aprovado).
-- Aprovada: segue para Conformidade. Reprovada: encerra o processo (status final 'entrevista_reprovada').
-- Aplicada em duas partes pelo MCP (etapas; função agendar_entrevista).
update public.status_etapas set ordem = ordem + 1 where ordem >= 6;
insert into public.status_etapas (codigo, nome, ordem) values
  ('entrevista', 'Entrevista', 6),
  ('entrevista_reprovada', 'Entrevista reprovada', 10)
on conflict (codigo) do nothing;
-- agendar_entrevista: agendar leva de Cliente Aprovado para Entrevista (com histórico); cancelar volta.
-- (texto completo da função aplicada: ver o banco; mesma assinatura da migração 20261014000800)
