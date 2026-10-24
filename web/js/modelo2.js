// MODELO 2: estrutura por perfil (é o app oficial; ?demo2 mostra com dados de exemplo e ?demo abre o modelo antigo).
// Imobiliária: CEO (acima de todos) · Gestor (documentação e intermediação) · Corretor. CCA: nível 1 (CEO da CCA), 2 e 3.
import { h, limpar, icone, toast } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho, secaoTitulo, aviso, listaPendencias, blocoConversa, chipStatus, mascaraMoeda, abrirJanela, abrirGuiaGovbr } from './componentes.js';
import { fluxograma } from './fluxo.js';
import * as DM from './damp-dados.js';
import { MO_OFICIAIS } from './mo-oficiais.js';
import { preencherPdf } from './mo-pdf.js';
import { lerAssinaturasPdf, conferirAssinantes } from './assinatura-pdf.js';

// ---------- perfis ----------
export const ehCliente = (p) => p?.papel === 'cliente';
export const funcaoImob = (p) => (p?.papel === 'gestor_imobiliaria' ? (p.funcao || 'ceo') : null);
export const ehCeo = (p) => funcaoImob(p) === 'ceo';
export const ehGestorImob = (p) => funcaoImob(p) === 'gestor';
export const ehEquipeCca = (p) => ['equipe_cca', 'admin'].includes(p?.papel);
export const nivelCca = (p) => (ehEquipeCca(p) ? (p.nivel || (p.papel === 'admin' ? 2 : 3)) : null);
export const ehNivel1 = (p) => nivelCca(p) === 1;
export function nomePerfil(p) {
  if (ehCliente(p)) return 'Cliente';
  if (ehCeo(p)) return 'CEO da imobiliária';
  if (ehGestorImob(p)) return 'Gestor da imobiliária';
  if (p?.papel === 'corretor') return p.imobiliaria_id ? 'Corretor' : 'Corretor independente';
  if (ehEquipeCca(p)) return nivelCca(p) === 1 ? 'Nível 1 · CEO da CCA' : `Nível ${nivelCca(p)} · CCA`;
  return '';
}
// Quem age por este perfil no fluxo: o gestor responde pela imobiliária quando existe
export const quemSou = (p) => (ehEquipeCca(p) ? 'cca' : ehGestorImob(p) || ehCeo(p) ? 'gestor' : ehCliente(p) ? 'cliente' : 'corretor');

const quando = (iso) => {
  const d = new Date(iso); const hoje = new Date(); const ontem = new Date(Date.now() - 864e5);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
};
const reais = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

// ---------- CCA: 5 grupos no menu; dentro de cada grupo, abas ----------
export const GRUPOS_EQUIPE = [
  ['inicio', 'Início', 'painel', ['inicio']],
  ['processos', 'Processos', 'pessoas', ['clientes', 'docs', 'verificacoes', 'agenda', 'contratos', 'engenharia']],
  ['parceiros', 'Parceiros', 'predio', ['imobiliarias', 'corretores', 'vendedores', 'imoveis', 'consumidores', 'convites', 'vercomo']],
  ['resultados', 'Resultados', 'grafico', ['relatorios', 'campanhas']],
  ['financeiro', 'Financeiro', 'cifrao', ['faturamento', 'lancamentos', 'fechamento']],
  ['admin', 'Administração', 'engrenagem', ['mensagens', 'acessos', 'config', 'damp']],
];
const grupoDe = (secao) => GRUPOS_EQUIPE.find(([, , , s]) => s.includes(secao))?.[0] || 'inicio';
// menu = a lista [código, nome, ícone, quem vê] do painel
export function itensGruposEquipe(perfil, secao, numDocs, menu) {
  const pode = (cod) => menu.some(([c, , , ve]) => c === cod && ve(perfil));
  const ativo = grupoDe(secao);
  return GRUPOS_EQUIPE.map(([cod, nome, ic, secoes]) => {
    const primeira = secoes.find(pode);
    if (!primeira) return null;
    return { href: `#/painel/${primeira}`, nome, icone: ic, ativo: cod === ativo, num: cod === 'processos' ? numDocs : 0 };
  }).filter(Boolean);
}
export function abasEquipe(perfil, secao, numDocs, menu) {
  const grupo = GRUPOS_EQUIPE.find(([cod]) => cod === grupoDe(secao));
  const abas = grupo[3].map((cod) => menu.find(([c, , , ve]) => c === cod && ve(perfil))).filter(Boolean);
  if (abas.length < 2) return null;
  return h('div', { class: 'm2-sub' },
    h('span', { class: 'm2-sub-grupo', 'aria-hidden': 'true' }, icone(grupo[2], { tam: 16, traco: 2.2, cor: '#FFFFFF' }), grupo[1]),
    h('nav', { class: 'abas-grupo', 'aria-label': `Telas de ${grupo[1]}` }, abas.map(([cod, nome]) =>
      h('a', { href: `#/painel/${cod}`, class: cod === secao ? 'ativa' : '', 'aria-current': cod === secao ? 'page' : null }, nome,
        cod === 'docs' && numDocs ? h('span', { class: 'num' }, numDocs) : null))));
}

// ---------- portal: menus por perfil ----------
export function itensPortal(perfil, ativo) {
  if (ehCliente(perfil)) return [{ href: '#/meu', nome: 'Meu financiamento', icone: 'casa', ativo: true }];
  const i = (href, nome, icone, chave) => ({ href, nome, icone, ativo: ativo === chave });
  if (ehCeo(perfil)) return [i('#/inicio', 'Início', 'painel', 'inicio'), i('#/gestao', 'Gestão', 'grafico', 'gestao'), i('#/comissoes', 'Comissões', 'cifrao', 'comissoes'),
    i('#/clientes', 'Clientes', 'pessoas', 'clientes'), { ...i('#/mais', 'Mais', 'menu', 'mais'), ativo: ['mais', 'engenharia', 'avisos', 'novo'].includes(ativo) }];
  if (ehGestorImob(perfil)) return [i('#/inicio', 'Início', 'painel', 'inicio'), i('#/clientes', 'Clientes', 'pessoas', 'clientes'), i('#/novo', 'Novo cliente', 'mais', 'novo'),
    i('#/avisos', 'Avisos', 'sino', 'avisos'), { ...i('#/mais', 'Mais', 'menu', 'mais'), ativo: ['mais', 'engenharia'].includes(ativo) }];
  return [i('#/inicio', 'Início', 'painel', 'inicio'), i('#/clientes', 'Meus clientes', 'pessoas', 'clientes'), i('#/novo', 'Novo cliente', 'mais', 'novo'),
    { ...i('#/mais', 'Mais', 'menu', 'mais'), ativo: ['mais', 'engenharia', 'avisos'].includes(ativo) }];
}

