-- Dependentes (fator social), identidade preferencial CNH
alter table public.clientes add column if not exists dependentes_info jsonb not null default '[]'::jsonb;
alter table public.documentos add column if not exists dependente_ordem smallint;
alter table public.tipos_documento add column if not exists por_dependente boolean not null default false;

update public.tipos_documento
   set nome = 'Identidade: CNH (na falta, RG, CTPS ou passaporte)'
 where codigo = 'RG_CNH';

insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, por_dependente) values
  ('FATOR_SOCIAL_RG_CERTIDAO', 'RG ou Certidão de Nascimento', 'Fator social', '', '[{"filho":true},{"filho":false,"menor":true}]', 40, true),
  ('FATOR_SOCIAL_RG_CNH',      'RG ou CNH',                    'Fator social', '', '[{"filho":false,"menor":false}]', 41, true),
  ('DECLARACAO_DEPENDENTE',    'Declaração de dependente',     'Fator social', '', '[{"filho":false}]', 42, true)
on conflict (codigo) do nothing;

-- Versões separadas por pessoa e por dependente
create or replace function public.tg_documentos_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_pessoa int;
begin
  if new.participante_id is not null and not exists (
       select 1 from public.participantes p where p.id = new.participante_id and p.cliente_id = new.cliente_id) then
    raise exception 'Pessoa não pertence a este cliente';
  end if;
  select coalesce(max(versao), 0) into v_max
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo;
  select count(*) into v_pessoa
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id
     and dependente_ordem is not distinct from new.dependente_ordem;
  new.versao := v_max + 1;
  new.versao_pessoa := v_pessoa + 1;
  new.situacao := 'em_conferencia';
  new.enviado_por := auth.uid();
  new.motivo_recusa := null; new.observacao_recusa := null;
  new.conferido_por := null; new.conferido_em := null;
  update public.documentos set situacao = 'substituido'
   where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id
     and dependente_ordem is not distinct from new.dependente_ordem
     and situacao <> 'substituido';
  return new;
end $$;
