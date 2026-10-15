// Cadastro do Imóvel (Modelo 2): lista, ficha do imóvel (dados, documentos, engenharias, vendas) e ligação com o processo do cliente.
import { h, limpar, icone, toast } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import * as IM from './imoveis-dados.js';
import { nomeTipoEngenharia, nomeEtapaEngenharia, dataBR, moeda, DOCS_POR_TIPO } from './engenharia-regras.js';
import { cabecalho, secaoTitulo, aviso, chipStatus } from './componentes.js';

// Botão de anexar que abre a escolha de arquivo pelo próprio navegador (rótulo + campo de arquivo): funciona em qualquer navegador
export function botaoArquivo(rotulo, aoEnviar, { principal = false, accept = 'application/pdf,image/*,.xls,.xlsx', classe = '' } = {}) {
  const entrada = h('input', { type: 'file', accept, class: 'arquivo-oculto', tabindex: -1, 'aria-hidden': 'true' });
  const texto = h('span', null, rotulo);
  const botao = h('label', { class: `btn ${principal ? 'btn-primario' : 'btn-contorno'} btn-pequeno botao-arquivo ${classe}`, role: 'button', tabindex: 0,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } } }, icone('clipe', { tam: 16, traco: 2.2 }), texto, entrada);
  entrada.addEventListener('change', async () => {
    const f = entrada.files[0]; entrada.value = '';
    if (!f) return;
    botao.classList.add('enviando'); texto.textContent = 'Enviando…';
    try { await aoEnviar(f); } catch (e) { toast(e.message); texto.textContent = rotulo; botao.classList.remove('enviando'); }
  });
  return botao;
}

const situacaoLaudo = (l) => {
  if (!l || l.situacao === 'sem') return h('span', { class: 'chip' }, 'Sem engenharia');
  if (l.situacao === 'andamento') return h('span', { class: 'chip chip-em_conferencia' }, 'Engenharia em andamento');
  if (l.situacao === 'reprovado') return h('span', { class: 'chip chip-alerta' }, 'Laudo reprovado');
  if (l.situacao === 'vencido') return h('span', { class: 'chip chip-alerta' }, `Laudo vencido em ${dataBR(l.validade)}`);
  return h('span', { class: 'chip chip-aceito' }, `${moeda(l.valor)} · válido até ${dataBR(l.validade)}`);
};
const chipDoc = (d) => (d.situacao === 'aceito' ? h('span', { class: 'chip chip-aceito' }, 'Conferido') : d.situacao === 'recusado' ? h('span', { class: 'chip chip-alerta' }, 'Recusado') : h('span', { class: 'chip chip-em_conferencia' }, 'Enviado'));
async function abrirDoc(doc) {
  const janela = window.open('', '_blank');
  try { const url = await api.abrirDocImovel(doc); if (janela) janela.location = url; else location.href = url; } catch (e) { janela?.close(); toast(e.message); }
}

