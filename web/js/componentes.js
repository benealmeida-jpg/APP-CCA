// Peças de tela reaproveitadas.
import { h, icone, toast, limpar, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';

export function marcaRegra(regra) {
  if (!regra) return null;
  return h('span', { class: regra === '**' ? 'marca marca-forte' : 'marca', title: regra === '**' ? 'Sem ele o processo não vai para análise' : 'Pode anexar depois' }, ` ${regra}`);
}

export function chipSituacao(situacao) {
  return h('span', { class: `chip chip-${situacao}` }, R.SITUACAO_NOME[situacao] || situacao);
}

export function aviso(tipo, ...conteudo) {
  return h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'laranja' ? 'alert' : null },
    icone(tipo === 'laranja' ? 'alerta' : 'info', { cor: tipo === 'laranja' ? '#8A4E12' : '#2C4B5D' }),
    h('span', null, ...conteudo));
}

export function legendaAsteriscos() {
  return h('div', { class: 'legenda' },
    h('span', null, h('b', null, '*'), ' Pode enviar o cadastro sem ele e anexar depois.'),
    h('span', null, h('b', { class: 'forte' }, '**'), ' Pode enviar, mas sem ele o processo não vai para análise.'));
}

export function etapas(atual, comVendedor = true) {
  // [número da etapa, nome curto]; a tela Vendedor some quando a operação não tem vendedor
  const todas = [[1, 'Comprador'], [2, 'Renda'], [3, 'Operação'], [4, 'Imóvel'], [5, 'Vendedor'], [6, 'Docs'], [7, 'Revisão']]
    .filter(([n]) => comVendedor || n !== 5);
  return [
    h('div', { class: 'etapas', 'aria-hidden': 'true' }, todas.map(([n]) => h('span', { class: n <= atual ? 'feita' : '' }))),
    h('div', { class: 'etapas-nomes' }, todas.map(([n, nome]) => h('span', { class: n === atual ? 'atual' : '' }, nome))),
  ];
}

export function botaoOpcao(texto, selecionado, aoClicar, classe = 'opcao') {
  return h('button', { type: 'button', class: classe, 'aria-pressed': selecionado ? 'true' : 'false', onclick: aoClicar }, texto);
}

// Abre o documento (visualizar) ou baixa
export async function abrirDoc(doc, baixar = false) {
  const janela = baixar ? null : window.open('', '_blank');
  try {
    const url = await api.abrirDocumento(doc, { baixar });
    if (baixar) {
      const a = h('a', { href: url, download: doc.nome_original || 'documento' });
      document.body.appendChild(a); a.click(); a.remove();
    } else if (janela) janela.location = url;
    else location.href = url;
  } catch (e) {
    janela?.close();
    toast(e.message);
  }
}

export function escolherArquivo() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*,application/pdf', style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

const LIMITE_MB = 15;

// Lista de documentos com anexar / ver / baixar / substituir
// Tela de documentos em páginas: Compradores, Vendedor, Imóvel, Simulação e outros
let abaDocs = 'compradores';
export function paginasDocumentos({ clienteId, vendedorId, necessarios, aoMudar, avisoVendedor }) {
  const secoes = R.SECOES_DOCS.filter(([cod]) => cod === 'vendedor' ? (necessarios.some((n) => n.secao === 'vendedor') || avisoVendedor) : necessarios.some((n) => n.secao === cod));
  if (!secoes.some(([cod]) => cod === abaDocs)) abaDocs = secoes[0]?.[0] || 'compradores';
  const abas = h('div', { class: 'pilulas abas-docs', role: 'tablist', 'aria-label': 'Páginas de documentos' });
  const corpo = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const desenhar = () => {
    limpar(abas); limpar(corpo);
    for (const [cod, nome] of secoes) {
      const itens = necessarios.filter((n) => n.secao === cod && !n.opcional);
      const falta = itens.filter((n) => ['pendente', 'recusado'].includes(n.situacao)).length;
      const b = botaoOpcao(falta ? `${nome} · ${falta}` : `${nome} ✓`, abaDocs === cod, () => { abaDocs = cod; desenhar(); }, 'pilula');
      b.setAttribute('role', 'tab');
      abas.appendChild(b);
    }
    const itens = necessarios.filter((n) => n.secao === abaDocs);
    if (abaDocs === 'vendedor' && avisoVendedor) corpo.appendChild(avisoVendedor);
    adicionar(corpo, ...listaDocumentos({ clienteId, vendedorId, necessarios: itens, aoMudar }));
  };
  desenhar();
  return [abas, corpo];
}

