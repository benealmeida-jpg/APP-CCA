-- Lista definitiva de * e ** (pendência d01-asteriscos, definida pelo Ebenézer em 12/10/2026)
-- **  sem ele o processo não vai para análise
-- *   pode enviar o cadastro sem ele e anexar depois
-- Todo documento ativo passa a ter uma das duas marcas.

update public.tipos_documento set regra = '*' where ativo;

update public.tipos_documento set regra = '**' where codigo in (
  'RG_CNH',                       -- RG ou CNH
  'COMPROVANTE_RESIDENCIA',       -- comprovante de residência
  'CERTIDAO_ESTADO_CIVIL',        -- certidão de nascimento ou casamento
  'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'COMPROVANTE_RENDA_INF',  -- comprovação de renda
  'DECLARACAO_IR', 'RECIBO_IR', 'IR_RETIFICADORA', 'RECIBO_IR_RETIFICADORA',
  'DEFIS_ULTIMO_ANO', 'DEFIS_PENULTIMO_ANO',
  'SIMULACAO'                     -- simulação de financiamento
);

-- Fator social (documentos dos dependentes) e extrato do FGTS ficam com *.
-- A resposta sobre dependentes e sobre 3 anos de FGTS continua obrigatória no formulário.
update public.tipos_documento set regra = '*'
 where codigo in ('FATOR_SOCIAL_RG_CERTIDAO', 'FATOR_SOCIAL_RG_CNH', 'DECLARACAO_DEPENDENTE', 'EXTRATO_FGTS');