// ================= Lista =================
const estadoLista = { busca: '' };
export async function conteudoImoveis({ daEquipe, id = null, recarregar }) {
  const base = daEquipe ? '#/painel/imoveis' : '#/imoveis';
  if (id && !String(id).startsWith('v:')) return telaImovel(id, { daEquipe, base, recarregar });
  const vendedorId = id ? String(id).slice(2) : null;
  const lista = await api.listarImoveis(vendedorId ? { vendedorId } : {});
  const caixa = h('div');
  const desenhar = () => {
    limpar(caixa);
    const termo = estadoLista.busca.toLowerCase().trim(); const dig = R.soDigitos(termo);
    const vis = lista.filter((i) => !termo || [i.endereco, i.cidade, i.matricula, i.vendedor_nome].join(' ').toLowerCase().includes(termo) || (dig && String(i.vendedor_doc || '').includes(dig)));
    caixa.appendChild(h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela tabela-clicavel tabela-imoveis' },
      h('thead', null, h('tr', null, ['Imóvel', 'Vendedor', 'Documentos', 'Avaliação', 'Vendas'].map((t) => h('th', null, t)))),
      h('tbody', null, vis.length ? vis.map((i) => h('tr', { tabindex: 0, role: 'link', 'data-imovel': i.id, onclick: () => { location.hash = `${base}/${i.id}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `${base}/${i.id}`; } },
        h('td', null, h('b', null, i.endereco || 'Endereço não informado'), h('div', { class: 'sub' }, [[i.cidade, i.uf].filter(Boolean).join('/'), i.matricula ? `Matrícula ${i.matricula}` : null].filter(Boolean).join(' · '))),
        h('td', null, i.vendedor_nome),
        h('td', null, `${i.qtd_docs} ${i.qtd_docs === 1 ? 'documento' : 'documentos'}`),
        h('td', null, situacaoLaudo(i.laudo)),
        h('td', null, i.clientes.length ? `${i.clientes.length} ${i.clientes.length === 1 ? 'processo' : 'processos'}` : '—')))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { textAlign: 'center', padding: '30px' } }, lista.length ? 'Nenhum imóvel encontrado.' : 'Nenhum imóvel cadastrado ainda. Eles entram aqui quando alguém pede engenharia ou cadastra um imóvel.'))))));
  };
  const busca = h('input', { type: 'search', class: 'entrada', id: 'buscaImovel', placeholder: 'Endereço, matrícula ou vendedor', value: estadoLista.busca, style: { width: '320px', maxWidth: '100%' }, oninput: (e) => { estadoLista.busca = e.target.value; desenhar(); } });
  desenhar();
  const vend = vendedorId ? lista[0]?.vendedor_nome : null;
  return [cabecalho(daEquipe ? { sobre: 'Parceiros', titulo: 'Imóveis', sub: 'Cada imóvel guarda os documentos e as engenharias dele. Os documentos são enviados uma vez só e servem para a engenharia e para as vendas.' }
    : { sobre: 'Portal do corretor', titulo: 'Imóveis', sub: 'Os imóveis dos vendedores com quem você trabalha: documentos, engenharias e vendas.', foto: 'corretor' }, busca),
    vendedorId ? aviso('azul', h('b', null, `Imóveis de ${vend || 'um vendedor'}. `), h('a', { href: base }, 'Ver todos os imóveis')) : null,
    caixa];
}

// ================= Ficha do imóvel =================
export function pedirEngenhariaDoImovel(imovel, baseEngenharia) {
  IM.pedidoDeEngenharia.imovel = { id: imovel.id, vendedor_doc: imovel.vendedor?.cpf_cnpj || imovel.vendedor_doc };
  location.hash = `${baseEngenharia}/nova`;
}
async function telaImovel(id, ctx) {
  const im = await api.obterImovel(id);
  const v = im.vendedor;
  const baseEng = ctx.daEquipe ? '#/painel/engenharia' : '#/engenharia';
  const baseCli = ctx.daEquipe ? '#/painel/clientes' : '#/cliente';
  const recarregar = ctx.recarregar || (() => window.dispatchEvent(new HashChangeEvent('hashchange')));

  // dados (com edição)
  const cartaoDados = h('section', { class: 'cartao', id: 'imovelDados', style: { gap: '8px' } });
  const ver = () => {
    limpar(cartaoDados);
    cartaoDados.append(
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        secaoTitulo('Dados do imóvel', null, { pequeno: true, nivel: 'h3', icone: 'casa' }),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: editar }, icone('lapis', { tam: 16, traco: 2.2 }), ' Editar dados')),
      h('div', null, h('b', null, 'Endereço: '), IM.enderecoImovel(im)),
      h('div', null, h('b', null, 'Matrícula: '), im.matricula || '—', im.cartorio_rgi ? ` · ${im.cartorio_rgi}` : ''),
      h('div', null, h('b', null, 'Vendedor: '), v ? `${v.nome} · ${v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)}` : '—',
        v?.telefone ? ` · ${R.formatarCelular(v.telefone)}` : '', v?.email ? [' · ', h('a', { href: `mailto:${v.email}` }, v.email)] : ''));
  };
  const editar = () => {
    limpar(cartaoDados);
    const d = { id: im.id, endereco: im.endereco || '', uf: im.uf || '', cidade: im.cidade || '', matricula: im.matricula || '', cartorio_rgi: im.cartorio_rgi || '' };
    const campo = (cid, rot, k, attrs = {}) => h('div', { class: 'campo' }, h('label', { for: cid }, rot), h('input', { id: cid, class: 'entrada', value: d[k], oninput: (e) => { d[k] = e.target.value; }, ...attrs }));
    const selMun = h('select', { id: 'im-cid', class: 'entrada', onchange: (e) => { d.cidade = e.target.value; } });
    const carregar = async (uf, manter) => {
      limpar(selMun); selMun.appendChild(h('option', { value: '' }, uf ? 'Carregando…' : 'Escolha a UF'));
      if (!uf) return; let l = []; try { l = await api.municipios(uf); } catch { /* sem conexão */ }
      if (manter && !l.includes(manter)) l = [manter, ...l];
      limpar(selMun); selMun.appendChild(h('option', { value: '' }, 'Escolha o município')); l.forEach((n) => selMun.appendChild(h('option', { value: n, selected: n === manter }, n)));
    };
    const selUf = h('select', { id: 'im-uf', class: 'entrada', onchange: (e) => { d.uf = e.target.value; d.cidade = ''; carregar(d.uf, ''); } }, h('option', { value: '' }, 'UF'), R.UFS.map((u) => h('option', { value: u, selected: u === d.uf }, u)));
    carregar(d.uf, d.cidade);
    const erro = h('div', { class: 'erro-campo', role: 'alert' });
    const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: async () => { erro.textContent = ''; try { await api.salvarImovel(d); toast('Imóvel atualizado.'); recarregar(); } catch (e) { erro.textContent = e.message; } } }, 'Salvar');
    cartaoDados.append(secaoTitulo('Editar dados do imóvel', null, { pequeno: true, nivel: 'h3', icone: 'lapis' }),
      h('div', { class: 'form-eng-grade' }, h('div', { class: 'campo-largo' }, campo('im-end', 'Endereço do imóvel', 'endereco')),
        h('div', { style: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '12px' } }, h('div', { class: 'campo' }, h('label', { for: 'im-uf' }, 'UF'), selUf), h('div', { class: 'campo' }, h('label', { for: 'im-cid' }, 'Município'), selMun)),
        campo('im-mat', 'Matrícula (nº)', 'matricula'), h('div', { class: 'campo-largo' }, campo('im-rgi', 'Cartório de registro (RGI)', 'cartorio_rgi'))),
      erro, h('div', { class: 'gest-acoes' }, salvar, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: ver }, 'Cancelar')));
  };
  ver();

  // documentos
  const atuais = IM.docsAtuais(im.docs);
  const ordem = ['MATRICULA', 'IPTU', 'HABITESE', 'ALVARA', 'PROJETO', 'ART', 'SINTESE', 'CNO_SCPO', 'CREA_CAU', 'PCI', 'ARREMATACAO'];
  // Primeiro os documentos que as engenharias deste imóvel pedem e os já enviados; o resto fica em "Outros documentos"
  const tiposEng = [...new Set([im.tipo, ...im.engenharias.map((e) => e.tipo)].filter(Boolean))];
  const pedidos = new Set(tiposEng.flatMap((t) => DOCS_POR_TIPO[t] || []));
  const principais = ordem.filter((cod) => atuais.has(cod) || pedidos.has(cod) || (!pedidos.size && ['MATRICULA', 'IPTU', 'HABITESE'].includes(cod)));
  const outros = ordem.filter((cod) => !principais.includes(cod));
  const linhaDoc = (cod) => {
    const d = atuais.get(cod);
    return h('div', { class: 'imovel-doc', 'data-doc': cod },
      h('span', { class: `imovel-doc-ic${d ? ' ok' : ''}` }, icone(d ? 'check' : 'doc', { tam: 16, traco: 2.4 })),
      h('span', { class: 'imovel-doc-nome' }, h('b', null, IM.nomeDocImovel(cod)), h('small', null, d ? `${d.nome_original} · ${dataBR(d.enviado_em)}${IM.PARA_CLIENTE[cod] ? ' · vale também para as vendas' : ''}` : 'Ainda não enviado')),
      d ? chipDoc(d) : null,
      d ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Ver ${IM.nomeDocImovel(cod)}`, onclick: () => abrirDoc(d) }, icone('olho', { tam: 18 })) : null,
      ctx.daEquipe && d && d.situacao !== 'aceito' ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await api.conferirDocImovel(d.id, true); toast('Documento conferido.'); recarregar(); } catch (e) { toast(e.message); } } }, 'Aceitar') : null,
      ctx.daEquipe && d && d.situacao === 'em_conferencia' ? h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await api.conferirDocImovel(d.id, false); toast('Documento recusado. Peça outro.'); recarregar(); } catch (e) { toast(e.message); } } }, 'Recusar') : null,
      botaoArquivo(d ? 'Substituir' : 'Anexar', async (f) => { await api.enviarDocImovel(im.id, cod, f); toast(`${IM.nomeDocImovel(cod)} anexado.`); recarregar(); }, { principal: !d }));
  };
  const linhasDocs = [...principais.map(linhaDoc),
    outros.length ? h('details', { class: 'imovel-outros' }, h('summary', null, `Outros documentos (se a Caixa pedir) · ${outros.length}`), h('div', { class: 'imovel-docs' }, outros.map(linhaDoc))) : null];

  // engenharias
  const engs = [...im.engenharias].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const cartaoEng = h('section', { class: 'cartao', style: { gap: '10px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      secaoTitulo('Engenharias', 'Avaliações da Caixa deste imóvel. O laudo vale 180 dias.', { pequeno: true, nivel: 'h3', icone: 'escudo' }),
      h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'pedirEngImovel', onclick: () => pedirEngenhariaDoImovel(im, baseEng) }, icone('mais', { tam: 16, traco: 2.4 }), ' Pedir engenharia deste imóvel')),
    engs.length ? h('ul', { class: 'imovel-lista' }, engs.map((e) => h('li', null, h('a', { href: `${baseEng}/${e.id}` },
      h('span', null, h('b', null, nomeTipoEngenharia(e.tipo)), h('small', null, `Pedida em ${dataBR(e.criado_em)}${e.valor_desejado ? ` · valor desejado ${moeda(e.valor_desejado)}` : ''}`)),
      e.etapa === 'laudo' ? (e.laudo_aprovado ? h('span', { class: 'chip chip-aceito' }, `Aprovado · ${moeda(e.avaliacao_valor)}`) : h('span', { class: 'chip chip-alerta' }, 'Reprovado'))
        : h('span', { class: 'chip chip-em_conferencia' }, nomeEtapaEngenharia(e.etapa)), icone('seta', { tam: 16, traco: 2.2 })))))
      : h('div', { class: 'ajuda' }, 'Nenhuma engenharia pedida para este imóvel ainda.'));

  // vendas
  const cartaoVendas = h('section', { class: 'cartao', style: { gap: '10px' } },
    secaoTitulo('Vendas (processos de clientes)', 'Processos ligados a este imóvel: os documentos do imóvel entram neles sozinhos.', { pequeno: true, nivel: 'h3', icone: 'pessoas' }),
    im.clientes.length ? h('ul', { class: 'imovel-lista' }, im.clientes.map((c) => h('li', null, h('a', { href: `${baseCli}/${c.id}` }, h('span', null, h('b', null, c.nome)), chipStatus(c.status), icone('seta', { tam: 16, traco: 2.2 })))))
      : h('div', { class: 'ajuda' }, 'Nenhum processo ligado. No cadastro do cliente, na etapa Documentos, escolha este imóvel.'));

  return [h('a', { class: 'voltar-link', href: ctx.base }, icone('voltar', { tam: 20, traco: 2.4 }), 'Imóveis'),
    cabecalho(ctx.daEquipe ? { sobre: 'Imóvel', titulo: im.endereco || 'Imóvel', sub: `${[im.cidade, im.uf].filter(Boolean).join('/')} · Vendedor: ${v?.nome || '—'}` }
      : { sobre: 'Imóvel', titulo: im.endereco || 'Imóvel', sub: `${[im.cidade, im.uf].filter(Boolean).join('/')} · Vendedor: ${v?.nome || '—'}`, foto: 'corretor' }, situacaoLaudo(im.laudo)),
    h('div', { class: 'imovel-grade' },
      h('div', { class: 'coluna-cartoes' }, cartaoDados,
        h('section', { class: 'cartao', id: 'imovelDocs', style: { gap: '10px' } }, secaoTitulo('Documentos do imóvel', `${atuais.size} enviados. Servem para todas as engenharias e vendas deste imóvel.`, { pequeno: true, nivel: 'h3', icone: 'doc' }),
          h('div', { class: 'imovel-docs' }, linhasDocs))),
      h('div', { class: 'coluna-cartoes' }, cartaoEng, cartaoVendas))];
}

