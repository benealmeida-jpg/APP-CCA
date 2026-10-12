-- Pacto antenupcial conforme o Código Civil (art. 1.640, parágrafo único, e art. 1.641):
-- exigido em todo regime que não seja comunhão parcial, exceto separação obrigatória (imposta pela lei).
-- Comunhão universal em casamento antes de 26/12/1977 (Lei 6.515/77) era o regime legal: não tem pacto.
update public.tipos_documento set condicao =
  '[{"estado_civil":"Casado(a)","regime_bens":"Comunhão universal"},{"estado_civil":"Casado(a)","regime_bens":"Separação total (convencional)"},{"estado_civil":"Casado(a)","regime_bens":"Participação final nos aquestos"}]'
 where codigo in ('PACTO_ANTENUPCIAL', 'VEND_PF_PACTO');
