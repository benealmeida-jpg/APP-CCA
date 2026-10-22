-- Cliente (comprador com acesso ao portal) só vê e acessa os documentos dos compradores.
-- Vendedor e imóvel ficam com o corretor/imobiliária e a CCA. O andamento e a lista do que falta, todos veem.
create or replace function public.doc_do_comprador(p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tipos_documento t where t.codigo = p_tipo and t.alvo = 'comprador')
$$;

-- Envio: cliente só anexa documento dos compradores
alter policy cliente_envia_documento on public.documentos
  with check (public.meu_papel() = 'cliente' and cliente_id = public.meu_cliente() and public.doc_do_comprador(tipo_codigo));

-- Arquivos do processo: cliente só abre os dos compradores (pasta cliente/TIPO/arquivo)
alter policy docs_ler on storage.objects
  using (bucket_id = 'documentos' and public.posso_ver_cliente(((storage.foldername(name))[1])::uuid)
         and (public.meu_papel() is distinct from 'cliente' or public.doc_do_comprador((storage.foldername(name))[2])));

-- Imóvel: cliente não abre arquivos nem a ficha do imóvel
alter policy imoveis_ler_pelo_processo on storage.objects
  using (bucket_id = 'imoveis' and public.meu_papel() is distinct from 'cliente' and exists (select 1 from public.clientes c
         where c.imovel_id = ((storage.foldername(objects.name))[1])::uuid and public.posso_ver_cliente(c.id)));

create or replace function public.posso_ver_imovel(p_imovel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() is distinct from 'cliente' and exists (select 1 from public.imoveis im where im.id = p_imovel and (
    public.sou_equipe()
    or auth.uid() in (im.criado_por, im.corretor_id, im.consumidor_id)
    or (im.imobiliaria_id is not null and im.imobiliaria_id = public.minha_imobiliaria())
    or exists (select 1 from public.engenharias e where e.imovel_id = im.id and e.excluida_em is null and public.posso_ver_engenharia(e.id))
    or exists (select 1 from public.clientes c where c.imovel_id = im.id and public.posso_ver_cliente(c.id))))
$$;

-- Documentos do imóvel no processo: para o cliente, só a situação (sem nome nem arquivo), para a lista do que falta
create or replace function public.docs_imovel_do_cliente(p_cliente uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg((to_jsonb(i) - case when public.meu_papel() = 'cliente' then array['arquivo_path', 'nome_original'] else array[]::text[] end) order by i.enviado_em), '[]'::jsonb)
  from public.clientes c join public.imovel_docs i on i.imovel_id = c.imovel_id
  where c.id = p_cliente and public.posso_ver_cliente(p_cliente)
$$;

-- Dados do vendedor (nome, documento, conta): cliente não vê
alter policy ver_vendedor_do_cliente on public.vendedores
  using (public.meu_papel() is distinct from 'cliente' and exists (select 1 from public.clientes c where c.vendedor_id = vendedores.id and public.posso_ver_cliente(c.id)));