// ---------- perfil secundário (CCA nível 1 entrou como alguém da imobiliária) ----------
export function faixaVerComo(perfil, aoVoltar) {
  if (!perfil?.ver_como) return null;
  return h('div', { class: 'faixa-vercomo', role: 'status' },
    h('span', null, icone('olho', { tam: 16, traco: 2.2, cor: '#FFFFFF' }), ' Perfil secundário: você está como ', h('b', null, perfil.nome), ` (${nomePerfil(perfil).replace(' da imobiliária', '')}${perfil.ver_como.imobiliaria_nome ? ` · ${perfil.ver_como.imobiliaria_nome}` : ''}). O que fizer aqui fica registrado como feito pela CCA.`),
    h('button', { type: 'button', class: 'btn btn-pequeno faixa-vercomo-btn', id: 'voltarPrincipal', onclick: async () => { await api.voltarPerfilPrincipal(); location.hash = '#/painel/vercomo'; location.reload(); } }, 'Voltar ao perfil principal'));
}
export async function secaoVerComo() {
  const imobs = await api.perfisDasImobiliarias();
  const rot = { ceo: 'CEO', gestor: 'Gestor', corretor: 'Corretor' };
  const entrar = async (u, botao) => {
    botao.disabled = true;
    try { await api.entrarComo(u.id); location.hash = '#/inicio'; location.reload(); } catch (e) { toast(e.message); botao.disabled = false; }
  };
  return [
    cabecalho('Perfil secundário', 'Escolha a imobiliária e entre como o CEO, o gestor ou um corretor. Você vê e age exatamente como a pessoa; tudo fica registrado como feito pela CCA.'),
    aviso('azul', 'Só o nível 1 (CEO da CCA) tem esta tela. Os níveis 2 e 3 não entram como outras pessoas nem leem as mensagens internas das imobiliárias.'),
    h('div', { class: 'vercomo-grade' }, imobs.map((im) => h('section', { class: 'cartao vercomo-imob' },
      secaoTitulo(im.nome, `${im.pessoas.length} ${im.pessoas.length === 1 ? 'pessoa' : 'pessoas'}${im.mural ? ` · ${im.mural} ${im.mural === 1 ? 'aviso' : 'avisos'} no mural` : ''}`, { pequeno: true, nivel: 'h3', icone: 'predio' }),
      h('ul', { class: 'vercomo-lista' }, im.pessoas.map((u) => {
        const b = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'data-entrar': u.id }, 'Entrar como');
        b.onclick = () => entrar(u, b);
        return h('li', null, h('span', null, h('b', null, u.nome), h('small', { class: `vercomo-papel p-${u.funcao}` }, rot[u.funcao])), b);
      }))))),
  ];
}

// ---------- conversas e avisos internos ----------
// Bloco de conversa genérico: carregar() → mensagens; enviar(texto) opcional (sem ele, só leitura)
function blocoChat({ carregar, enviar = null, vazio, placeholder = 'Escreva…', id }) {
  const lista = h('div', { class: 'conversa-lista', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'ajuda' }, 'Carregando…'));
  const desenhar = async () => {
    try {
      const msgs = await carregar();
      limpar(lista);
      if (!msgs.length) { lista.appendChild(h('div', { class: 'ajuda' }, vazio)); return; }
      msgs.forEach((m) => lista.appendChild(h('div', { class: `conversa-msg ${m.minha ? 'minha' : ''} ${m.da_equipe ? 'equipe' : 'corretor'}` },
        h('div', { class: 'conversa-autor' }, m.minha ? 'Você' : `${m.autor_nome}${m.autor_papel ? ` · ${m.autor_papel}` : m.da_equipe ? ' · CCA' : ''}`),
        h('div', { class: 'conversa-texto' }, m.texto), h('div', { class: 'conversa-hora' }, quando(m.criada_em)))));
      lista.scrollTop = lista.scrollHeight;
    } catch (e) { limpar(lista); lista.appendChild(h('div', { class: 'ajuda' }, e.message)); }
  };
  desenhar();
  if (!enviar) return h('div', { class: 'conversa conversa-bloco' }, lista, h('div', { class: 'conversa-leitura' }, icone('olho', { tam: 14, traco: 2.2 }), ' Somente leitura'));
  const campo = h('textarea', { id, class: 'entrada conversa-campo', rows: 2, maxlength: 2000, placeholder });
  const botao = h('button', { type: 'button', class: 'btn btn-primario conversa-enviar' }, 'Enviar');
  botao.onclick = async () => {
    const t = campo.value.trim(); if (!t) { campo.focus(); return; }
    botao.disabled = true;
    try { await enviar(t); campo.value = ''; await desenhar(); } catch (e) { toast(e.message); }
    botao.disabled = false;
  };
  return h('div', { class: 'conversa conversa-bloco' }, lista, h('div', { class: 'conversa-escrever' }, campo, botao));
}

// Conversa interna do cliente (corretor ↔ gestor/CEO). A CCA nível 1 lê.
export function blocoConversaInterna({ cliente, perfil, gestor }) {
  if (!cliente.imobiliaria_id || cliente.rascunho || ehCliente(perfil)) return null;
  const daImob = !ehEquipeCca(perfil);
  if (!daImob && !ehNivel1(perfil)) return null;
  return h('section', { class: 'cartao', id: 'conversa-interna' },
    secaoTitulo('Conversa interna da imobiliária', daImob ? `Entre o corretor e ${gestor ? `o gestor (${R.primeiroNome(gestor.nome)})` : 'o CEO'}. A CCA acompanha, mas não participa.` : 'Mensagens entre o corretor e o gestor desta imobiliária.', { pequeno: true, nivel: 'h3', icone: 'conversa' }),
    blocoChat({ carregar: () => api.listarConversaInterna(cliente.id), enviar: daImob ? (t) => api.enviarConversaInterna(cliente.id, t) : null, vazio: 'Nenhuma mensagem interna ainda.', placeholder: 'Escreva para a equipe da imobiliária…', id: 'interna-campo' }));
}
// Conversa com a CCA para o corretor quando a imobiliária tem gestor: só lê
export function blocoConversaCcaLeitura(clienteId, gestor) {
  return h('section', { class: 'cartao', id: 'conversa' },
    secaoTitulo('Conversa com a CCA', `Quem fala com a CCA é o gestor (${R.primeiroNome(gestor.nome)}). Você acompanha aqui e fala com ele na conversa interna.`, { pequeno: true }),
    blocoChat({ carregar: () => api.listarConversa(clienteId), vazio: 'Nenhuma mensagem com a CCA ainda.' }));
}

// Mural de avisos da imobiliária
export async function conteudoAvisos({ perfil }) {
  const podePublicar = perfil.papel === 'gestor_imobiliaria';
  const lista = h('div', { class: 'mural-lista' });
  const desenhar = async () => {
    const itens = await api.listarMural();
    limpar(lista);
    if (!itens.length) { lista.appendChild(h('div', { class: 'cartao ajuda' }, 'Nenhum aviso ainda.')); return; }
    itens.forEach((m) => lista.appendChild(h('article', { class: 'cartao mural-item' },
      h('div', { class: 'mural-topo' }, h('b', null, m.autor_nome), h('span', { class: 'vercomo-papel' }, m.autor_papel), h('span', { class: 'sub' }, quando(m.criada_em)),
        m.meu || ehCeo(perfil) ? h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await api.apagarMural(m.id); desenhar(); } catch (e) { toast(e.message); } } }, 'Apagar') : null),
      h('p', null, m.texto))));
  };
  await desenhar();
  let caixa = null;
  if (podePublicar) {
    const campo = h('textarea', { id: 'mural-campo', class: 'entrada', rows: 3, maxlength: 2000, placeholder: 'Escreva um aviso para toda a equipe da imobiliária…' });
    const botao = h('button', { type: 'button', class: 'btn btn-primario', id: 'publicarAviso' }, 'Publicar para a equipe');
    botao.onclick = async () => { botao.disabled = true; try { await api.publicarMural(campo.value); campo.value = ''; toast('Aviso publicado para a equipe.'); await desenhar(); } catch (e) { toast(e.message); } botao.disabled = false; };
    caixa = h('section', { class: 'cartao' }, secaoTitulo('Novo aviso', 'Todos da imobiliária veem: CEO, gestor e corretores.', { pequeno: true, nivel: 'h3', icone: 'sino' }), campo, botao);
  }
  return [cabecalho({ sobre: perfil.imobiliaria_nome || 'Imobiliária', titulo: 'Avisos da equipe', sub: 'Recados internos da imobiliária. A CCA não vê, exceto o CEO da CCA.' }), caixa, lista].filter(Boolean);
}
// Últimos avisos (bloco do Início)
export function blocoMuralInicio() {
  const caixa = h('section', { class: 'ini-cartao' }, h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Avisos da equipe'), h('p', null, 'Recados internos da imobiliária')),
    h('a', { href: '#/avisos', class: 'btn btn-contorno btn-pequeno' }, 'Ver todos')));
  const corpo = h('div', { class: 'mural-mini' }, h('div', { class: 'ajuda' }, 'Carregando…'));
  caixa.appendChild(corpo);
  api.listarMural().then((itens) => {
    limpar(corpo);
    if (!itens.length) { corpo.appendChild(h('div', { class: 'ajuda' }, 'Nenhum aviso ainda.')); return; }
    itens.slice(0, 3).forEach((m) => corpo.appendChild(h('div', { class: 'mural-mini-item' }, h('div', { class: 'mural-topo' }, h('b', null, m.autor_nome), h('span', { class: 'sub' }, `${m.autor_papel} · ${quando(m.criada_em)}`)), h('p', null, m.texto))));
  }).catch(() => { limpar(corpo); });
  return caixa;
}

