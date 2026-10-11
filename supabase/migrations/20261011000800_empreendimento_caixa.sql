-- Vendedor PJ: o empreendimento foi construído com recurso da Caixa? (muda taxa e, em alguns casos, prazo)
alter table public.clientes add column if not exists empreendimento_caixa boolean;
