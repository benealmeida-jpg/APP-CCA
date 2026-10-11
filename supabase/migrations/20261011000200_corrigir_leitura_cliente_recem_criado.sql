-- A regra de leitura "ver_cliente" consulta a própria tabela e não enxerga o cliente
-- recém-criado (o app grava e lê de volta na mesma operação). Esta regra extra usa as colunas da linha.
create policy ver_cliente_pela_linha on public.clientes for select to authenticated
  using (corretor_id = auth.uid()
         or public.sou_equipe()
         or (public.meu_papel() = 'gestor_imobiliaria'
             and imobiliaria_id is not null
             and imobiliaria_id = public.minha_imobiliaria()));
