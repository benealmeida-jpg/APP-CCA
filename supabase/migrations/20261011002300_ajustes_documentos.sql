-- Ajustes do Ebenézer na lista do curso
-- Carteira de trabalho só para quem tem renda formal (ou mista)
update public.tipos_documento set condicao = '[{"tipo_renda":"Formal"},{"tipo_renda":"Mista"}]' where codigo = 'CARTEIRA_TRABALHO';

-- Regime de bens do comprador casado
alter table public.clientes add column if not exists regime_bens text;
alter table public.participantes add column if not exists regime_bens text;

-- Pacto antenupcial: casado em regime que não é de comunhão (parcial ou universal)
update public.tipos_documento set condicao =
  '[{"estado_civil":"Casado(a)","regime_bens":"Separação total (convencional)"},{"estado_civil":"Casado(a)","regime_bens":"Separação obrigatória"},{"estado_civil":"Casado(a)","regime_bens":"Participação final nos aquestos"}]'
 where codigo = 'VEND_PF_PACTO';
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo, por_pessoa) values
  ('PACTO_ANTENUPCIAL', 'Pacto antenupcial e registro do pacto', 'Do cliente', '',
   '[{"estado_civil":"Casado(a)","regime_bens":"Separação total (convencional)"},{"estado_civil":"Casado(a)","regime_bens":"Separação obrigatória"},{"estado_civil":"Casado(a)","regime_bens":"Participação final nos aquestos"}]',
   5, 'comprador', true)
on conflict (codigo) do update set nome = excluded.nome, condicao = excluded.condicao, ordem = excluded.ordem, alvo = excluded.alvo, por_pessoa = true, ativo = true;