// ---------- comissões (CEO da imobiliária) ----------
const estadoCom = { filtro: 'apagar' };
export async function conteudoComissoes({ perfil }) {
  const raiz = h('div', { class: 'gest-corpo' });
  const desenhar = async () => {
    const linhas = await api.listarComissoes();
    limpar(raiz);
    const apagar = linhas.filter((l) => !l.paga_em); const pagas = linhas.filter((l) => l.paga_em);
    const soma = (ls) => ls.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const semValor = apagar.filter((l) => !(l.valor > 0)).length;
    raiz.appendChild(h('div', { class: 'ini-kpis com-kpis' },
      h('div', { class: 'ini-kpi' }, h('span', { class: 'ini-kpi-nome' }, 'A pagar'), h('span', { class: 'ini-kpi-valor com-valor' }, reais(soma(apagar))), h('small', { class: 'gest-dica' }, `${apagar.length} ${apagar.length === 1 ? 'contrato' : 'contratos'}${semValor ? ` · ${semValor} sem valor` : ''}`)),
      h('div', { class: 'ini-kpi' }, h('span', { class: 'ini-kpi-nome' }, 'Pagas'), h('span', { class: 'ini-kpi-valor com-valor' }, reais(soma(pagas))), h('small', { class: 'gest-dica' }, `${pagas.length} ${pagas.length === 1 ? 'contrato' : 'contratos'}`)),
      h('div', { class: 'ini-kpi suave' }, h('span', { class: 'ini-kpi-nome' }, 'Contratos assinados'), h('span', { class: 'ini-kpi-valor' }, String(linhas.length)), h('small', { class: 'gest-dica' }, 'Do contrato assinado em diante'))));
    // por corretor
    const porCor = new Map();
    linhas.forEach((l) => { const x = porCor.get(l.corretor_id) || { nome: l.corretor_nome, apagar: 0, pagas: 0, n: 0 }; x.n++; if (l.paga_em) x.pagas += Number(l.valor) || 0; else x.apagar += Number(l.valor) || 0; porCor.set(l.corretor_id, x); });
    raiz.appendChild(h('section', { class: 'ini-cartao' }, h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Por corretor'), h('p', null, 'Quanto cada um tem a receber e quanto já recebeu'))),
      h('ul', { class: 'gest-parados' }, [...porCor.values()].sort((a, b) => b.apagar - a.apagar).map((x) => h('li', { class: 'gest-membro com-cor' },
        h('span', { class: 'gest-corretor-nome' }, h('b', null, x.nome), h('small', null, `${x.n} ${x.n === 1 ? 'contrato' : 'contratos'}`)),
        h('span', { class: 'gest-num' }, h('b', null, reais(x.apagar)), h('small', null, 'a pagar')), h('span', { class: 'gest-num' }, h('b', null, reais(x.pagas)), h('small', null, 'pagas')))))));
    // lista
    const filtros = [['apagar', `A pagar · ${apagar.length}`], ['pagas', `Pagas · ${pagas.length}`], ['todas', `Todas · ${linhas.length}`]];
    const vis = estadoCom.filtro === 'apagar' ? apagar : estadoCom.filtro === 'pagas' ? pagas : linhas;
    raiz.appendChild(h('section', { class: 'ini-cartao' },
      h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Contratos'), h('p', null, 'Informe o valor e marque como paga quando pagar o corretor')),
        h('div', { class: 'ini-pilulas', role: 'group', 'aria-label': 'Filtrar comissões' }, filtros.map(([v, n]) => h('button', { type: 'button', class: `ini-pilula${estadoCom.filtro === v ? ' ativa' : ''}`, 'aria-pressed': String(estadoCom.filtro === v), onclick: () => { estadoCom.filtro = v; desenhar(); } }, n)))),
      vis.length ? h('ul', { class: 'gest-parados com-lista' }, vis.map((l) => {
        const valor = h('input', { class: 'entrada com-input', inputmode: 'numeric', 'aria-label': `Comissão de ${l.cliente_nome}`, value: l.valor != null ? R.formatarMoeda(l.valor) : '', placeholder: 'R$ 0,00', disabled: !!l.paga_em, oninput: mascaraMoeda,
          onchange: async (e) => { const v = R.lerMoeda(e.target.value) ?? 0; try { await api.definirComissao(l.cliente_id, v); toast('Valor salvo.'); desenhar(); } catch (er) { toast(er.message); } } });
        const acao = h('button', { type: 'button', class: `btn btn-pequeno ${l.paga_em ? 'btn-contorno' : 'btn-primario'}`, 'data-comissao': l.cliente_id,
          onclick: async (e) => { e.currentTarget.disabled = true; try { await api.marcarComissao(l.cliente_id, !l.paga_em); toast(l.paga_em ? 'Comissão voltou para a pagar.' : 'Comissão marcada como paga.'); desenhar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; } } }, l.paga_em ? 'Desfazer' : 'Marcar como paga');
        return h('li', { class: 'gest-membro com-linha' },
          h('span', { class: 'gest-corretor-nome' }, h('b', null, l.cliente_nome), h('small', null, `${l.corretor_nome} · contrato assinado em ${new Date(l.assinado_em).toLocaleDateString('pt-BR')}`)),
          chipStatus(l.status), valor,
          l.paga_em ? h('span', { class: 'chip chip-aceito' }, `Paga em ${new Date(l.paga_em).toLocaleDateString('pt-BR')}`) : null, acao);
      })) : h('div', { class: 'ajuda' }, 'Nada aqui.')));
  };
  await desenhar();
  return [cabecalho({ sobre: perfil.imobiliaria_nome || 'Imobiliária', titulo: 'Comissões', sub: 'Comissão de cada contrato assinado: quanto é, quem recebe e se já foi paga.' }), raiz];
}

