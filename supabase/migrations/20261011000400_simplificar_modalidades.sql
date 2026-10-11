-- "Aquisição de Imóvel" substitui Novo/Usado/Na planta na modalidade (o tipo do imóvel é perguntado à parte)
update public.opcoes_cadastro set ativo = false
 where campo = 'modalidade' and valor in ('Aquisição de Imóvel Novo','Aquisição de Imóvel Usado','Aquisição de Imóvel na Planta');
insert into public.opcoes_cadastro (campo, valor, ordem) values ('modalidade', 'Aquisição de Imóvel', 0)
on conflict (campo, valor) do update set ativo = true, ordem = 0;
