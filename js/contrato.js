// Contrato: bloco do cliente (equipe e corretor) e página "Contratos" do painel.
import { h, icone, toast, limpar } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import * as K from './contrato-dados.js';
import { secaoTitulo, perguntarSimNao, chipStatus, cabecalho } from './componentes.js';

const ACEITA = '.pdf,.png,.jpg,.jpeg,.heic,.webp,.xls,.xlsx,.doc,.docx,.p7s';
const dataCurta = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

async function abrirArquivo(a, baixar) {
  try {
    const url = await api.abrirContratoArquivo(a, { baixar });
    if (baixar) { const l = h('a', { href: url, download: a.nome_original || 'arquivo', target: '_blank', rel: 'noopener' }); document.body.appendChild(l); l.click(); l.remove(); }
    else window.open(url, '_blank', 'noopener');
  } catch (e) { toast(e.message); }
}

// Um arquivo do contrato: mostra o que falta ou o que já foi anexado, com ver, baixar e anexar/substituir
function linhaArquivo(tipo, atual, { equipe, aoMudar, status }) {
  const meu = K.podeAnexarAgora(tipo.codigo, status, { equipe });
  const entrada = h('input', { type: 'file', accept: ACEITA, style: { display: 'none' }, 'aria-label': `Anexar ${tipo.nome}` });
  const botaoAnexar = meu ? h('button', { type: 'button', class: `btn ${atual ? 'btn-contorno' : 'btn-primario'} btn-pequeno`, 'data-tipo': tipo.codigo, onclick: () => entrada.click() }, atual ? 'Substituir' : 'Anexar') : null;
  entrada.onchange = async () => {
    const arq = entrada.files[0]; if (!arq) return;
    if (botaoAnexar) { botaoAnexar.disabled = true; botaoAnexar.textContent = 'Enviando…'; }
    try { await api.enviarContratoArquivo(atual?.cliente_id || tipo.cliente_id, tipo.codigo, arq); toast(`${tipo.nome}: enviado.`); aoMudar(); }
    catch (e) { toast(e.message); if (botaoAnexar) { botaoAnexar.disabled = false; botaoAnexar.textContent = atual ? 'Substituir' : 'Anexar'; } }
  };
  return h('div', { class: `contrato-linha${atual ? ' ok' : ''}`, 'data-tipo': tipo.codigo },
    h('span', { class: 'contrato-ico', 'aria-hidden': 'true' }, icone(atual ? 'check' : 'clipe', { tam: 16, traco: 2.4, cor: '#fff' })),
    h('div', { class: 'contrato-txt' },
      h('div', { class: 'contrato-nome' }, h('b', null, tipo.nome), h('span', { class: `contrato-quem ${tipo.quem}` }, tipo.quem === 'cca' ? 'CCA anexa' : 'Corretor anexa')),
      tipo.dica ? h('div', { class: 'sub' }, tipo.dica) : null,
      atual ? h('div', { class: 'sub contrato-arq' }, `${atual.nome_original} · ${dataCurta(atual.enviado_em)}${atual.enviado_por_nome ? ` · ${R.primeiroNome(atual.enviado_por_nome)}` : ''}`) : null),
    h('div', { class: 'contrato-acoes' },
      atual ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrirArquivo(atual, false) }, 'Ver') : null,
      atual ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrirArquivo(atual, true) }, 'Baixar') : null,
      botaoAnexar, entrada));
}