// ---------- acesso do cliente final (opcional) ----------
// Liga/desliga: o CEO para a imobiliária toda; o corretor independente para os clientes dele
export async function cartaoAcessoClientes(aoMudar) {
  const cfg = await api.configAcessoCliente();
  if (!cfg.pode) return null;
  const chave = h('button', { type: 'button', role: 'switch', 'aria-checked': String(cfg.ligado), class: `chave${cfg.ligado ? ' ligada' : ''}`, id: 'chaveAcessoCliente',
    'aria-label': 'Permitir que os clientes acompanhem pelo portal',
    onclick: async () => {
      chave.disabled = true;
      try { await api.definirAcessoCliente(!cfg.ligado); toast(!cfg.ligado ? 'Acesso dos clientes ligado.' : 'Acesso dos clientes desligado. Quem já tinha acesso não entra mais.'); aoMudar(); }
      catch (e) { toast(e.message); chave.disabled = false; }
    } }, h('span', { class: 'chave-bola' }));
  return h('section', { class: 'cartao acesso-clientes' },
    h('div', { class: 'acesso-clientes-linha' },
      h('div', null, h('h3', { class: 'fluxo-titulo' }, 'Acesso dos clientes ao portal'),
        h('p', { class: 'sub', style: { margin: '4px 0 0' } }, cfg.escopo === 'imobiliaria'
          ? 'Quando ligado, a imobiliária pode convidar cada cliente para acompanhar o próprio processo, enviar documentos e conversar.'
          : 'Quando ligado, você pode convidar cada cliente para acompanhar o próprio processo, enviar documentos e conversar.')),
      chave),
    h('div', { class: 'ajuda' }, cfg.ligado ? 'Ligado. O convite é feito no cartão de cada cliente.' : 'Desligado. Nenhum cliente entra no portal.'));
}

// Bloco no cartão do cliente: convidar, ver situação, tirar o acesso
export function blocoAcessoCliente({ cliente, perfil, aoMudar }) {
  if (cliente.rascunho || ehCliente(perfil) || perfil.consumidor) return null;
  const caixa = h('section', { class: 'cartao acesso-cliente', id: 'acesso-cliente' }, h('div', { class: 'sub' }, 'Carregando o acesso do cliente…'));
  api.acessoDoCliente(cliente.id).then((a) => {
    limpar(caixa);
    caixa.appendChild(secaoTitulo('Acesso do cliente', null, { pequeno: true, nivel: 'h3', icone: 'pessoa' }));
    if (a.situacao === 'desligado') {
      caixa.appendChild(h('div', { class: 'ajuda' }, a.pode_ligar === 'gestor'
        ? 'Desligado pela imobiliária. O CEO liga em Gestão, se quiser que os clientes acompanhem pelo portal.'
        : 'Desligado. Você liga em Mais, se quiser que os seus clientes acompanhem pelo portal.'));
      return;
    }
    if (a.situacao === 'ativo') {
      caixa.appendChild(h('div', { class: 'ajuda' }, `${R.primeiroNome(cliente.nome)} já acompanha pelo portal (${a.email}). Ele vê as etapas, envia documentos e conversa com a CCA.`));
      caixa.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.removerAcessoCliente(cliente.id); toast('Acesso do cliente retirado.'); aoMudar(); } catch (er) { toast(er.message); } } }, 'Tirar o acesso'));
      return;
    }
    const mostrarConvite = (link, expira) => {
      const texto = `${R.saudacao()}, ${R.primeiroNome(cliente.nome)}! Agora você pode acompanhar o seu financiamento pelo portal da Andrade Almeida CCA: ver cada etapa, enviar documentos e falar com a equipe.\nToque no link e crie a sua senha:\n${link}${expira ? `\n\nO convite vale até ${new Date(expira).toLocaleDateString('pt-BR')}.` : ''}`;
      const fone = R.soDigitos(R.celularInternacional(cliente.celular || '') || '');
      return h('div', { class: 'acesso-convite' },
        h('div', { class: 'gest-convite-texto' }, texto),
        h('div', { class: 'gest-acoes' },
          h('a', { class: 'btn btn-primario btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}?text=${encodeURIComponent(texto)}` }, 'Enviar pelo WhatsApp'),
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada.'); } catch { toast('Não consegui copiar.'); } } }, 'Copiar mensagem'),
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.removerAcessoCliente(cliente.id); toast('Convite cancelado.'); aoMudar(); } catch (er) { toast(er.message); } } }, 'Cancelar convite')));
    };
    if (a.situacao === 'convidado') {
      caixa.appendChild(h('div', { class: 'ajuda' }, `Convite enviado, aguardando o cliente criar a senha${a.expira_em ? ` (vale até ${new Date(a.expira_em).toLocaleDateString('pt-BR')})` : ''}.`));
      if (a.link) { caixa.appendChild(mostrarConvite(a.link, a.expira_em)); return; }
      // no app oficial o link só aparece na hora em que é criado: aqui dá para gerar um novo (o anterior deixa de valer)
      const novo = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'novoLinkCliente' }, 'Gerar novo link');
      novo.onclick = async () => { novo.disabled = true; try { const r = await api.darAcessoCliente(cliente.id); novo.replaceWith(mostrarConvite(r.link, r.expira_em)); } catch (e) { toast(e.message); novo.disabled = false; } };
      caixa.appendChild(h('div', { class: 'gest-acoes' }, novo,
        h('button', { type: 'button', class: 'btn-link', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.removerAcessoCliente(cliente.id); toast('Convite cancelado.'); aoMudar(); } catch (er) { toast(er.message); } } }, 'Cancelar convite')));
      return;
    }
    caixa.appendChild(h('div', { class: 'ajuda' }, 'Opcional. O cliente passa a ver as etapas, enviar documentos e conversar com a CCA.'));
    const botao = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'darAcessoCliente' }, 'Convidar o cliente');
    botao.onclick = async () => {
      botao.disabled = true;
      try { const r = await api.darAcessoCliente(cliente.id); botao.replaceWith(mostrarConvite(r.link, r.expira_em)); }
      catch (e) { toast(e.message); botao.disabled = false; }
    };
    caixa.appendChild(botao);
  }).catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

// ---------- tela "Mais" ----------
export async function conteudoMais({ perfil, recarregar }) {
  const cartao = (href, ic, titulo, texto) => h('a', { class: 'mais-cartao', href }, h('span', { class: 'mais-icone' }, icone(ic, { tam: 22, traco: 2 })), h('span', null, h('b', null, titulo), h('small', null, texto)));
  const acesso = perfil.papel === 'corretor' && !perfil.imobiliaria_id ? await cartaoAcessoClientes(recarregar) : null;
  const daImob = !!perfil.imobiliaria_id;
  return [
    cabecalho({ sobre: nomePerfil(perfil), titulo: 'Mais', sub: 'Ferramentas que você usa de vez em quando.' }),
    h('div', { class: 'mais-grade' },
      ehCeo(perfil) ? cartao('#/novo', 'mais', 'Novo cliente', 'Cadastrar um cliente e escolher o corretor responsável.') : null,
      daImob && !ehGestorImob(perfil) ? cartao('#/avisos', 'sino', 'Avisos da equipe', ehCeo(perfil) ? 'Publicar e ler os recados internos da imobiliária.' : 'Recados do gestor e do CEO para a equipe.') : null,
      cartao('#/engenharia', 'casa', 'Engenharia', 'Pedir e acompanhar a avaliação do imóvel pela Caixa.'),
      cartao('#/imoveis', 'predio', 'Imóveis', 'Documentos, engenharias e vendas de cada imóvel dos vendedores.'),
      cartao('#/desempenho', 'trofeu', 'Campanhas e desempenho', ehGestorImob(perfil) || ehCeo(perfil) ? 'Gráficos do mês, evolução de cada corretor e as campanhas da CCA.' : 'Seus gráficos do mês, sua posição e as campanhas da CCA.')),
    acesso,
  ].filter(Boolean);
}