// ================= Imóvel no processo do cliente =================
// editavel: corretor/gestor/CCA podem ligar ou trocar o imóvel; base: rota da ficha do imóvel
export function blocoImovelDoCliente({ cliente, editavel = true, daEquipe = false, aoMudar }) {
  const caixa = h('section', { class: 'cartao imovel-cliente', id: 'imovelDoCliente' }, h('div', { class: 'ajuda' }, 'Carregando o imóvel…'));
  const base = daEquipe ? '#/painel/imoveis' : '#/imoveis';
  (async () => {
    const lista = cliente.vendedor_id ? await api.listarImoveis({ vendedorId: cliente.vendedor_id }).catch(() => []) : [];
    const atual = lista.find((i) => i.id === cliente.imovel_id) || null;
    limpar(caixa);
    caixa.appendChild(secaoTitulo('Imóvel cadastrado', atual ? 'Os documentos do imóvel já valem para este processo.' : 'Se o imóvel já tem cadastro, os documentos dele entram aqui sozinhos.', { pequeno: true, nivel: 'h3', icone: 'casa' }));
    if (!cliente.vendedor_id) { caixa.appendChild(h('div', { class: 'ajuda' }, 'Informe o vendedor no cadastro para escolher o imóvel.')); return; }
    if (atual) {
      const pull = [...IM.docsAtuais(atual.docs).keys()].filter((c) => IM.PARA_CLIENTE[c]).map(IM.nomeDocImovel);
      caixa.append(h('div', { class: 'eng-acomp-resumo' }, icone('casa', { tam: 18, traco: 2 }), h('span', null, h('a', { href: `${base}/${atual.id}` }, h('b', null, IM.enderecoImovel(atual))), atual.matricula ? ` · Matrícula ${atual.matricula}` : '')),
        h('div', { class: 'imovel-cliente-linha' }, situacaoLaudo(atual.laudo), pull.length ? h('span', { class: 'ajuda' }, `Já vêm do imóvel: ${pull.join(', ')}.`) : h('span', { class: 'ajuda' }, 'O imóvel ainda não tem documentos que sirvam para a venda.')));
    }
    if (!editavel) return;
    if (!lista.length) { caixa.appendChild(h('div', { class: 'ajuda' }, 'Este vendedor ainda não tem imóvel cadastrado. Ele aparece aqui depois de um pedido de engenharia.')); return; }
    const sel = h('select', { class: 'entrada', id: 'imovelCliente', 'aria-label': 'Imóvel deste processo', onchange: async (e) => {
      sel.disabled = true;
      try { await api.vincularImovelCliente(cliente.id, e.target.value || null); toast(e.target.value ? 'Imóvel ligado ao processo. Os documentos dele já entraram.' : 'Imóvel desligado do processo.'); aoMudar?.(); } catch (er) { toast(er.message); sel.disabled = false; }
    } }, h('option', { value: '' }, atual ? 'Desligar o imóvel deste processo' : 'Escolha o imóvel deste vendedor'),
      lista.map((i) => h('option', { value: i.id, selected: i.id === cliente.imovel_id }, `${IM.enderecoImovel(i)}${i.matricula ? ` · Matrícula ${i.matricula}` : ''}`)));
    caixa.appendChild(h('div', { class: 'campo', style: { maxWidth: '620px' } }, h('label', { for: 'imovelCliente' }, atual ? 'Trocar o imóvel' : 'Qual imóvel está sendo vendido?'), sel));
  })().catch(() => limpar(caixa));
  return caixa;
}

