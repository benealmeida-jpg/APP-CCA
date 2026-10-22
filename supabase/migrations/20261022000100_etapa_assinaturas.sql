-- Depois da entrevista aprovada: a CCA monta o processo, prepara os formulários (MO/DAMP) e envia para assinatura
-- no gov.br dos compradores e vendedores ("Assinaturas"). Com tudo assinado, a CCA monta o dossiê e envia ao setor
-- de Conformidade da Caixa ("Conformidade"). A barreira dos MO/DAMP assinados continua na entrada da Conformidade.
update public.status_etapas set ordem = ordem + 1 where ordem >= 7 and codigo <> 'assinaturas';
insert into public.status_etapas (codigo, nome, ordem) values ('assinaturas', 'Assinaturas', 7)
on conflict (codigo) do nothing;

create or replace function public.etapa_desde(p_status text, p_etapa text) returns boolean
language sql immutable as $$
  select coalesce(array_position(array['cliente_aprovado', 'entrevista', 'assinaturas', 'conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio',
                                       'conformidade_final', 'credito_liberado'], p_status), 0)
      >= coalesce(array_position(array['cliente_aprovado', 'entrevista', 'assinaturas', 'conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio',
                                       'conformidade_final', 'credito_liberado'], p_etapa), 99)
$$;
