-- Renda mista (formal + informal), Imposto de Renda (com retificação) e pró-labore (DEFIS)
alter table public.clientes
  add column if not exists renda_formal   numeric(12,2),
  add column if not exists renda_informal numeric(12,2),
  add column if not exists declara_ir     boolean,
  add column if not exists ir_retificado  boolean;

insert into public.opcoes_cadastro (campo, valor, ordem) values ('tipo_renda', 'Pró-labore', 4)
on conflict (campo, valor) do update set ativo = true;

insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem) values
  ('DECLARACAO_IR',          'Declaração do Imposto de Renda',     'Renda', '', '[{"declara_ir":true}]', 13),
  ('RECIBO_IR',              'Recibo de entrega do IR',            'Renda', '', '[{"declara_ir":true}]', 14),
  ('IR_RETIFICADORA',        'Declaração retificadora do IR',      'Renda', '', '[{"ir_retificado":true}]', 15),
  ('RECIBO_IR_RETIFICADORA', 'Recibo de entrega da retificadora',  'Renda', '', '[{"ir_retificado":true}]', 16),
  ('DEFIS_ULTIMO_ANO',       'DEFIS da empresa – último ano',      'Renda', '', '[{"tipo_renda":"Pró-labore"}]', 17),
  ('DEFIS_PENULTIMO_ANO',    'DEFIS da empresa – penúltimo ano',   'Renda', '', '[{"tipo_renda":"Pró-labore"}]', 18)
on conflict (codigo) do nothing;
