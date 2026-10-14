-- Contrato: a etapa "Minuta em mãos" passa a se chamar "Contrato" e o processo ganha as etapas
-- Registro (cartório), Conformidade final e Crédito liberado. Arquivos de cada passo ficam em contrato_arquivos
-- (arquivos no bucket 'documentos', pasta <cliente>/contrato/...). Aplicada em partes pelo MCP.

update public.status_etapas set nome = 'Contrato' where codigo = 'minuta_em_maos';
update public.status_etapas set ordem = 13 where codigo = 'entrevista_reprovada';
insert into public.status_etapas (codigo, nome, ordem) values
  ('registro_cartorio', 'Registro', 10),
  ('conformidade_final', 'Conformidade final', 11),
  ('credito_liberado', 'Crédito liberado', 12)
on conflict (codigo) do nothing;

create table if not exists public.contrato_arquivos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes (id) on delete cascade,
  tipo          text not null check (tipo in ('minuta','planilha_progressao','carta_credito','minuta_assinada','contrato_assinado','validador_assinatura','procuracao_gerente','contrato_registrado','talao_rgi','onus_reais')),
  nome_original text not null,
  arquivo_path  text not null,
  mime          text,
  tamanho_bytes bigint,
  enviado_por   uuid references public.perfis (id),
  enviado_em    timestamptz not null default now(),
  substituido   boolean not null default false
);
create index if not exists contrato_arquivos_cliente_idx on public.contrato_arquivos (cliente_id, tipo);
alter table public.contrato_arquivos enable row level security;
create policy contrato_ver on public.contrato_arquivos for select to authenticated using (public.posso_ver_cliente(cliente_id));

-- Bucket 'documentos' passa a aceitar planilha e Word (a planilha de progressão costuma ser Excel) e assinatura .p7s
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/heic','image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/pkcs7-signature'] where id = 'documentos';

-- contrato_registrar_arquivo(p_cliente, p_tipo, p_nome, p_path, p_mime, p_tamanho):
--  * CCA anexa minuta + planilha de progressão + carta de crédito → de Conformidade para Contrato (avisa o corretor)
--  * corretor anexa minuta_assinada → avisa a equipe (mensagem na conversa do cliente)
--  * CCA anexa contrato assinado + validador + procuração → Contrato assinado → Registro (avisa o corretor)
--  * corretor anexa contrato registrado + talão do RGI + ônus reais → Conformidade final (avisa a equipe)
--  * Crédito liberado: a equipe muda o status (botão no painel)
-- (texto completo da função: ver o banco)