// ---------- cliente final: Meu financiamento ----------
export async function conteudoMeuFinanciamento({ perfil }) {
  const dados = await api.obterCliente(perfil.cliente_id);
  const { cliente, necessarios, historico, corretor } = dados;
  const arquivos = await api.listarContratoArquivos(cliente.id).then((l) => l.filter((a) => !a.substituido).map((a) => a.tipo)).catch(() => []);
  // O cliente envia só os documentos dos compradores; vendedor e imóvel ficam com o corretor (mas a lista do que falta mostra tudo)
  const r = R.resumoDocumentos(necessarios.filter((n) => n.secao === 'compradores'));
  const falta = r.pendente + r.recusado;
  const faltaTudo = necessarios.filter((n) => !n.opcional && ['pendente', 'recusado'].includes(n.situacao)).length;
  const fone = R.soDigitos(corretor?.whatsapp || '');
  return [
    cabecalho({ sobre: 'Meu financiamento', titulo: `${R.saudacao()}, ${R.primeiroNome(perfil.nome)}`, sub: [cliente.programa, cliente.imovel && `Imóvel ${String(cliente.imovel).toLowerCase()}`].filter(Boolean).join(' · ') }, chipStatus(cliente.status)),
    fluxograma({ cliente, historico, arquivos, titulo: 'Seu processo, etapa por etapa', quemVe: 'cliente', temGestor: !!dados.gestor_imob }),
    h('div', { class: 'painel-colunas ficha-colunas' },
      h('div', { class: 'principal coluna-cartoes' },
        h('section', { class: 'cartao' }, secaoTitulo('Seus documentos', falta ? `Falta${falta > 1 ? 'm' : ''} ${falta} com você` : 'Os seus estão todos enviados', { pequeno: true, icone: 'doc' }),
          falta ? null : h('div', { class: 'ajuda' }, 'Nada pendente com você agora.'),
          faltaTudo ? listaPendencias(necessarios) : null,
          faltaTudo > falta ? h('div', { class: 'ajuda' }, 'Os do vendedor, do imóvel e a simulação ficam com o(a) seu(sua) corretor(a). Você só acompanha.') : null,
          h('a', { class: `btn ${falta ? 'btn-primario' : 'btn-contorno'}`, href: `#/cliente/${cliente.id}/documentos` }, falta ? 'Enviar documentos' : 'Ver meus documentos'))),
      h('aside', { class: 'lateral coluna-cartoes' },
        h('section', { class: 'cartao', id: 'conversa' }, secaoTitulo('Conversa com a CCA', 'Dúvidas sobre o seu processo. A equipe responde aqui.', { pequeno: true }), blocoConversa(cliente.id, { lado: 'portal', doCliente: true })),
        corretor ? h('section', { class: 'cartao' }, secaoTitulo('Seu corretor', null, { pequeno: true, icone: 'pessoa' }), h('div', null, h('b', null, corretor.nome)),
          fone ? h('a', { class: 'btn btn-contorno btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}` }, 'Falar pelo WhatsApp') : null) : null)),
  ];
}

// ---------- DAMP ----------
const ORDEM_STATUS = R.STATUS.map((x) => x.codigo);
const passouDe = (status, etapa) => ORDEM_STATUS.indexOf(status) >= ORDEM_STATUS.indexOf(etapa);
const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

const abrirUrl = async (pegar) => { const w = window.open('', '_blank'); try { const url = await pegar(); if (w) w.location = url; else location.href = url; } catch (e) { w?.close(); toast(e.message); } };
const nomeArquivoMo = (item, cliente) => `${item.modelo.codigo.replace(/\s+/g, '')}-${R.primeiroNome(item.pessoa_nome || cliente.nome)}-${R.soDigitos(cliente.cpf || '').slice(-4)}.pdf`;

function baixarBytes(bytes, nome) {
  const a = h('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), download: nome });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Janela "Conferir e baixar": os campos do modelo oficial já vêm do cadastro; quem baixa confere, ajusta e baixa o PDF
function janelaPreencher(item, kit) {
  const of = MO_OFICIAIS[item.modelo.oficial];
  const dados = DM.dadosMo({ cliente: kit.cliente, participantes: kit.participantes, pessoa: item.pessoa_ordem });
  const v = DM.valoresIniciais(of, dados, item.valores || {});
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', escTecla); };
  const escTecla = (e) => { if (e.key === 'Escape') fechar(); };
  const campos = of.campos.filter((c) => c.tipo !== 'fora').map((c) => {
    const id = `mo-campo-${c.n}`;
    if (c.tipo === 'marca') {
      return h('label', { class: 'mo-marca', for: id }, h('input', { id, type: 'checkbox', checked: !!v[c.n], onchange: (e) => { v[c.n] = e.target.checked ? 'X' : ''; } }), h('span', null, c.rotulo));
    }
    const ent = c.tipo === 'longo'
      ? h('textarea', { id, class: 'entrada', rows: 4, oninput: (e) => { v[c.n] = e.target.value; } }, v[c.n] || '')
      : h('input', { id, class: 'entrada', value: v[c.n] || '', autocomplete: 'off', oninput: (e) => { v[c.n] = e.target.value; } });
    return h('div', { class: 'campo' }, h('label', { for: id }, c.rotulo), ent);
  });
  const baixar = h('button', { type: 'button', class: 'btn btn-primario cheio', id: 'moBaixar' }, 'Baixar PDF preenchido');
  baixar.onclick = async () => {
    baixar.disabled = true;
    try {
      api.moSalvarValores(item.id, v).catch(() => {});
      const r = await fetch(of.arquivo);
      if (!r.ok) throw new Error('Não consegui abrir o modelo da Caixa. Verifique a internet.');
      baixarBytes(preencherPdf(new Uint8Array(await r.arrayBuffer()), of, v), nomeArquivoMo(item, kit.cliente));
      toast('PDF baixado. Confira, assine ou envie para assinatura no gov.br e anexe aqui o PDF assinado.');
      fechar();
    } catch (e) { toast(e.message); baixar.disabled = false; }
  };
  const fundo = h('div', { class: 'janela-fundo', onclick: (e) => { if (e.target === fundo) fechar(); } },
    h('div', { class: 'janela janela-larga', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mo-titulo' },
      h('h2', { id: 'mo-titulo', style: { fontSize: '19px', fontWeight: '800' } }, `${item.modelo.codigo}${item.pessoa_nome ? ` · ${item.pessoa_nome}` : ''}`),
      h('p', { class: 'sub', style: { margin: 0 } }, `${of.titulo}. Os dados já vieram do cadastro. Confira cada campo e marque as opções que o cliente escolheu.`),
      h('div', { class: 'mo-campos' }, ...campos),
      h('div', { class: 'linha-botoes' }, h('button', { type: 'button', class: 'btn btn-contorno cheio', onclick: fechar }, 'Cancelar'), baixar)));
  document.body.appendChild(fundo);
  document.addEventListener('keydown', escTecla);
  fundo.querySelector('input, textarea')?.focus();
}

// DAMP 29300: abre a página offline da própria Caixa, já com os dados do cadastro
async function abrirDampCaixa(item, kit) {
  const w = window.open('', '_blank');
  try {
    const r = await fetch('modelos/DAMP29300.html');
    if (!r.ok) throw new Error('Não consegui abrir a DAMP da Caixa. Verifique a internet.');
    const html = DM.htmlDampPreenchido(await r.text(), DM.dadosDamp({ cliente: kit.cliente, participantes: kit.participantes, pessoa: item.pessoa_ordem || 1 }));
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    if (w) w.location = url; else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { w?.close(); toast(e.message); }
}

const ROT_KIT = { sem_modelo: ['Nenhum', ''], para_assinar: ['Para assinar', 'chip-alerta'], assinada: ['Assinados', 'chip-em_conferencia'], lancada: ['Lançados na Caixa', 'chip-aceito'] };
const ROT_ITEM = { para_assinar: ['Para assinar', 'chip-alerta'], parcial: ['Faltam assinaturas', 'chip-alerta'], assinado: ['Assinado', 'chip-em_conferencia'], lancado: ['Lançado na Caixa', 'chip-aceito'], dispensado: ['Dispensado', ''] };

function linhaMo(item, kit, { equipe, aoMudar }) {
  const st = DM.situacaoItem(item);
  const [rot, cls] = ROT_ITEM[st];
  const of = item.modelo.oficial;
  const daCca = item.modelo.assina === 'cca';
  const acoes = h('div', { class: 'gest-acoes' });
  const botao = (texto, onclick, { primario = false, id } = {}) => h('button', { type: 'button', class: `btn btn-pequeno ${primario ? 'btn-primario' : 'btn-contorno'}`, ...(id ? { id } : {}), onclick }, texto);
  const executar = (fn, msg) => async (e) => { e.currentTarget.disabled = true; try { await fn(); if (msg) toast(msg); aoMudar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; } };
  if (st !== 'dispensado' && (equipe || !daCca)) {
    if (of && MO_OFICIAIS[of]) acoes.appendChild(botao('Conferir e baixar PDF', () => janelaPreencher(item, kit), { primario: st === 'para_assinar' && !equipe }));
    else if (of === 'DAMP29300') acoes.appendChild(botao('Abrir DAMP preenchida', () => abrirDampCaixa(item, kit), { primario: st === 'para_assinar' && !equipe }));
    else if (item.modelo.arquivo_path && api.baixarModeloDamp) acoes.appendChild(botao('Baixar modelo', () => abrirUrl(() => api.baixarModeloDamp(item.modelo))));
    if ((item.assinado?.path || item.parcial?.path) && api.moAbrirAssinado) acoes.appendChild(botao('Ver assinado', () => abrirUrl(() => api.moAbrirAssinado(item))));
    if (st !== 'lancado') {
      const entrada = h('input', { type: 'file', accept: '.pdf,application/pdf,image/*', style: { display: 'none' }, 'aria-label': `Anexar ${item.modelo.codigo} assinado` });
      entrada.onchange = async () => { const f = entrada.files[0]; entrada.value = ''; if (f) await anexarComConferencia(f, item, kit, { equipe, aoMudar }); };
      acoes.appendChild(botao(item.assinado ? 'Substituir assinado' : item.parcial ? 'Anexar com mais assinaturas' : 'Anexar assinado', () => entrada.click(), { primario: st === 'parcial' && !equipe }));
      acoes.appendChild(entrada);
    }
    if (equipe && st === 'assinado') acoes.appendChild(botao('Marcar lançado na Caixa', executar(() => api.moMarcarLancado(item.id, true), 'Marcado como lançado na Caixa.'), { primario: true }));
    if (equipe && st === 'lancado') acoes.appendChild(h('button', { type: 'button', class: 'btn-link', onclick: executar(() => api.moMarcarLancado(item.id, false)) }, 'Desfazer lançamento'));
  }
  if (equipe) acoes.appendChild(h('button', { type: 'button', class: 'btn-link', onclick: executar(() => api.moDispensar(item.id, st !== 'dispensado'), st === 'dispensado' ? 'Voltou a ser pedido.' : 'Dispensado para este caso.') }, st === 'dispensado' ? 'Voltar a pedir' : 'Dispensar'));
  const detalhe = st === 'dispensado' ? 'Dispensado pela CCA' : item.lancado_em ? `Lançado na Caixa em ${dataBr(item.lancado_em)}` : item.assinado ? `Assinado anexado em ${dataBr(item.assinado.em)}${item.digital === false ? ' · sem assinatura digital' : ''}`
    : item.parcial ? `Anexado com parte das assinaturas em ${dataBr(item.parcial.em)}`
    : daCca ? 'Documento da CCA' : item.modelo.obrigatorio === false ? 'Não bloqueia a Conformidade' : 'Falta assinar no gov.br e anexar';
  return h('div', { class: `mo-item${st === 'dispensado' ? ' dispensado' : ''}` },
    h('div', { class: 'mo-item-cab' },
      h('div', { class: 'mo-item-nome' }, h('b', null, `${item.modelo.codigo}${item.pessoa_nome ? ` · ${item.pessoa_nome}` : ''}`), h('small', null, item.modelo.nome)),
      h('span', { class: `chip ${cls}` }, rot)),
    h('small', { class: 'mo-item-det' }, detalhe), quemAssina(item, kit), acoes.childNodes.length ? acoes : null);
}

// Quem precisa assinar este formulário e quem já assinou (lido da assinatura digital do PDF)
function quemAssina(item, kit) {
  const esperados = DM.esperadosDoItem(item, kit);
  if (!esperados.length || item.dispensado_em) return null;
  const lidos = (item.assinantes || []).map((x) => (typeof x === 'string' ? x : x?.nome)).filter(Boolean);
  const tudo = !!item.assinado && !lidos.length; // anexado como completo sem nomes lidos (ex.: confirmado por quem anexou)
  const { assinaram } = conferirAssinantes(esperados, lidos);
  return h('div', { class: 'mo-assinantes', 'aria-label': 'Quem assina' }, esperados.map((p) => {
    const ok = tudo || assinaram.includes(p);
    return h('span', { class: `mo-assinante${ok ? ' ok' : ''}` }, ok ? icone('check', { tam: 13, traco: 2.6 }) : null,
      `${R.primeiroNome(p.nome)}${p.papel === 'vendedor' ? ' · vendedor(a)' : ''}${ok ? '' : ': falta'}`);
  }));
}

// Anexar o formulário: lê a assinatura digital do PDF e confere quem já assinou antes de enviar
async function anexarComConferencia(arquivo, item, kit, { equipe, aoMudar }) {
  let leitura = { pdf: false, digital: false, nomes: [] };
  try { leitura = lerAssinaturasPdf(new Uint8Array(await arquivo.arrayBuffer())); } catch { /* segue com leitura vazia */ }
  const esperados = DM.esperadosDoItem(item, kit);
  const { assinaram, faltam } = conferirAssinantes(esperados, leitura.nomes);
  const enviar = async (completo) => {
    try {
      await api.moAnexarAssinado(kit.cliente.id, item.id, arquivo, { assinantes: leitura.nomes, digital: leitura.pdf ? leitura.digital : false, completo });
      toast(!completo ? 'Anexado. O formulário fica pendente até todos assinarem.' : equipe ? 'Assinado anexado.' : 'Assinado anexado. A CCA foi avisada.');
      aoMudar();
    } catch (e) { toast(e.message); }
  };
  const nomes = (lista) => lista.map((p) => `${p.nome}${p.papel === 'vendedor' ? ' · vendedor(a)' : ''}`).join(', ');
  if (!esperados.length) return enviar(true);
  if (!leitura.digital) {
    abrirJanela('Sem assinatura digital', h('p', null, leitura.pdf
      ? 'Este PDF não tem assinatura digital do gov.br. Formulário assinado à mão e escaneado pode ser recusado pela Caixa.'
      : 'Este arquivo não é um PDF assinado digitalmente. O ideal é anexar o PDF assinado no gov.br.'),
    h('div', { class: 'gest-acoes' },
      h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: () => { document.querySelector('.janela-fundo')?.remove(); enviar(true); } }, 'Anexar mesmo assim'),
      h('button', { type: 'button', class: 'btn-link', onclick: () => { document.querySelector('.janela-fundo')?.remove(); abrirGuiaGovbr(); } }, 'Como assinar no gov.br')));
    return;
  }
  if (!faltam.length) { toast(`Assinado por: ${nomes(assinaram)}.`); return enviar(true); }
  abrirJanela('Ainda faltam assinaturas',
    assinaram.length ? h('p', null, h('b', null, 'Já assinaram: '), nomes(assinaram)) : h('p', null, 'Não encontramos no PDF o nome de quem precisa assinar.'),
    h('p', null, h('b', null, 'Faltam: '), nomes(faltam)),
    leitura.nomes.length && !assinaram.length ? h('p', { class: 'ajuda' }, `Nomes encontrados no PDF: ${leitura.nomes.join(', ')}.`) : null,
    h('div', { class: 'gest-acoes', style: { flexDirection: 'column', alignItems: 'stretch' } },
      h('button', { type: 'button', class: 'btn btn-primario', onclick: () => { document.querySelector('.janela-fundo')?.remove(); enviar(false); } }, 'Anexar e aguardar as outras assinaturas'),
      h('button', { type: 'button', class: 'btn btn-contorno', onclick: () => { document.querySelector('.janela-fundo')?.remove(); enviar(true); } }, 'Todos já assinaram: anexar como completo')));
}

export function blocoDamp({ cliente, perfil, aoMudar }) {
  if (cliente.rascunho || ehCliente(perfil) || !passouDe(cliente.status, 'cliente_aprovado')) return null;
  const equipe = ehEquipeCca(perfil);
  const caixa = h('section', { class: 'cartao damp-bloco', id: 'secao-damp' }, h('div', { class: 'sub' }, 'Carregando o MO / DAMP…'));
  api.moKit(cliente.id).then((kit) => {
    limpar(caixa);
    const [rot, cls] = ROT_KIT[kit.situacao] || ROT_KIT.sem_modelo;
    caixa.appendChild(h('div', { class: 'damp-cab' }, secaoTitulo('MO / DAMP', null, { pequeno: true, nivel: 'h3', icone: 'doc' }), h('span', { class: `chip ${cls}` }, rot)));
    const texto = {
      sem_modelo: equipe ? 'Nenhum modelo da Caixa vale para este caso pela regra. Se precisar, inclua abaixo.' : 'Nenhuma declaração da Caixa para este caso.',
      para_assinar: equipe ? `Aguardando as assinaturas no gov.br: ${kit.pendentes}. O PDF assinado pode ser anexado pela CCA ou por quem acompanha o cliente (corretor, gestor da imobiliária ou o próprio consumidor final). Sem eles o processo não vai para a Conformidade.`
        : perfil?.consumidor ? 'O app já preencheu as declarações da Caixa. Baixe cada uma, confira, assine no gov.br e anexe aqui o PDF assinado. Sem elas assinadas o processo não vai para a Conformidade.'
        : 'O app já preencheu as declarações da Caixa. Baixe cada uma, confira, envie para assinatura no gov.br e anexe aqui o PDF assinado (a CCA também pode anexar). Sem elas assinadas o processo não vai para a Conformidade.',
      assinada: equipe ? 'Tudo assinado. Falta lançar na Caixa.' : 'Tudo assinado. A CCA lança na Caixa.',
      lancada: 'Tudo lançado na Caixa.',
    }[kit.situacao];
    caixa.appendChild(h('div', { class: 'ajuda' }, texto));
    if (kit.situacao === 'para_assinar') {
      const pessoas = [...DM.pessoasDoCaso(kit.cliente, kit.participantes).map((p, k) => ({ nome: p.nome, nivel: k === 0 ? kit.cliente.govbr_nivel : kit.participantes.find((x) => x.ordem === p.ordem)?.govbr_nivel })),
        ...(kit.vendedores || []).map((v) => ({ nome: v.nome, nivel: v.govbr_nivel, vendedor: true }))];
      const semNivel = pessoas.filter((p) => DM.govbrNaoAssina(p.nivel));
      if (semNivel.length) caixa.appendChild(aviso('laranja', h('strong', null, 'Conta gov.br sem nível para assinar: '),
        `${semNivel.map((p) => `${p.nome}${p.vendedor ? ' · vendedor(a)' : ''} (${p.nivel === 'nao_tem' ? 'não tem conta' : 'bronze'})`).join(', ')}. Precisa ser prata ou ouro.`));
      caixa.appendChild(h('button', { type: 'button', class: 'btn-link', id: 'guia-govbr', onclick: abrirGuiaGovbr }, 'Como assinar no gov.br? Veja o passo a passo'));
    }
    if (kit.itens.length) caixa.appendChild(h('div', { class: 'mo-lista' }, ...kit.itens.map((i) => linhaMo(i, kit, { equipe, aoMudar }))));
    if (!equipe) return;
    const pessoas = DM.pessoasDoCaso(kit.cliente, kit.participantes);
    const selModelo = h('select', { class: 'entrada', id: 'mo-incluir-modelo', 'aria-label': 'Modelo para incluir' }, kit.modelos.map((m) => h('option', { value: m.id }, `${m.codigo} · ${m.nome}`)));
    const selPessoa = h('select', { class: 'entrada', id: 'mo-incluir-pessoa', 'aria-label': 'Para quem' }, h('option', { value: '0' }, 'Todos os compradores'), ...pessoas.map((p) => h('option', { value: String(p.ordem) }, p.nome)));
    const incluir = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'mo-incluir' }, 'Incluir');
    incluir.onclick = async () => { incluir.disabled = true; try { await api.moAdicionar(cliente.id, selModelo.value, Number(selPessoa.value)); toast('Modelo incluído.'); aoMudar(); } catch (e) { toast(e.message); incluir.disabled = false; } };
    const atualizar = h('button', { type: 'button', class: 'btn-link', id: 'mo-atualizar' }, 'Atualizar pela regra');
    atualizar.onclick = async () => { try { const n = await api.moMontarKit(cliente.id); toast(n ? `${n} documento${n > 1 ? 's' : ''} incluído${n > 1 ? 's' : ''} pela regra.` : 'Nada novo pela regra.'); aoMudar(); } catch (e) { toast(e.message); } };
    if (kit.modelos.length) caixa.appendChild(h('details', { class: 'mo-incluir' }, h('summary', null, 'Incluir outro modelo'), h('div', { class: 'damp-gerar' }, selModelo, selPessoa, incluir), atualizar));
  }).catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

// "Sua vez" da DAMP: assinatura no gov.br; anexam a CCA, o corretor, o gestor ou o consumidor final; a CCA lança na Caixa
export function itensDamp(clientes, { equipe, rotaCliente = (c) => `#/cliente/${c.id}`, rotaLista = '#/clientes' } = {}) {
  const alvo = equipe ? 'assinada' : 'para_assinar';
  const lista = clientes.filter((c) => !c.rascunho && c.damp_situacao === alvo);
  if (!lista.length) return [];
  return [{ tipo: 'damp', tom: 'atencao', icone: 'doc', valor: lista.length,
    titulo: equipe ? 'MO / DAMP assinado: lançar na Caixa' : 'MO / DAMP: assinar no gov.br e anexar o PDF assinado',
    detalhe: lista.slice(0, 3).map((c) => c.nome).join(', ') + (lista.length > 3 ? ` e mais ${lista.length - 3}` : ''),
    href: lista.length === 1 ? rotaCliente(lista[0]) : rotaLista }];
}

// Tela do ADM: modelos de MO / DAMP, quando cada um vale, quem assina e se segura a Conformidade
export async function secaoModelosDamp() {
  const raiz = h('div', { class: 'damp-modelos' });
  const desenhar = async () => {
    const modelos = await api.listarModelosDamp();
    limpar(raiz);
    const linha = (m) => {
      const v = { tipo: 'MO', assina: 'compradores', obrigatorio: true, manual: false, regra: [], ...m, regra: [...(m.regra || [])] };
      const modo = () => (v.manual ? 'manual' : v.regra.length ? 'casos' : 'sempre');
      const inp = (campo, attrs = {}) => h('input', { class: 'entrada', value: v[campo] ?? '', oninput: (e) => { v[campo] = e.target.value; }, ...attrs });
      const sel = (campo, opcoes) => h('select', { class: 'entrada', onchange: (e) => { v[campo] = e.target.value; } }, opcoes.map(([val, nome]) => h('option', { value: val, selected: v[campo] === val }, nome)));
      const casos = h('div', { class: 'mo-casos', hidden: modo() !== 'casos' }, ...DM.OPCOES_REGRA.map(([k, val, nome]) => {
        const tem = () => v.regra.some((alt) => Object.keys(alt).length === 1 && alt[k] === val);
        return h('label', { class: 'mo-marca' }, h('input', { type: 'checkbox', checked: tem(), onchange: (e) => {
          v.regra = v.regra.filter((alt) => !(Object.keys(alt).length === 1 && alt[k] === val));
          if (e.target.checked) v.regra.push({ [k]: val });
        } }), h('span', null, nome));
      }));
      const quando = h('select', { class: 'entrada', 'aria-label': 'Quando vale', onchange: (e) => {
        const q = e.target.value; v.manual = q === 'manual'; if (q !== 'casos') v.regra = []; casos.hidden = q !== 'casos';
        if (q === 'casos') casos.querySelectorAll('input').forEach((c) => { c.checked = false; });
      } }, [['sempre', 'Sempre'], ['casos', 'Em alguns casos'], ['manual', 'Quando a CCA incluir']].map(([val, nome]) => h('option', { value: val, selected: modo() === val }, nome)));
      const arq = h('input', { type: 'file', accept: '.doc,.docx,.dot,.pdf,.html', style: { display: 'none' }, onchange: (e) => { const f = e.target.files[0]; if (f) { v.arquivo = f; v.arquivo_nome = f.name; } nomeArq.textContent = v.arquivo_nome || 'Nenhum arquivo'; } });
      const nomeArq = h('span', { class: 'sub' }, v.arquivo_nome || 'Nenhum arquivo');
      const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, m.id ? 'Salvar' : 'Adicionar');
      salvar.onclick = async () => {
        if (modo() === 'casos' && !v.regra.length) { toast('Marque pelo menos um caso, ou escolha "Sempre".'); return; }
        salvar.disabled = true;
        try { await api.salvarModeloDamp(v); toast(m.id ? 'Modelo salvo.' : 'Modelo adicionado.'); desenhar(); } catch (e) { toast(e.message); salvar.disabled = false; }
      };
      return h('div', { class: 'cartao damp-linha' },
        h('div', { class: 'damp-campos' },
          h('label', { class: 'campo' }, h('span', null, 'Código'), inp('codigo', { placeholder: 'Ex.: MO30844' })),
          h('label', { class: 'campo damp-nome' }, h('span', null, 'Nome'), inp('nome', { placeholder: 'Ex.: Declaração do seguro habitacional' })),
          h('label', { class: 'campo' }, h('span', null, 'Tipo'), sel('tipo', [['MO', 'MO'], ['DAMP', 'DAMP']])),
          h('label', { class: 'campo' }, h('span', null, 'Quando vale'), quando),
          h('label', { class: 'campo' }, h('span', null, 'Quem assina'), sel('assina', DM.ASSINA))),
        casos,
        h('label', { class: 'mo-marca' }, h('input', { type: 'checkbox', checked: !!v.vendedor_assina, onchange: (e) => { v.vendedor_assina = e.target.checked; } }),
          h('span', null, 'O vendedor também assina (e o cônjuge, se for casado)')),
        h('label', { class: 'mo-marca' }, h('input', { type: 'checkbox', checked: v.obrigatorio !== false, onchange: (e) => { v.obrigatorio = e.target.checked; } }),
          h('span', null, 'Obrigatório: sem ele assinado, o processo não vai para a Conformidade')),
        h('div', { class: 'gest-acoes damp-rodape' },
          v.oficial ? h('span', { class: 'chip chip-aceito' }, 'Modelo oficial · o app preenche sozinho')
            : [h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => arq.click() }, 'Arquivo do modelo'), nomeArq, arq],
          h('span', { style: { flex: '1' } }), salvar,
          m.id ? h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await api.removerModeloDamp(m.id); desenhar(); } catch (e) { toast(e.message); } } }, 'Remover') : null));
    };
    modelos.forEach((m) => raiz.appendChild(linha(m)));
    raiz.appendChild(secaoTitulo('Novo modelo', 'Cadastre outro MO ou DAMP da Caixa com o código, quando ele vale e quem assina. Modelos novos saem para baixar em branco; para o app preencher sozinho, envie o arquivo para a equipe do sistema.', { pequeno: true, nivel: 'h3' }));
    raiz.appendChild(linha({}));
  };
  await desenhar();
  return [cabecalho('Modelos de MO / DAMP', 'Da aprovação do cliente em diante, o app monta o kit de declarações da Caixa de cada caso, já preenchido, para assinatura no gov.br. Os PDFs assinados podem ser anexados pela CCA, pelo corretor, pelo gestor da imobiliária, pelo corretor independente ou pelo consumidor final. Sem os obrigatórios assinados o processo não vai para a Conformidade.'), raiz];
}

