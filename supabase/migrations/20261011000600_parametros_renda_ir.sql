-- Parâmetros editáveis pela equipe (valores que mudam com o tempo)
create table if not exists public.parametros (
  chave      text primary key,
  valor      text not null,
  descricao  text
);

insert into public.parametros (chave, valor, descricao) values
  ('limite_isencao_irpf_anual', '35584', 'Rendimentos tributáveis anuais acima dos quais a declaração de IRPF é obrigatória (IRPF 2026, ano-base 2025)'),
  ('prazo_entrega_irpf', '2026-05-29', 'Último dia do prazo de entrega da declaração de IRPF do ano vigente'),
  ('teto_renda_informal_sem_ir', '2550', 'Renda informal máxima aceita pela Caixa quando o cliente passa do limite de isenção e não declarou IR')
on conflict (chave) do nothing;

alter table public.parametros enable row level security;
create policy leitura_parametros on public.parametros for select to authenticated using (true);
create policy equipe_parametros on public.parametros for all to authenticated
  using (public.sou_equipe()) with check (public.sou_equipe());

-- Renda que a Caixa vai considerar (pode ser menor que a informada, pela regra do IR)
alter table public.clientes add column if not exists renda_considerada numeric(12,2);