// ================= Escolha do imóvel no pedido de engenharia =================
// Mostra os imóveis do vendedor: escolher um ou cadastrar outro. estado.imovel = imóvel escolhido | null (novo)
export function escolhaDeImovel(lista, estado, aoMudar) {
  if (!lista.length) return null;
  const card = (i) => h('button', { type: 'button', class: `imovel-opcao${estado.imovel?.id === i.id ? ' ativo' : ''}`, 'aria-pressed': String(estado.imovel?.id === i.id), 'data-opcao-imovel': i.id,
    onclick: () => { estado.imovel = i; aoMudar(); } },
    h('b', null, i.endereco || 'Endereço não informado'), h('small', null, [[i.cidade, i.uf].filter(Boolean).join('/'), i.matricula ? `Matrícula ${i.matricula}` : null, `${i.qtd_docs} docs`].filter(Boolean).join(' · ')),
    situacaoLaudo(i.laudo));
  return h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, 'Qual imóvel deste vendedor?'),
    h('div', { class: 'imovel-opcoes' }, lista.map(card),
      h('button', { type: 'button', class: `imovel-opcao novo${estado.imovel === null ? ' ativo' : ''}`, 'aria-pressed': String(estado.imovel === null), 'data-opcao-imovel': 'novo', onclick: () => { estado.imovel = null; aoMudar(); } },
        icone('mais', { tam: 18, traco: 2.4 }), h('b', null, 'Outro imóvel'), h('small', null, 'Cadastrar agora'))));
}
