// MODELO 2 (?demo2): estrutura nova por perfil. Só roda na demonstração; o app real e o ?demo atual não usam este arquivo.
// Imobiliária: CEO (acima de todos) · Gestor (documentação e intermediação) · Corretor. CCA: nível 1 (CEO da CCA), 2 e 3.
import { h, limpar, icone, toast } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho, secaoTitulo, aviso, listaPendencias, blocoConversa, chipStatus } from './componentes.js';
import { fluxograma } from './fluxo.js';

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
  ['parceiros', 'Parceiros', 'predio', ['imobiliarias', 'corretores', 'vendedores', 'convites', 'vercomo']],
  ['resultados', 'Resultados', 'grafico', ['relatorios', 'campanhas']],
  ['admin', 'Administração', 'engrenagem', ['mensagens', 'acessos', 'config']],
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
  return h('nav', { class: 'abas-grupo', 'aria-label': `Telas de ${grupo[1]}` }, abas.map(([cod, nome]) =>
    h('a', { href: `#/painel/${cod}`, class: cod === secao ? 'ativa' : '', 'aria-current': cod === secao ? 'page' : null }, nome,
      cod === 'docs' && numDocs ? h('span', { class: 'num' }, numDocs) : null)));
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
    secaoTitulo('Conversa interna da imobiliária', daImob ? `Entre o corretor e ${gestor ? `o gestor (${R.primeiroNome(gestor.nome)})` : 'o CEO'}. A CCA não participa.` : 'Mensagens entre o corretor e o gestor desta imobiliária.', { pequeno: true, nivel: 'h3', icone: 'conversa' }),
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
        const valor = h('input', { class: 'entrada com-input', inputmode: 'decimal', 'aria-label': `Comissão de ${l.cliente_nome}`, value: l.valor != null ? Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '', placeholder: 'R$ 0,00', disabled: !!l.paga_em,
          onchange: async (e) => { const v = Number(String(e.target.value).replace(/\./g, '').replace(',', '.')); try { await api.definirComissao(l.cliente_id, v); toast('Valor salvo.'); desenhar(); } catch (er) { toast(er.message); } } });
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
      caixa.appendChild(h('div', { class: 'ajuda' }, 'Convite enviado, aguardando o cliente criar a senha.'));
      caixa.appendChild(mostrarConvite(a.link, a.expira_em));
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
      perfil.papel === 'corretor' ? cartao('#/inicio', 'trofeu', 'Campanhas e desempenho', 'Sua posição no mês e as campanhas da CCA, no Início.') : null,
      cartao('#/clientes', 'pessoas', perfil.papel === 'gestor_imobiliaria' ? 'Clientes' : 'Meus clientes', 'Lista e quadro com todos os processos.')),
    acesso,
  ].filter(Boolean);
}

// ---------- cliente final: Meu financiamento ----------
export async function conteudoMeuFinanciamento({ perfil }) {
  const dados = await api.obterCliente(perfil.cliente_id);
  const { cliente, necessarios, historico, corretor } = dados;
  const arquivos = await api.listarContratoArquivos(cliente.id).then((l) => l.filter((a) => !a.substituido).map((a) => a.tipo)).catch(() => []);
  const r = R.resumoDocumentos(necessarios);
  const falta = r.pendente + r.recusado;
  const fone = R.soDigitos(corretor?.whatsapp || '');
  return [
    cabecalho({ sobre: 'Meu financiamento', titulo: `${R.saudacao()}, ${R.primeiroNome(perfil.nome)}`, sub: [cliente.programa, cliente.imovel && `Imóvel ${String(cliente.imovel).toLowerCase()}`].filter(Boolean).join(' · ') }, chipStatus(cliente.status)),
    fluxograma({ cliente, historico, arquivos, titulo: 'Seu processo, etapa por etapa', quemVe: 'cliente', temGestor: !!dados.gestor_imob }),
    h('div', { class: 'painel-colunas ficha-colunas' },
      h('div', { class: 'principal coluna-cartoes' },
        h('section', { class: 'cartao' }, secaoTitulo('Seus documentos', falta ? `Falta${falta > 1 ? 'm' : ''} ${falta}` : 'Todos enviados', { pequeno: true, icone: 'doc' }),
          falta ? listaPendencias(necessarios) : h('div', { class: 'ajuda' }, 'Nada pendente com você agora.'),
          h('a', { class: `btn ${falta ? 'btn-primario' : 'btn-contorno'}`, href: `#/cliente/${cliente.id}/documentos` }, falta ? 'Enviar documentos' : 'Ver meus documentos'))),
      h('aside', { class: 'lateral coluna-cartoes' },
        h('section', { class: 'cartao', id: 'conversa' }, secaoTitulo('Conversa com a CCA', 'Dúvidas sobre o seu processo. A equipe responde aqui.', { pequeno: true }), blocoConversa(cliente.id, { lado: 'portal' })),
        corretor ? h('section', { class: 'cartao' }, secaoTitulo('Seu corretor', null, { pequeno: true, icone: 'pessoa' }), h('div', null, h('b', null, corretor.nome)),
          fone ? h('a', { class: 'btn btn-contorno btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}` }, 'Falar pelo WhatsApp') : null) : null)),
  ];
}
