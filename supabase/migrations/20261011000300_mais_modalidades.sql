-- Modalidades provisórias (serão conferidas com o simulador da Caixa)
insert into public.opcoes_cadastro (campo, valor, ordem) values
  ('modalidade', 'Aquisição de Imóvel Novo', 2),
  ('modalidade', 'Aquisição de Imóvel Usado', 3),
  ('modalidade', 'Aquisição de Imóvel na Planta', 4),
  ('modalidade', 'Construção em Terreno Próprio', 5),
  ('modalidade', 'Término de Obra', 6),
  ('modalidade', 'Reforma e/ou Ampliação', 7)
on conflict do nothing;
