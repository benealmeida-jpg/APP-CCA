-- Renda informal: a Caixa exige extratos bancários dos últimos 12 meses
update public.tipos_documento
   set nome = 'Extratos bancários dos últimos 12 meses (renda informal)'
 where codigo = 'COMPROVANTE_RENDA_INF';