export function listaDocumentos({ clienteId, vendedorId = null, necessarios, aoMudar }) {
  const grupos = R.agruparPorGrupo(necessarios);
  return grupos.map((g) => h('section', null,
    h('h2', { class: 'grupo-titulo' }, g.titulo),
    h('div', { class: 'cartao-lista' }, g.itens.map((n) => {
      const d = n.documento;
      const enviado = n.situacao !== 'pendente';
      const recusado = n.situacao === 'recusado';
      const urgente = recusado || (!enviado && n.regra === '**');
      let detalhe = '';
      if (recusado) detalhe = [d.motivo_recusa, d.observacao_recusa].filter(Boolean).join(': ');
      else if (enviado) detalhe = d.nome_original || (n.do_vendedor ? 'Já está com a CCA' : '');
      else if (n.opcional) detalhe = 'Opcional: anexe o que ajudar na análise';
      else detalhe = n.regra === '**' ? 'Obrigatório para análise' : n.regra === '*' ? 'Pode anexar depois' : '';
      const podeAbrir = enviado && !(n.do_vendedor && !d.arquivo_path);

      const enviar = async (ev) => {
        const botao = ev.currentTarget;
        const arquivo = await escolherArquivo();
        if (!arquivo) return;
        if (arquivo.size > LIMITE_MB * 1024 * 1024) return toast(`Arquivo maior que ${LIMITE_MB} MB. Tente uma foto menor ou um PDF.`);
        botao.disabled = true; botao.textContent = 'Enviando…';
        try {
          if (n.do_vendedor) await api.enviarDocumentoVendedor(clienteId, vendedorId, n.tipo_codigo, arquivo);
          else await api.enviarDocumento(clienteId, n.tipo_codigo, arquivo, n.participante_id ?? null, n.dependente_ordem ?? null);
          toast(enviado ? 'Documento substituído. A versão anterior ficou no histórico.' : 'Documento enviado');
          aoMudar?.();
        } catch (e) {
          toast(e.message); botao.disabled = false; botao.textContent = enviado ? 'Substituir' : 'Anexar';
        }
      };

      return h('div', { class: `doc${recusado ? ' recusado' : ''}` },
        h('div', null,
          h('div', { class: 'doc-nome' }, n.nome, marcaRegra(n.regra)),
          h('div', { class: 'doc-linha' }, n.opcional ? null : chipSituacao(n.situacao),
            detalhe ? h('span', { class: urgente ? 'forte' : '' }, detalhe) : null,
            d && (d.versao_pessoa ?? d.versao) > 1 ? h('span', null, `· versão ${d.versao_pessoa ?? d.versao}`) : null)),
        h('div', { class: 'doc-acoes' },
          podeAbrir ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${n.nome}`, onclick: () => abrirDoc(d) }, icone('olho')) : null,
          podeAbrir ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${n.nome}`, onclick: () => abrirDoc(d, true) }, icone('baixar')) : null,
          n.multiplo && enviado ? null : h('button', { type: 'button', class: `btn btn-pequeno empurra ${urgente ? 'btn-primario' : 'btn-contorno'}`, onclick: enviar },
            enviado ? 'Substituir' : [icone('clipe', { tam: 16 }), 'Anexar'])));
    }))));
}

// Quem/onde está cada documento que falta: Compradores (por pessoa), Vendedor, Imóvel, Outros
export function grupoPendencia(n) {
  if (n.secao === 'vendedor') return 'Vendedor';
  if (n.secao === 'imovel') return 'Imóvel';
  if (n.secao === 'outros') return 'Simulação e outros';
  if (n.dependente_ordem) return `Fator social · ${n.pessoa_nome}`;
  return n.pessoa_nome ? `${n.pessoa_nome} · ${R.PAPEL_NOME[n.pessoa_papel] || 'Comprador'}` : 'Compradores';
}

export function listaPendencias(necessarios, { aberta = false } = {}) {
  const faltando = necessarios.filter((n) => !n.opcional && ['pendente', 'recusado'].includes(n.situacao));
  if (!faltando.length) return null;
  const grupos = [];
  for (const n of faltando) {
    const t = grupoPendencia(n);
    let g = grupos.find((x) => x.titulo === t);
    if (!g) grupos.push((g = { titulo: t, itens: [] }));
    g.itens.push(n);
  }
  return h('details', { class: 'pendencias', open: aberta },
    h('summary', null, `Ver quais documentos faltam (${faltando.length})`),
    grupos.map((g) => h('div', { class: 'pendencias-grupo' },
      h('div', { class: 'pendencias-titulo' }, `${g.titulo} · ${g.itens.length}`),
      h('ul', null, g.itens.map((n) => h('li', null,
        h('span', null, n.nome, n.regra === '**' ? h('b', { class: 'forte' }, ' **') : null),
        n.situacao === 'recusado' ? h('span', { class: 'chip chip-recusado' }, 'Recusado') : null))))));
}

export function resumoPorSecao(necessarios) {
  const faltando = necessarios.filter((n) => !n.opcional && ['pendente', 'recusado'].includes(n.situacao));
  return R.SECOES_DOCS.map(([cod, nome]) => [nome, faltando.filter((n) => n.secao === cod).length]).filter(([, q]) => q)
    .map(([nome, q]) => `${nome}: ${q}`).join(' · ');
}

