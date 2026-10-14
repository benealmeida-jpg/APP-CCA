-- Engenharia: marca "documentos novos" para a equipe e permite a equipe corrigir nome e CPF/CNPJ do vendedor
-- (aplicado no banco via MCP; funções: tg_engenharia_doc_novo, equipe_ver_engenharia, equipe_editar_vendedor)
alter table public.engenharias add column if not exists docs_novos boolean not null default false;