// ---------- Ficha para a Caixa (o que o Projeto CCA lê para preencher os sistemas da Caixa) ----------
export async function baixarFichaCaixa(clienteId) {
  const dados = await api.obterCliente(clienteId);
  const json = R.montarCadastroJson({ cliente: dados.cliente, corretor: dados.corretor, imobiliaria: dados.imobiliaria, necessarios: dados.necessarios, participantes: dados.participantes || [], vendedor: dados.vendedor || null });
  const md = R.montarFichaMd(json);
  const base = `ficha-caixa-${R.soDigitos(dados.cliente.cpf || '') || dados.cliente.id}`;
  const baixar = (conteudo, nome, tipo) => { const a = h('a', { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nome }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  baixar(md, `${base}.md`, 'text/markdown');
  baixar(JSON.stringify(json, null, 2), `${base}.json`, 'application/json');
  toast('Ficha para a Caixa baixada (texto e dados).');
}

// Cliente selecionado abre embaixo da lista (Modelo 2): leva a tela até ele, descontando o menu fixo do topo
export function rolarAteSelecionado(alvo) {
  if (!alvo) return;
  const topo = document.querySelector('.painel-topo')?.getBoundingClientRect().height || 0;
  const y = alvo.getBoundingClientRect().top + window.scrollY - topo - 12;
  const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, y), behavior: reduzir ? 'auto' : 'smooth' });
}