export function avisoDocumentos(necessarios) {
  const r = R.resumoDocumentos(necessarios);
  if (!r.pendente && !r.recusado) return null;
  const partes = [];
  if (r.recusado) partes.push(`${r.recusado} documento${r.recusado > 1 ? 's' : ''} recusado${r.recusado > 1 ? 's' : ''}`);
  if (r.pendente) partes.push(`${r.pendente} pendente${r.pendente > 1 ? 's' : ''}`);
  const faltaForte = r.faltando_obrigatorio.map((n) => n.rotulo || n.nome);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    aviso('laranja',
      h('strong', null, `${partes.join(' e ')}.`), ' ',
      resumoPorSecao(necessarios) ? `${resumoPorSecao(necessarios)}. ` : '',
      r.recusado ? 'Substitua o recusado e anexe o que falta. ' : 'Você pode enviar assim e anexar depois. ',
      faltaForte.length ? `Sem ${faltaForte.join(', ')} (**), o processo não vai para análise.` : ''),
    listaPendencias(necessarios));
}

export function barraProgresso(necessarios) {
  const r = R.resumoDocumentos(necessarios);
  const pct = r.total ? Math.round((r.enviados / r.total) * 100) : 0;
  return [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600' } },
      h('span', null, `${r.enviados} de ${r.total} enviados`),
      (r.pendente || r.recusado) ? h('span', { style: { color: '#8A4E12' } },
        [r.recusado ? `${r.recusado} recusado` : null, r.pendente ? `${r.pendente} pendente${r.pendente > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')) : null),
    h('div', { class: 'barra', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { style: { width: `${pct}%` } })),
  ];
}

export function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Janela de pergunta Sim/Não. Devolve true, false ou null (se fechar sem responder).
export function perguntarSimNao(titulo, texto) {
  return new Promise((resolve) => {
    const fechar = (v) => { fundo.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') fechar(null); };
    const sim = h('button', { type: 'button', class: 'btn btn-primario cheio', onclick: () => fechar(true) }, 'Sim');
    const nao = h('button', { type: 'button', class: 'btn btn-secundario cheio', onclick: () => fechar(false) }, 'Não');
    const fundo = h('div', { class: 'janela-fundo', onclick: (e) => { if (e.target === fundo) fechar(null); } },
      h('div', { class: 'janela', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'janela-titulo' },
        h('h2', { id: 'janela-titulo', style: { fontSize: '19px', fontWeight: '800' } }, titulo),
        texto ? h('p', { style: { margin: '0', fontSize: '15px', lineHeight: '22px', color: '#5A646B' } }, texto) : null,
        h('div', { class: 'linha-botoes' }, nao, sim)));
    document.body.appendChild(fundo);
    document.addEventListener('keydown', esc);
    sim.focus();
  });
}

// ---------- Notificações (push) ----------
function chaveVapid(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const appInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export function notificacoesAtivas() {
  try { return typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('appcca-push') === 'sim'; } catch { return false; }
}
export async function ativarNotificacoes(vapidPublica) {
  if (api.demo) { await api.inscreverPush(null); try { localStorage.setItem('appcca-push', 'sim'); } catch { /* ok */ } return; }
  if (ehIphone() && !appInstalado()) throw new Error('No iPhone, primeiro adicione o app à tela de início (botão Compartilhar → "Adicionar à Tela de Início") e abra por lá.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') throw new Error('Este navegador não aceita notificações.');
  if (!vapidPublica) throw new Error('Notificações ainda não configuradas na CCA.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações do app nas configurações do celular.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(vapidPublica) });
  await api.inscreverPush(sub);
  try { localStorage.setItem('appcca-push', 'sim'); } catch { /* ok */ }
}

// Faixa para o corretor ligar os avisos neste celular (só quando o canal é push)
export function faixaNotificacoes(config) {
  if (config?.parametros?.canal_avisos !== 'push' || notificacoesAtivas()) return null;
  const caixa = h('div', { class: 'aviso aviso-azul', style: { flexDirection: 'column', gap: '10px', alignItems: 'stretch' } });
  const botao = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Ativar avisos neste celular');
  botao.onclick = async () => {
    botao.disabled = true;
    try { await ativarNotificacoes(config.parametros.vapid_publica); limpar(caixa); caixa.appendChild(h('span', null, h('strong', null, 'Avisos ativados. '), 'Você vai receber aqui as mudanças de status e os documentos recusados.')); }
    catch (e) { toast(e.message); botao.disabled = false; }
  };
  adicionar(caixa, h('span', null, h('strong', null, 'Receba os avisos da CCA. '), 'Mudança de status e documento recusado chegam como notificação no celular, sem custo.'),
    ehIphone() && !appInstalado() ? h('span', { class: 'ajuda' }, 'No iPhone: toque em Compartilhar → "Adicionar à Tela de Início" e abra o app por lá antes de ativar.') : null,
    h('div', null, botao));
  return caixa;
}