// Bloco do cliente. equipe = true no painel da CCA; false para corretor e imobiliária.
export function blocoContrato({ cliente, equipe, aoMudar }) {
  if (!K.mostraContrato(cliente.status, equipe)) return null;
  const caixa = h('div', { class: 'bloco-secao contrato-bloco', id: 'secao-contrato' }, h('div', { class: 'sub' }, 'Carregando o contrato…'));
  const desenhar = (arquivos) => {
    const atuais = K.arquivosAtuais(arquivos);
    const passo = K.passoContrato(cliente.status, atuais);
    const i = K.idx(cliente.status);
    limpar(caixa);
    caixa.appendChild(secaoTitulo('Contrato', passo?.rotulo || '', { pequeno: true, nivel: 'h3', icone: 'clipe' }));
    if (passo?.detalhe) caixa.appendChild(h('div', { class: 'ajuda' }, passo.detalhe));
    if (passo?.vez) caixa.appendChild(h('div', { class: `contrato-vez ${(passo.vez === 'cca') === !!equipe ? 'sua' : ''}` }, (passo.vez === 'cca') === !!equipe ? 'Sua vez' : (passo.vez === 'cca' ? 'Vez da CCA' : 'Vez do corretor')));
    if (cliente.status === 'credito_liberado') caixa.appendChild(h('div', { class: 'contrato-final' }, 'Processo finalizado: crédito liberado ao vendedor. Todos os documentos abaixo continuam disponíveis para baixar e imprimir.'));
    for (const g of K.GRUPOS_CONTRATO) {
      const tipos = K.tiposDoGrupo(g.codigo);
      if (g.codigo === 'registro' && i < K.idx('contrato_assinado')) continue;
      caixa.appendChild(h('div', { class: 'contrato-grupo' },
        h('div', { class: 'contrato-grupo-titulo' }, g.titulo),
        tipos.filter((t) => equipe || atuais.has(t.codigo) || t.quem === 'corretor' || !K.TIPOS_CAIXA.includes(t.codigo)).map((t) => linhaArquivo({ ...t, cliente_id: cliente.id }, atuais.get(t.codigo), { equipe, aoMudar, status: cliente.status }))));
    }
    if (equipe && cliente.status === 'conformidade_final') {
      caixa.appendChild(h('div', { class: 'contrato-liberar' },
        h('div', { class: 'ajuda' }, 'Lance a documentação no SIOPI. Estando conforme, libere o crédito na conta do vendedor e finalize o processo.'),
        h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'creditoLiberado', onclick: async () => {
          if (!(await perguntarSimNao('Liberar o crédito?', `O processo de ${cliente.nome} será finalizado e o corretor será avisado. Confirma?`))) return;
          try { await api.mudarStatus(cliente.id, 'credito_liberado', K.msgCreditoLiberado(cliente.nome)); toast('Crédito liberado. Processo finalizado e corretor avisado.'); aoMudar(); } catch (e) { toast(e.message); }
        } }, 'Conformidade OK: crédito liberado')));
    }
  };
  api.listarContratoArquivos(cliente.id).then(desenhar).catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

// Página "Contratos" do painel: fila de trabalho da CCA
const FILTROS = [['cca', 'Vez da CCA'], ['corretor', 'Aguardando o corretor'], ['finalizados', 'Finalizados'], ['todos', 'Todos']];
let filtroAtual = 'cca';
export async function secaoContratos() {
  const [clientes, arquivos] = await Promise.all([api.listarClientes(), api.listarContratos()]);
  const porCliente = new Map();
  for (const a of arquivos) { if (!porCliente.has(a.cliente_id)) porCliente.set(a.cliente_id, new Set()); porCliente.get(a.cliente_id).add(a.tipo); }
  const linhas = clientes.filter((c) => !c.rascunho && K.mostraContrato(c.status, true))
    .map((c) => ({ c, passo: K.passoContrato(c.status, porCliente.get(c.id) || []), n: (porCliente.get(c.id) || new Set()).size }))
    .sort((x, y) => String(y.c.atualizado_em || '').localeCompare(String(x.c.atualizado_em || '')));
  const seleciona = {
    cca: (l) => l.passo?.vez === 'cca', corretor: (l) => l.passo?.vez === 'corretor', finalizados: (l) => l.c.status === 'credito_liberado', todos: () => true };
  const raiz = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const desenhar = () => {
    limpar(raiz);
    raiz.appendChild(h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Filtrar contratos' },
      FILTROS.map(([cod, nome]) => h('button', { type: 'button', class: `pilula${filtroAtual === cod ? ' ativa' : ''}`, 'aria-pressed': String(filtroAtual === cod), onclick: () => { filtroAtual = cod; desenhar(); } },
        `${nome} · ${linhas.filter(seleciona[cod]).length}`))));
    const lista = linhas.filter(seleciona[filtroAtual]);
    raiz.appendChild(h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela', style: { cursor: 'default' } },
      h('thead', null, h('tr', null, ['Cliente', 'Corretor / imobiliária', 'Etapa', 'O que falta', 'Arquivos'].map((t) => h('th', null, t)))),
      h('tbody', null, lista.length ? lista.map(({ c, passo, n }) => h('tr', { style: { cursor: 'pointer' }, onclick: () => { location.hash = `#/painel/clientes/${c.id}`; } },
        h('td', null, h('b', null, c.nome)),
        h('td', null, `${c.corretor_nome || ''}${c.imobiliaria_nome ? ` · ${c.imobiliaria_nome}` : ''}`),
        h('td', null, chipStatus(c.status)),
        h('td', null, h('div', null, passo?.rotulo || '—'), passo?.vez ? h('div', { class: 'sub' }, passo.vez === 'cca' ? 'Vez da CCA' : 'Vez do corretor') : null),
        h('td', null, `${n} de ${K.TIPOS_CONTRATO.length}`)))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { textAlign: 'center', padding: '30px' } }, 'Nenhum contrato nesta fila.'))))));
  };
  desenhar();
  return [cabecalho('Contratos', 'Minuta, assinaturas, registro em cartório e liberação do crédito. Toque no cliente para anexar os arquivos.'), raiz];
}
