// Painel da equipe da CCA (computador e celular).
import { h, limpar, icone, toast, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { aviso, botaoOpcao, marcaRegra, chipSituacao, abrirDoc, dataHora, listaPendencias, resumoPorSecao, ativarNotificacoes, notificacoesAtivas, logo, chipStatus, blocoConversa, notaIa } from './componentes.js';
import { secaoRelatorios } from './relatorios.js';

// [código, nome, ícone, quem vê]
const MENU = [
  ['clientes', 'Clientes', 'pessoas', () => true],
  ['convites', 'Convidar', 'mais', (p) => R.tiposDeConvite(p).length > 0],
  ['docs', 'Docs a conferir', 'docCheck', (p) => R.pode(p, 'conferir_documentos')],
  ['imobiliarias', 'Imobiliárias', 'predio', (p) => R.pode(p, 'ver_imobiliarias_corretores')],
  ['corretores', 'Corretores', 'pessoa', (p) => R.pode(p, 'ver_imobiliarias_corretores')],
  ['vendedores', 'Vendedores', 'casa', (p) => R.pode(p, 'ver_vendedores')],
  ['mensagens', 'Mensagens', 'conversa', (p) => R.pode(p, 'ver_mensagens')],
  ['relatorios', 'Relatórios', 'grafico', (p) => R.pode(p, 'ver_relatorios')],
  ['acessos', 'Acessos', 'escudo', (p) => R.pode(p, 'ver_acessos')],
  ['config', 'Configurações', 'engrenagem', (p) => p.papel === 'admin'],
];
let perfilPainel = null;
// Celular e tablet em pé: cada linha das tabelas vira um cartão; o nome da coluna aparece ao lado do valor
function rotularTabelas(raiz = document) {
  raiz.querySelectorAll('table.tabela').forEach((t) => {
    const nomes = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => {
      if (td.colSpan > 1) td.classList.add('vazia');
      else if (nomes[i] && td.dataset.rotulo !== nomes[i]) td.dataset.rotulo = nomes[i];
    }));
  });
}
if (typeof MutationObserver !== 'undefined') {
  let agendado = false;
  new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; rotularTabelas(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
}
let rolagemMenu = 0; // no celular o menu rola para o lado: guarda a posição entre uma página e outra

// Depois de trocar de página: o menu fica onde estava e o item escolhido aparece inteiro na tela
function manterMenu() {
  const menu = document.querySelector('.painel-topo .menu-botoes');
  if (!menu || menu.scrollWidth <= menu.clientWidth) return;
  menu.scrollLeft = rolagemMenu;
  const ativo = menu.querySelector('a.ativo');
  if (ativo) {
    const ini = ativo.offsetLeft - menu.offsetLeft;
    const fim = ini + ativo.offsetWidth;
    if (ini < menu.scrollLeft + 8) menu.scrollLeft = Math.max(0, ini - 16);
    else if (fim > menu.scrollLeft + menu.clientWidth - 8) menu.scrollLeft = fim - menu.clientWidth + 16;
  }
  rolagemMenu = menu.scrollLeft;
}
let ctxConfig = null;

const estado = { filtro: 'todos', busca: '', selecionado: null, novoStatus: null, avisar: true, recusa: {}, visao: 'lista' };
try { if (localStorage.getItem('appcca-visao') === 'quadro') estado.visao = 'quadro'; } catch { /* sem armazenamento */ }

export async function telaPainel(secao, ctx) {
  perfilPainel = ctx.perfil;
  ctxConfig = ctx.config;
  const permitidas = MENU.filter(([, , , ve]) => ve(ctx.perfil)).map(([cod]) => cod);
  if (!permitidas.includes(secao)) secao = 'clientes';
  const paraConferir = R.pode(ctx.perfil, 'conferir_documentos') ? await api.listarDocsParaConferir() : [];
  const corpo = h('main', { class: 'painel-corpo' });
  const recarregar = async () => {
    const y = window.scrollY; // mantém a tela onde estava
    const nova = await telaPainel(secao, ctx);
    const atual = document.querySelector('.painel');
    atual?.replaceWith(nova);
    window.scrollTo(0, y);
  };

  const conteudo = {
    clientes: () => secaoClientes(ctx, paraConferir, recarregar),
    docs: () => secaoDocs(paraConferir, recarregar),
    imobiliarias: () => secaoImobiliarias(recarregar),
    corretores: () => secaoCorretores(recarregar),
    vendedores: () => secaoVendedores(recarregar),
    convites: () => secaoConvites(ctx, recarregar),
    mensagens: secaoMensagens,
    relatorios: () => secaoRelatorios(ctx, { cabecalho, secaoTitulo, tabela }),
    acessos: secaoAcessos,
    config: () => secaoConfig(ctx, recarregar),
  }[secao] || (() => secaoClientes(ctx, paraConferir, recarregar));
  adicionar(corpo, ...[].concat(await conteudo()));

  setTimeout(() => requestAnimationFrame(manterMenu), 0);
  return h('div', { class: 'painel' },
    h('nav', { class: 'painel-topo', 'aria-label': 'Menu da equipe' },
      h('a', { href: '#/painel/clientes', 'aria-label': 'Início do painel', style: { display: 'flex' } }, logo('logo-painel')),
      h('div', { class: 'menu-botoes', onscroll: (e) => { rolagemMenu = e.currentTarget.scrollLeft; } },
        MENU.filter(([cod]) => permitidas.includes(cod)).map(([cod, nome, ic]) => h('a', { href: `#/painel/${cod}`, class: secao === cod ? 'ativo' : '', 'aria-current': secao === cod ? 'page' : null },
          icone(ic), nome,
          cod === 'docs' && paraConferir.length ? h('span', { class: 'num' }, paraConferir.length) : null)),
        h('a', { href: '#/entrar', class: 'sair', title: `Sair (${ctx.perfil.nome} · ${ctx.perfil.papel === 'admin' ? 'ADM' : 'Usuário'})`, onclick: (e) => { e.preventDefault(); ctx.sair(); } }, icone('sair'), 'Sair')),
      h('div', { class: 'painel-usuario' }, `${ctx.perfil.nome} · ${ctx.perfil.papel === 'admin' ? 'ADM' : 'Usuário'}`)),
    corpo);
}

// Cabeçalho de página (padrão de todas as telas do painel)
function cabecalho(titulo, sub, ...extra) {
  // Opções: cabecalho({ titulo, sub, sobre, foto }, ...extra)
  const o = typeof titulo === 'object' ? titulo : { titulo, sub };
  if (typeof titulo === 'object' && sub) extra = [sub, ...extra];
  return h('header', { class: `pagina-cab${o.foto ? ' com-foto' : ''}` },
    h('div', { class: 'pagina-cab-texto' }, o.sobre ? h('div', { class: 'pagina-sobre' }, o.sobre) : null,
      h('h1', { class: 'pagina-titulo' }, o.titulo), o.sub ? h('p', { class: 'pagina-sub' }, o.sub) : null),
    extra.length ? h('div', { class: 'pagina-cab-extra' }, ...extra) : null);
}

// Título de seção dentro da página (ex.: "Status", "Documentos", "Imobiliárias cadastradas")
function secaoTitulo(titulo, sub, { pequeno = false, nivel = 'h2' } = {}) {
  return h('div', { class: `secao-cab${pequeno ? ' pequeno' : ''}` },
    h(nivel, { class: 'secao-titulo' }, titulo), sub ? h('p', { class: 'secao-sub' }, sub) : null);
}

// ---------- Clientes ----------
async function secaoClientes(ctx, paraConferir, recarregar) {
  const clientes = await api.listarClientes();
  const enviados = clientes.filter((c) => !c.rascunho);
  // Link de aviso (?c=): abre com o cliente já selecionado
  if (ctx.selecionar) {
    if (enviados.some((c) => c.id === ctx.selecionar)) { estado.selecionado = ctx.selecionar; estado.novoStatus = null; }
    ctx.selecionar = null;
    history.replaceState(null, '', `${location.pathname}${location.search}#/painel/clientes`);
  }
  const limiteParado = Number(ctx.config.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const parado = (c) => R.diasParado(c, limiteParado);
  const filtros = [
    ['todos', 'Todos', () => true],
    ['mensagens', 'Mensagens novas', (c) => c.conversa_nao_lidas > 0],
    ['parados', `Parados há ${limiteParado}+ dias`, (c) => parado(c) > 0],
    ['pendente', 'Doc. pendente', (c) => c.docs_pendentes > 0 || c.docs_recusados > 0],
    ['conferir', 'Docs para conferir', (c) => c.docs_em_conferencia > 0],
    ...ctx.config.status.map((s) => [s.codigo, s.nome, (c) => c.status === s.codigo]),
  ];
  const caixaFiltros = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Filtrar por status' });
  const caixaTabela = h('div', { class: 'tabela-caixa' });
  const lateral = h('aside', { class: 'lateral' });
  const caixaVisao = h('div', { class: 'alternar-visao', role: 'group', 'aria-label': 'Ver como' });
  const colunas = h('div', { class: 'painel-colunas' }, h('div', { class: 'principal' }, caixaTabela), lateral);

  const selecionar = async (c) => {
    estado.selecionado = c.id; estado.novoStatus = null; desenhar(); await desenharLateral();
    // Tablet e celular: os detalhes ficam abaixo da lista, então leva a tela até eles
    if (lateral.getBoundingClientRect().top > window.innerHeight * 0.6) lateral.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  // Alertas do cliente: mensagem nova do corretor e processo parado
  const alertas = (c) => {
    const dias = parado(c);
    return [
      c.conversa_nao_lidas ? h('span', { class: 'chip chip-msg' }, icone('conversa', { tam: 13, cor: '#FFFFFF', traco: 2.4 }), `${c.conversa_nao_lidas} nova${c.conversa_nao_lidas > 1 ? 's' : ''}`) : null,
      dias ? h('span', { class: 'chip chip-parado', title: `Sem mudança de status há ${dias} dias` }, `Parado há ${dias} dias`) : null,
    ].filter(Boolean);
  };
  const quadro = (vis) => h('div', { class: 'quadro', role: 'list', 'aria-label': 'Quadro de clientes por status' },
    ctx.config.status.map((st) => {
      const doStatus = vis.filter((c) => c.status === st.codigo);
      return h('section', { class: 'quadro-coluna', role: 'listitem', 'aria-label': `${st.nome}: ${doStatus.length}` },
        h('header', { class: 'quadro-cab' }, h('span', { class: `ponto-status st-${st.codigo}`, 'aria-hidden': 'true' }), h('b', null, st.nome), h('span', { class: 'quadro-num' }, doStatus.length)),
        doStatus.length ? doStatus.map((c) => h('button', { type: 'button', class: `quadro-cartao${estado.selecionado === c.id ? ' selecionado' : ''}${parado(c) ? ' parado' : ''}`, onclick: () => selecionar(c) },
          h('b', { class: 'quadro-nome' }, c.nome),
          h('span', { class: 'quadro-meta' }, `${c.corretor_nome} · ${c.imobiliaria_nome}`),
          h('span', { class: 'quadro-meta' }, `${c.programa || '—'} · ${R.diasDesde(c.status_desde || c.enviado_em) === 0 ? 'neste status desde hoje' : `há ${R.diasDesde(c.status_desde || c.enviado_em)} dia${R.diasDesde(c.status_desde || c.enviado_em) > 1 ? 's' : ''} neste status`}`),
          (() => {
            const ch = [...alertas(c),
              c.docs_recusados ? h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado`) : null,
              c.docs_pendentes ? h('span', { class: 'chip chip-alerta' }, `Faltam ${c.docs_pendentes}`) : null,
              c.docs_em_conferencia ? h('span', { class: 'chip chip-em_conferencia' }, `${c.docs_em_conferencia} p/ conferir`) : null].filter(Boolean);
            return ch.length ? h('span', { class: 'quadro-chips' }, ch) : null;
          })()))
          : h('div', { class: 'quadro-vazio' }, 'Nenhum cliente'));
    }));

  const desenhar = () => {
    limpar(caixaVisao);
    [['lista', 'Lista'], ['quadro', 'Quadro']].forEach(([v, nome]) => caixaVisao.appendChild(botaoOpcao(nome, estado.visao === v, () => {
      estado.visao = v; try { localStorage.setItem('appcca-visao', v); } catch { /* sem armazenamento */ } desenhar();
    }, 'pilula')));
    limpar(caixaFiltros);
    filtros.forEach(([cod, nome, fn]) => {
      const n = enviados.filter(fn).length;
      if (n || cod === 'todos' || estado.filtro === cod) caixaFiltros.appendChild(botaoOpcao(`${nome} · ${n}`, estado.filtro === cod, () => { estado.filtro = cod; desenhar(); }, 'pilula'));
    });
    const termo = estado.busca.toLowerCase().trim();
    const f = (filtros.find((x) => x[0] === estado.filtro) || filtros[0])[2];
    const vis = enviados.filter(f).filter((c) => !termo || [c.nome, R.soDigitos(c.cpf), c.corretor_nome, c.imobiliaria_nome].join(' ').toLowerCase().includes(R.soDigitos(termo) || termo));
    limpar(caixaTabela);
    colunas.classList.toggle('com-quadro', estado.visao === 'quadro');
    if (estado.visao === 'quadro') { caixaTabela.appendChild(quadro(vis)); return; }
    caixaTabela.appendChild(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Cliente', 'Corretor / imobiliária', 'Operação', 'Docs', 'Status'].map((t) => h('th', null, t)))),
      h('tbody', null, vis.length ? vis.map((c) => h('tr', { class: estado.selecionado === c.id ? 'selecionado' : '', tabindex: 0,
        onclick: () => selecionar(c),
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
        h('td', null, h('div', { style: { fontWeight: '700' } }, c.nome), h('div', { class: 'sub' }, R.formatarCpf(c.cpf)),
          alertas(c).length ? h('div', { class: 'linha-chips' }, alertas(c)) : null),
        h('td', null, h('div', { style: { fontWeight: '600' } }, c.corretor_nome), h('div', { class: 'sub' }, c.imobiliaria_nome)),
        h('td', null, c.programa || '—', h('div', { class: 'sub' }, c.imovel || '')),
        h('td', null,
          c.docs_recusados ? h('div', null, h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado`)) : null,
          c.docs_pendentes ? h('div', null, h('span', { class: 'chip chip-alerta' }, `Faltam ${c.docs_pendentes}`)) : null,
          c.docs_em_conferencia ? h('div', null, h('span', { class: 'chip chip-em_conferencia' }, `${c.docs_em_conferencia} p/ conferir`)) : null,
          !c.docs_pendentes && !c.docs_recusados && !c.docs_em_conferencia ? 'Completo' : null,
          c.pode_ir_para_analise ? null : h('div', { class: 'sub', style: { color: '#8A4E12', fontWeight: '700', marginTop: '4px' } }, 'Falta **')),
        h('td', null, chipStatus(c.status, c.status_nome))))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { padding: '30px', textAlign: 'center' } }, 'Nenhum cliente neste filtro.')))));
  };

  let cacheLateral = null; // { id, dados }: escolher um status não busca o cliente de novo
  const desenharLateral = async ({ reusar = false, mostrarPrevia = false } = {}) => {
    if (!estado.selecionado) {
      limpar(lateral);
      lateral.appendChild(h('div', { class: 'cartao' }, h('div', { class: 'subtitulo' }, 'Toque num cliente da lista para mudar o status, conferir documentos e ver a pasta.')));
      return;
    }
    let dados = reusar && cacheLateral?.id === estado.selecionado ? cacheLateral.dados : null;
    if (!dados) {
      // segura a altura enquanto carrega, para a página não pular
      lateral.style.minHeight = `${lateral.offsetHeight}px`;
      limpar(lateral);
      lateral.appendChild(h('div', { class: 'cartao' }, 'Carregando…'));
      const pedido = (desenharLateral.pedido = (desenharLateral.pedido || 0) + 1);
      try { dados = await api.obterCliente(estado.selecionado); } catch (e) { lateral.style.minHeight = ''; toast(e.message); return; }
      if (pedido !== desenharLateral.pedido) return; // outro clique chegou antes
      cacheLateral = { id: estado.selecionado, dados };
    }
    const y = window.scrollY;
    limpar(lateral);
    const { cliente, necessarios, corretor, imobiliaria, vendedor } = dados;
    const escolhido = estado.novoStatus;
    const grade = h('div', { class: 'status-grade' }, ctx.config.status.map((s) => h('button', {
      type: 'button', class: s.codigo === cliente.status ? 'atual' : '', 'aria-pressed': escolhido === s.codigo ? 'true' : 'false',
      onclick: () => { estado.novoStatus = s.codigo === cliente.status ? null : s.codigo; desenharLateral({ reusar: true, mostrarPrevia: true }); },
    }, s.codigo === cliente.status ? `${s.nome} (atual)` : s.nome)));
    const padrao = escolhido ? R.msgStatus({ corretor, cliente, novoStatus: escolhido }) : null;
    if (escolhido && (estado.msgPara !== `${cliente.id}|${escolhido}`)) { estado.msgPara = `${cliente.id}|${escolhido}`; estado.mensagem = padrao; }
    const previa = escolhido ? estado.mensagem : null;
    const caixaMsg = escolhido ? h('textarea', { class: 'entrada balao', rows: 6, 'aria-label': 'Mensagem que o corretor vai receber', style: { resize: 'vertical', minHeight: '130px', fontFamily: 'inherit' },
      oninput: (e) => { estado.mensagem = e.target.value; restaurar.hidden = estado.mensagem === padrao; } }, previa) : null;
    const restaurar = h('button', { type: 'button', class: 'btn-link', hidden: previa === padrao, onclick: () => { estado.mensagem = padrao; caixaMsg.value = padrao; restaurar.hidden = true; } }, 'Voltar ao texto padrão');
    const salvar = h('button', { class: 'btn btn-primario', disabled: !escolhido, type: 'button' }, 'Salvar status');
    salvar.onclick = async () => {
      const msg = String(estado.mensagem || '').trim();
      if (escolhido && !msg) { toast('Escreva a mensagem para o corretor ou volte ao texto padrão.'); return; }
      salvar.disabled = true;
      try {
        await api.mudarStatus(cliente.id, escolhido, msg !== String(padrao).trim() ? msg : null);
        estado.novoStatus = null; estado.msgPara = null;
        toast('Status salvo. O corretor foi avisado.'); recarregar();
      } catch (e) { toast(e.message); salvar.disabled = false; }
    };
    const docsConferir = necessarios.filter((n) => n.situacao === 'em_conferencia');

    lateral.appendChild(h('div', { class: 'cartao', style: { gap: '16px' } },
      h('div', null, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          h('div', { class: 'sobretitulo' }, 'Cliente selecionado'),
          h('a', { class: 'btn btn-contorno btn-pequeno', href: `#/cliente/${cliente.id}/cadastro/1` }, 'Editar cadastro')),
        h('h2', { class: 'secao-titulo', style: { marginTop: '4px' } }, cliente.nome),
        h('div', { class: 'subtitulo' }, `Corretor: ${corretor?.nome || '—'} · ${imobiliaria?.nome || 'Autônomo'}`),
        vendedor ? h('div', { class: 'subtitulo' }, `Vendedor: ${vendedor.nome} · ${vendedor.tipo === 'PF' ? R.formatarCpf(vendedor.cpf_cnpj) : R.formatarCnpj(vendedor.cpf_cnpj)}`,
          vendedor.banco ? ` · Conta: ${vendedor.banco}, ag. ${vendedor.agencia || '—'}${vendedor.operacao ? `, op. ${vendedor.operacao}` : ''}, c/c ${vendedor.conta || '—'}${vendedor.conta_digito ? `-${vendedor.conta_digito}` : ''}` : ' · sem conta para recebimento',
          vendedor.estado_civil === 'Casado(a)' ? ` · Cônjuge (também vendedor): ${vendedor.conjuge_nome || '—'}` : '') : null),
      R.pode(perfilPainel, 'mudar_status') ? h('div', { class: 'bloco-secao' }, secaoTitulo('Status', `Atual: ${R.nomeStatus(cliente.status)}. Escolha o novo status do processo.`, { pequeno: true, nivel: 'h3' }), grade)
        : h('div', { class: 'bloco-secao' }, secaoTitulo('Status', R.nomeStatus(cliente.status), { pequeno: true, nivel: 'h3' }), h('div', { class: 'ajuda' }, 'Seu perfil não muda status.')),
      previa ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' } },
          secaoTitulo('Mensagem ao corretor', 'Pode editar antes de salvar.', { pequeno: true, nivel: 'h3' }), restaurar),
        caixaMsg,
        h('div', { class: 'ajuda' }, (ctxConfig?.parametros?.canal_avisos === 'whatsapp')
          ? 'No WhatsApp vai o modelo aprovado pela Meta (saudação, cliente e status). O texto editado fica no histórico e na notificação do app.'
          : 'Vai como notificação do app e fica no histórico de mensagens.')) : null,
      R.pode(perfilPainel, 'mudar_status') ? salvar : null,
      h('div', { class: 'bloco-secao divisor' },
        secaoTitulo('Documentos', docsConferir.length ? `${docsConferir.length} para conferir.` : null, { pequeno: true, nivel: 'h3' }),
        docsConferir.length && R.pode(perfilPainel, 'conferir_documentos') ? docsConferir.map((n) => blocoConferencia({ nome: n.rotulo, regra: n.regra, documento: n.documento, aoTerminar: recarregar }))
          : h('div', { class: 'subtitulo' }, 'Nenhum documento novo para conferir.'),
        resumoPorSecao(necessarios) ? h('div', { class: 'ajuda', style: { fontWeight: '600' } }, `Faltam — ${resumoPorSecao(necessarios)}`) : null,
        listaPendencias(necessarios),
        h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: '700', fontSize: '14px', minHeight: '32px' } }, 'Ver todos os documentos'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } }, necessarios.map((n) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' } },
            h('span', { style: { flex: '1', minWidth: '140px' } }, n.rotulo, marcaRegra(n.regra)), chipSituacao(n.situacao),
            n.documento ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${n.rotulo}`, onclick: () => abrirDoc(n.documento) }, icone('olho', { tam: 18 })) : null,
            n.documento ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${n.rotulo}`, onclick: () => abrirDoc(n.documento, true) }, icone('baixar', { tam: 18 })) : null)))),
        cliente.pasta_drive_id ? h('a', { href: `https://drive.google.com/drive/folders/${cliente.pasta_drive_id}`, target: '_blank', rel: 'noopener' }, 'Abrir pasta no Drive') : h('div', { class: 'ajuda' }, 'A pasta no Drive é criada quando a integração estiver ligada.')),
      h('div', { class: 'bloco-secao divisor', id: 'secao-conversa' },
        secaoTitulo('Conversa com o corretor', `${corretor?.nome || 'O corretor'} recebe o aviso no celular e no e-mail.`, { pequeno: true, nivel: 'h3' }),
        blocoConversa(cliente.id, { lado: 'painel', aoLer: () => {
          const c = enviados.find((x) => x.id === cliente.id);
          if (c?.conversa_nao_lidas) { c.conversa_nao_lidas = 0; desenhar(); }
        } }))));
    lateral.style.minHeight = '';
    window.scrollTo(0, y);
    // mostra a mensagem e o botão Salvar logo abaixo do status escolhido, sem pular para o topo
    if (mostrarPrevia && (previa || escolhido === null)) (previa ? salvar : grade).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const busca = h('input', { id: 'p-busca', type: 'search', class: 'entrada', placeholder: 'Nome, CPF, corretor ou imobiliária', value: estado.busca, style: { width: '300px', maxWidth: '100%' },
    oninput: (e) => { estado.busca = e.target.value; desenhar(); } });
  desenhar();
  await desenharLateral(); // monta o cliente selecionado antes de trocar a tela (não pula ao salvar)
  return [
    cabecalho({ titulo: 'Clientes', sobre: 'Painel de clientes da equipe', sub: 'Todos os cadastros enviados por corretores e imobiliárias parceiras.', foto: true },
      h('div', null, h('label', { for: 'p-busca', class: 'sr' }, 'Buscar'), busca)),
    h('div', { class: 'barra-filtros' }, caixaFiltros, caixaVisao),
    colunas,
  ];
}

// Aceitar / recusar um documento
function blocoConferencia({ nome, regra, documento, clienteNome, aoTerminar }) {
  const ia = documento.ia;
  // Sugestão da IA já deixa marcado o motivo da recusa (a equipe pode trocar)
  const st = (estado.recusa[documento.id] ||= {
    motivo: ia?.analisado && ia.sugestao === 'recusar' && R.MOTIVOS_RECUSA.includes(ia.motivo_recusa) ? ia.motivo_recusa : null,
    obs: ia?.analisado && ia.sugestao === 'recusar' && ia.resumo ? ia.resumo : '' });
  const motivos = h('div', { class: 'pilulas' });
  const desenharMotivos = () => {
    limpar(motivos);
    R.MOTIVOS_RECUSA.forEach((m) => motivos.appendChild(botaoOpcao(m, st.motivo === m, () => { st.motivo = st.motivo === m ? null : m; desenharMotivos(); }, 'pilula recusa')));
  };
  desenharMotivos();
  const obs = h('input', { class: 'entrada', style: { height: '42px', fontSize: '14px' }, placeholder: 'Observação para o corretor (opcional)', value: st.obs, oninput: (e) => { st.obs = e.target.value; }, 'aria-label': 'Observação para o corretor' });
  const conferir = async (aceito, botao) => {
    if (!aceito && !st.motivo) return toast('Escolha o motivo da recusa');
    botao.disabled = true;
    try {
      await api.conferirDocumento(documento.id, aceito, st.motivo, st.obs, !!documento.do_vendedor);
      delete estado.recusa[documento.id];
      toast(aceito ? 'Documento aceito' : 'Documento recusado. O corretor foi avisado no WhatsApp.');
      aoTerminar?.();
    } catch (e) { toast(e.message); botao.disabled = false; }
  };
  const aceitar = h('button', { type: 'button', class: 'btn btn-azul btn-pequeno cheio' }, 'Aceitar');
  aceitar.onclick = () => conferir(true, aceitar);
  const recusar = h('button', { type: 'button', class: 'btn btn-perigo btn-pequeno cheio' }, 'Recusar');
  recusar.onclick = () => conferir(false, recusar);

  return h('div', { class: 'cartao', style: { background: '#FBFAF7', gap: '10px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } },
      h('div', null,
        clienteNome ? h('div', { class: 'subtitulo' }, clienteNome) : null,
        h('div', { style: { fontWeight: '700' } }, nome, marcaRegra(regra)),
        h('div', { class: 'subtitulo' }, `${documento.nome_original || 'arquivo'} · versão ${documento.versao} · ${dataHora(documento.enviado_em)}`)),
      h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${nome}`, onclick: () => abrirDoc(documento) }, icone('olho', { tam: 18 })),
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${nome}`, onclick: () => abrirDoc(documento, true) }, icone('baixar', { tam: 18 })))),
    notaIa(ia, { equipe: true }),
    !ia?.analisado && ctxConfig?.parametros?.ia_conferencia !== 'nao' ? (() => {
      const b = h('button', { type: 'button', class: 'btn-link', style: { alignSelf: 'flex-start' } }, ia ? 'Pedir a pré-conferência de novo' : 'Pedir pré-conferência da IA');
      b.onclick = async () => {
        b.disabled = true; b.textContent = 'A IA está olhando o documento…';
        try { await api.iaConferir(documento.do_vendedor ? 'documentos_vendedor' : 'documentos', documento.id); toast('Pré-conferência pronta.'); aoTerminar?.(); }
        catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Pedir pré-conferência da IA'; }
      };
      return b;
    })() : null,
    h('div', { class: 'linha-botoes' }, aceitar, recusar),
    h('div', { class: 'rotulo', style: { fontSize: '13px' } }, 'Motivo da recusa'), motivos, obs,
    h('div', { class: 'ajuda' }, 'Ao recusar, o corretor recebe o motivo no WhatsApp e o botão Substituir no app.'));
}


// ---------- Convidar (forma principal de acesso) ----------
// A CCA escolhe quem convida e gera um link. A pessoa abre, preenche os próprios dados e cria a senha.
const estadoConvite = { tipo: null, imobiliaria_id: '' };
async function secaoConvites(ctx, recarregar) {
  const tipos = R.tiposDeConvite(ctx.perfil);
  if (!tipos.length) return [cabecalho('Convidar', 'Seu perfil não faz convites.')];
  if (!tipos.some(([t]) => t === estadoConvite.tipo)) estadoConvite.tipo = tipos[0][0];
  const [imobiliarias, convites] = await Promise.all([api.listarImobiliarias().catch(() => []), api.listarConvites().catch(() => [])]);
  const caixa = h('section', { class: 'cartao', style: { gap: '16px' } });
  const zap = h('aside', { class: 'zap', 'aria-label': 'Prévia da mensagem no WhatsApp' });
  const icones = { corretor: 'pessoa', imobiliaria: 'predio', equipe_cca: 'pessoas', admin: 'escudo' };
  let gerado = null; // { link, expira, nome, whatsapp, tipo }

  const desenharZap = (nomeAtual) => {
    limpar(zap);
    const dados = gerado || { nome: nomeAtual, tipo: estadoConvite.tipo, link: '🔗 o link aparece aqui quando você gerar o convite', expira: null };
    const texto = textoConvite(dados);
    const fone = R.soDigitos(gerado?.whatsapp || '');
    adicionar(zap,
      h('div', { class: 'zap-topo' }, h('span', { class: 'zap-icone' }, icone('conversa', { tam: 17, cor: '#FFFFFF', traco: 2.2 })), 'WhatsApp'),
      h('div', { class: 'zap-corpo' },
        gerado ? h('strong', { style: { fontSize: '14px', color: '#1C2B36' } }, 'Convite gerado. Mande pelo WhatsApp.') : h('span', { class: 'ajuda', style: { fontSize: '13px' } }, 'Prévia da mensagem'),
        h('div', { class: 'zap-balao balao' }, texto)),
      gerado ? h('div', { class: 'zap-acoes' },
        h('a', { class: 'btn btn-primario btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone ? (fone.startsWith('55') ? fone : `55${fone}`) : ''}?text=${encodeURIComponent(texto)}` }, 'Enviar pelo WhatsApp'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => {
          try { await navigator.clipboard.writeText(texto); toast('Mensagem com o convite copiada.'); } catch { toast('Não consegui copiar. Selecione o texto e copie.'); }
        } }, 'Copiar mensagem'))
        : h('div', { class: 'zap-acoes' }, h('div', { class: 'ajuda' }, 'Depois de gerar, o botão abre o WhatsApp com a mensagem pronta para a pessoa.')));
  };

  const desenhar = () => {
    limpar(caixa);
    const pilulas = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Quem você vai convidar' },
      tipos.map(([t, r]) => {
        const b = botaoOpcao(r, estadoConvite.tipo === t, () => { estadoConvite.tipo = t; gerado = null; desenhar(); }, 'pilula');
        b.prepend(icone(icones[t] || 'pessoa', { tam: 18 }));
        return b;
      }));
    const explica = {
      corretor: 'O corretor abre o link, preenche nome, e-mail e WhatsApp e cria a senha.',
      imobiliaria: 'O responsável abre o link, digita o CNPJ (o app busca os dados na Receita), preenche os dados dele e cria a senha. Ele entra como Documentação / gestor da imobiliária.',
      equipe_cca: 'A pessoa entra como Usuário da equipe da CCA, com as permissões que você marcar em Configurações.',
      admin: 'A pessoa entra como ADM e terá acesso a tudo.',
    }[estadoConvite.tipo];
    const nome = h('input', { id: 'cvl-nome', class: 'entrada', autocomplete: 'off', placeholder: 'Opcional', oninput: () => { if (!gerado) desenharZap(nome.value); } });
    const whats = h('input', { id: 'cvl-whats', class: 'entrada', inputmode: 'tel', placeholder: '(21) 90000-0000', oninput: (e) => { e.target.value = R.formatarCelular(e.target.value); } });
    const selImob = estadoConvite.tipo === 'corretor' ? h('select', { id: 'cvl-imob', class: 'entrada', onchange: (e) => { estadoConvite.imobiliaria_id = e.target.value; } },
      h('option', { value: '' }, 'Autônomo (sem imobiliária)'), imobiliarias.map((i) => h('option', { value: i.id, selected: i.id === estadoConvite.imobiliaria_id }, i.nome))) : null;
    const erro = h('div', { class: 'erro-campo', role: 'alert' });
    const botao = h('button', { type: 'button', class: 'btn btn-primario' }, 'Gerar convite');
    botao.onclick = async () => {
      erro.textContent = ''; gerado = null; desenharZap(nome.value);
      if (whats.value && R.soDigitos(whats.value).length < 10) { erro.textContent = 'WhatsApp incompleto.'; return; }
      botao.disabled = true; botao.textContent = 'Gerando…';
      try {
        const r = await api.gerarConvite({ tipo: estadoConvite.tipo, nome: nome.value.trim() || null, whatsapp: whats.value || null, imobiliaria_id: estadoConvite.tipo === 'corretor' ? (estadoConvite.imobiliaria_id || null) : null });
        gerado = { nome: nome.value, whatsapp: whats.value, link: r.link, tipo: estadoConvite.tipo, expira: r.expira_em };
        desenharZap();
        zap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) { erro.textContent = e.message; }
      botao.disabled = false; botao.textContent = 'Gerar convite';
    };
    adicionar(caixa,
      secaoTitulo('Novo convite', null, { pequeno: true }),
      h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, 'Quem você vai convidar?'), pilulas),
      h('div', { class: 'ajuda' }, explica),
      selImob ? h('div', { class: 'campo' }, h('label', { for: 'cvl-imob' }, 'Imobiliária do corretor'), selImob) : null,
      h('div', { class: 'campo' }, h('label', { for: 'cvl-nome' }, 'Nome (para a saudação)'), nome),
      h('div', { class: 'campo' }, h('label', { for: 'cvl-whats' }, 'WhatsApp de quem vai receber'), whats),
      erro, botao);
    desenharZap('');
  };
  desenhar();
  const situacao = (c) => c.usado_em ? h('span', { class: 'chip chip-aceito' }, `Usado em ${dataHora(c.usado_em)}`)
    : c.cancelado_em ? h('span', { class: 'chip' }, 'Cancelado')
    : new Date(c.expira_em) < new Date() ? h('span', { class: 'chip chip-alerta' }, 'Expirado')
    : h('span', { class: 'chip chip-em_conferencia' }, `Aguardando · vale até ${dataHora(c.expira_em)}`);
  const rotulo = Object.fromEntries([['corretor', 'Corretor'], ['imobiliaria', 'Imobiliária'], ['equipe_cca', 'Funcionário da CCA'], ['admin', 'Funcionário da CCA (ADM)']]);
  return [cabecalho('Convidar', 'Forma principal de acesso ao portal: gere o link e mande pelo WhatsApp. A pessoa preenche os próprios dados e cria a senha.'),
    h('div', { class: 'convite-grade' }, caixa, zap),
    secaoTitulo('Convites recentes', 'Situação de cada link enviado.'),
    tabela(['Para', 'Tipo', 'Criado', 'Situação', ''], convites.map((c) => [
      h('div', null, h('b', null, c.usado_nome || c.nome || 'Sem nome'), c.whatsapp ? h('div', { class: 'sub' }, R.formatarCelular(c.whatsapp)) : null),
      `${rotulo[c.tipo] || c.tipo}${c.imobiliaria_nome ? ` · ${c.imobiliaria_nome}` : ''}`,
      h('div', null, dataHora(c.criado_em), c.criado_por_nome ? h('div', { class: 'sub' }, `por ${c.criado_por_nome}`) : null),
      situacao(c),
      !c.usado_em && !c.cancelado_em && new Date(c.expira_em) > new Date()
        ? h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await api.cancelarConvite(c.id); toast('Convite cancelado. O link não funciona mais.'); recarregar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; }
        } }, 'Cancelar') : null,
    ]), 'Nenhum convite gerado ainda.')];
}

function textoConvite({ nome, link, tipo, expira }) {
  const quem = { corretor: 'como corretor', imobiliaria: 'para cadastrar a sua imobiliária', equipe_cca: 'na equipe da CCA', admin: 'na equipe da CCA' }[tipo] || '';
  const ola = nome && String(nome).trim() ? `${R.saudacao()}, ${R.primeiroNome(nome)}!` : `${R.saudacao()}!`;
  return `${ola} Você foi convidado(a) ${quem} no Portal do Corretor da Andrade Almeida CCA.\nToque no link, preencha os seus dados e crie a sua senha:\n${link}\n\n${expira ? `O convite vale até ${dataHora(expira)} e funciona uma vez só.` : 'O convite vale 7 dias e funciona uma vez só.'}`;
}

// ---------- Docs a conferir ----------
async function secaoDocs(lista, recarregar) {
  return [
    cabecalho('Documentos a conferir', 'Documentos novos ou substituídos aguardando conferência, do mais antigo para o mais novo.'),
    lista.length
      ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' } },
        lista.map((x) => blocoConferencia({ nome: x.tipo_nome, regra: x.regra, documento: x.documento, clienteNome: x.cliente_nome, aoTerminar: recarregar })))
      : h('div', { class: 'cartao' }, 'Nenhum documento aguardando conferência.'),
  ];
}

// ---------- Tabelas simples ----------
function tabela(colunas, linhas, vazio) {
  return h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela', style: { cursor: 'default' } },
    h('thead', null, h('tr', null, colunas.map((c) => h('th', null, c)))),
    h('tbody', null, linhas.length ? linhas.map((l) => h('tr', { style: { cursor: 'default' } }, l.map((v) => h('td', null, v ?? '—'))))
      : h('tr', null, h('td', { colspan: colunas.length, class: 'sub', style: { textAlign: 'center', padding: '30px' } }, vazio)))));
}

// ---------- Convites ----------
// Mostra o link gerado, com botão para mandar pelo WhatsApp e para copiar
function blocoLink({ nome, whatsapp, link, novo, email }) {
  const login = email ? `\nSeu login é o e-mail: ${email}` : '';
  const texto = `${R.saudacao()}, ${R.primeiroNome(nome || '')}! ${novo ? 'Aqui está seu novo link de acesso' : 'Seu cadastro no Portal do Corretor da Andrade Almeida CCA está pronto'}.${login}\nToque no link para criar sua senha:\n${link}\n\nO link vale por pouco tempo e funciona uma vez só. Se expirar, é só pedir outro.`;
  const fone = R.soDigitos(whatsapp || '');
  return h('div', { class: 'aviso aviso-azul', style: { flexDirection: 'column', gap: '10px', alignItems: 'stretch' } },
    h('strong', null, novo ? 'Novo link de acesso gerado.' : 'Cadastro criado. Mande a mensagem com o login e o link para criar a senha.'),
    h('div', { class: 'balao', style: { background: '#fff', wordBreak: 'break-word' } }, texto),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('a', { class: 'btn btn-primario btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone ? (fone.startsWith('55') ? fone : `55${fone}`) : ''}?text=${encodeURIComponent(texto)}` }, 'Enviar pelo WhatsApp'),
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => {
        try { await navigator.clipboard.writeText(texto); toast('Mensagem com o link copiada.'); } catch { toast('Não consegui copiar. Selecione o link e copie.'); }
      } }, 'Copiar mensagem')));
}

// Formulário de convite. papeis = [[valor, rótulo]]
function formConvite({ papeis, imobiliarias = [], titulo, aoConvidar }) {
  const st = { papel: papeis[0][0], imobiliaria_id: '' };
  const caixa = h('section', { class: 'cartao', style: { gap: '12px', maxWidth: '560px' } });
  const resultado = h('div');
  const campo = (id, rotulo, attrs = {}, formatar) => {
    const input = h('input', { id, class: 'entrada', autocomplete: 'off', ...attrs, oninput: formatar ? (e) => { e.target.value = formatar(e.target.value); } : null });
    return [input, h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input)];
  };
  const [nome, cNome] = campo('cv-nome', 'Nome completo');
  const [email, cEmail] = campo('cv-email', 'E-mail', { type: 'email', inputmode: 'email', autocapitalize: 'none' });
  const [whats, cWhats] = campo('cv-whats', 'WhatsApp', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular);
  const papelBox = h('div', { class: 'pilulas' });
  const selImob = h('select', { id: 'cv-imob', class: 'entrada', onchange: (e) => { st.imobiliaria_id = e.target.value; } },
    h('option', { value: '' }, 'Autônomo (sem imobiliária)'), imobiliarias.map((i) => h('option', { value: i.id }, i.nome)));
  const caixaImob = h('div', { class: 'campo' }, h('label', { for: 'cv-imob' }, 'Imobiliária'), selImob);
  const desenharPapel = () => {
    limpar(papelBox);
    papeis.forEach(([v, r]) => papelBox.appendChild(botaoOpcao(r, st.papel === v, () => { st.papel = v; desenharPapel(); }, 'pilula')));
    caixaImob.style.display = ['corretor', 'gestor_imobiliaria'].includes(st.papel) && imobiliarias.length >= 0 && papeis.some(([v]) => v === 'corretor') ? '' : 'none';
  };
  desenharPapel();
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { type: 'button', class: 'btn btn-primario' }, 'Cadastrar e gerar acesso');
  botao.onclick = async () => {
    erro.textContent = ''; limpar(resultado);
    if (nome.value.trim().split(/\s+/).length < 2) { erro.textContent = 'Digite o nome completo.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { erro.textContent = 'E-mail inválido.'; return; }
    botao.disabled = true; botao.textContent = 'Gerando…';
    try {
      const r = await api.convidar({ nome: nome.value.trim(), email: email.value.trim(), whatsapp: whats.value || null, papel: st.papel, imobiliaria_id: st.imobiliaria_id || null });
      resultado.appendChild(blocoLink({ nome: nome.value, whatsapp: whats.value, link: r.link, email: email.value.trim() }));
      aoConvidar?.();
    } catch (e) { erro.textContent = e.message; }
    botao.disabled = false; botao.textContent = 'Cadastrar e gerar acesso';
  };
  adicionar(caixa, secaoTitulo(titulo, null, { pequeno: true }), cNome, cEmail, cWhats,
    papeis.length > 1 ? h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '14px' } }, 'Perfil'), papelBox) : null,
    caixaImob, erro, botao,
    h('div', { class: 'ajuda' }, 'Forma secundária: a CCA preenche os dados. O app cria o acesso e prepara a mensagem com o login (o e-mail) e um link para a pessoa criar a própria senha. Por segurança, o app não manda senha pronta.'), resultado);
  return caixa;
}

function botaoNovoLink(u, onde) {
  const b = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Novo link de acesso');
  b.onclick = async () => {
    b.disabled = true;
    try { const r = await api.novoLink(u.email); limpar(onde); onde.appendChild(blocoLink({ nome: u.nome, whatsapp: u.whatsapp, link: r.link, novo: true, email: u.email })); }
    catch (e) { toast(e.message); }
    b.disabled = false;
  };
  return b;
}

function botaoAtivar(u, recarregar) {
  const ativo = u.ativo !== false;
  return h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno', onclick: async () => {
    try { await api.ativarUsuario(u.id, !ativo); toast(ativo ? `${u.nome} desativado(a).` : `${u.nome} reativado(a).`); recarregar(); } catch (e) { toast(e.message); }
  } }, ativo ? 'Desativar' : 'Reativar');
}

// Formulário de imobiliária (cadastro e edição). CNPJ obrigatório; dados buscados na Receita Federal.
function formImobiliaria({ inicial = {}, titulo, textoBotao, aoSalvar, aoCancelar, comResponsavel = false }) {
  const v = { ...inicial };
  const caixa = h('section', { class: 'cartao form-imob', style: { gap: '12px', maxWidth: '760px' } });
  const pref = `im-${inicial.id || 'nova'}-`;
  const entradas = {};
  const campo = (chave, rotulo, attrs = {}, formatar, larg) => {
    const id = pref + chave;
    const input = h('input', { id, class: 'entrada', autocomplete: 'off', value: formatar ? formatar(v[chave] || '') : (v[chave] || ''), ...attrs,
      oninput: (e) => { if (formatar) e.target.value = formatar(e.target.value); v[chave] = e.target.value; } });
    entradas[chave] = { input, formatar };
    return h('div', { class: 'campo', style: larg ? { gridColumn: larg } : null }, h('label', { for: id }, rotulo), input);
  };
  const preencher = (dados) => {
    for (const [k, val] of Object.entries(dados)) {
      if (!entradas[k] || val === undefined) continue;
      v[k] = val;
      entradas[k].input.value = entradas[k].formatar ? entradas[k].formatar(val || '') : (val || '');
    }
  };
  const info = h('div', { 'aria-live': 'polite' });
  const btnBuscar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Buscar na Receita');
  let ultimaBusca = '';
  const buscar = async () => {
    const d = R.soDigitos(v.cnpj);
    limpar(info);
    if (!R.cnpjValido(d)) { info.appendChild(aviso('laranja', 'CNPJ inválido. Confira os 14 números.')); return; }
    ultimaBusca = d;
    btnBuscar.disabled = true; btnBuscar.textContent = 'Buscando…';
    try {
      const r = await api.buscarCnpj(d);
      preencher({ razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, cep: r.cep, logradouro: r.logradouro, numero: r.numero,
        complemento: r.complemento, bairro: r.bairro, municipio: r.municipio, uf: r.uf, telefone: r.telefone, email: r.email });
      v.situacao_cadastral = r.situacao_cadastral; v.cnpj_consultado_em = new Date().toISOString();
      if (!v.nome?.trim()) preencher({ nome: r.nome_fantasia || r.razao_social });
      const ativa = /ativa/i.test(r.situacao_cadastral || '');
      info.appendChild(aviso(ativa ? 'azul' : 'laranja', h('strong', null, `Situação na Receita: ${r.situacao_cadastral || 'não informada'}. `),
        ativa ? 'Dados preenchidos. Confira e ajuste se precisar.' : 'Atenção: o CNPJ não está ativo na Receita.'));
    } catch (e) { info.appendChild(aviso('laranja', e.message)); }
    btnBuscar.disabled = false; btnBuscar.textContent = 'Buscar na Receita';
  };
  btnBuscar.onclick = buscar;
  const campoCnpj = campo('cnpj', 'CNPJ (obrigatório)', { inputmode: 'numeric', placeholder: '00.000.000/0000-00' }, R.formatarCnpj);
  entradas.cnpj.input.addEventListener('input', () => { const d = R.soDigitos(v.cnpj); if (d.length === 14 && d !== ultimaBusca && R.cnpjValido(d)) buscar(); });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  // Responsável (gestor) da imobiliária: opcional no cadastro manual; com ele, o app já gera o acesso
  const resp = { nome: '', email: '', whatsapp: '' };
  const temResp = () => !!(resp.nome.trim() || resp.email.trim() || resp.whatsapp.trim());
  const salvar = h('button', { type: 'button', class: 'btn btn-primario' }, textoBotao);
  const atualizarBotao = () => { if (comResponsavel) salvar.textContent = temResp() ? 'Cadastrar e gerar acesso' : textoBotao; };
  const campoResp = (chave, rotulo, attrs = {}, formatar) => {
    const id = pref + 'resp-' + chave;
    const input = h('input', { id, class: 'entrada', autocomplete: 'off', ...attrs,
      oninput: (e) => { if (formatar) e.target.value = formatar(e.target.value); resp[chave] = e.target.value; atualizarBotao(); } });
    return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input);
  };
  const resultado = h('div');
  salvar.onclick = async () => {
    erro.textContent = '';
    if (!R.cnpjValido(v.cnpj || '')) { erro.textContent = 'Informe um CNPJ válido. Ele é obrigatório.'; return; }
    if (!String(v.nome || '').trim()) { erro.textContent = 'Informe o nome da imobiliária (como aparece no app).'; return; }
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { erro.textContent = 'E-mail inválido.'; return; }
    if (comResponsavel && temResp()) {
      if (resp.nome.trim().split(/\s+/).length < 2) { erro.textContent = 'Digite o nome completo do responsável.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resp.email.trim())) { erro.textContent = 'E-mail do responsável inválido (vai ser o login dele).'; return; }
      if (resp.whatsapp && R.soDigitos(resp.whatsapp).length < 10) { erro.textContent = 'WhatsApp do responsável incompleto.'; return; }
    }
    salvar.disabled = true;
    try {
      const extra = await aoSalvar(v, comResponsavel && temResp() ? { nome: resp.nome.trim(), email: resp.email.trim(), whatsapp: resp.whatsapp || null } : null);
      if (extra) { salvar.style.display = 'none'; resultado.appendChild(extra); resultado.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    } catch (e) { erro.textContent = e.message; salvar.disabled = false; }
  };
  const grade = (...filhos) => h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' } }, ...filhos);
  adicionar(caixa, secaoTitulo(titulo, null, { pequeno: true }),
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' } }, h('div', { style: { flex: '1', minWidth: '200px' } }, campoCnpj), btnBuscar),
    h('div', { class: 'ajuda', style: { marginTop: '-4px' } }, 'Ao digitar o CNPJ, o app busca razão social, nome fantasia e endereço na Receita Federal.'),
    info,
    grade(campo('nome', 'Nome no app'), campo('razao_social', 'Razão social'), campo('nome_fantasia', 'Nome fantasia')),
    grade(campo('cep', 'CEP', { inputmode: 'numeric' }, (x) => R.soDigitos(x).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')), campo('logradouro', 'Logradouro'), campo('numero', 'Número')),
    grade(campo('complemento', 'Complemento'), campo('bairro', 'Bairro'), campo('municipio', 'Município'), campo('uf', 'UF', { maxlength: '2' }, (x) => x.toUpperCase())),
    grade(campo('telefone', 'Telefone', { inputmode: 'tel' }, R.formatarCelular), campo('email', 'E-mail', { type: 'email', inputmode: 'email', autocapitalize: 'none' }),
      campo('whatsapp', 'WhatsApp (avisos)', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular)),
    comResponsavel ? h('div', { style: { borderTop: '1px solid #EFECE6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('h3', { style: { fontSize: '16px', margin: '0' } }, 'Responsável pela imobiliária (opcional)'),
      h('div', { class: 'ajuda' }, 'Preenchendo, o app já cria o acesso dele como "Documentação / gestor da imobiliária" e prepara a mensagem com o login (e-mail) e o link para criar a senha. Os corretores você convida depois (menu Convidar) ou cadastra em Corretores.'),
      grade(campoResp('nome', 'Nome completo'), campoResp('email', 'E-mail (login)', { type: 'email', inputmode: 'email', autocapitalize: 'none' }),
        campoResp('whatsapp', 'WhatsApp', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular))) : null,
    erro,
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, salvar,
      aoCancelar ? h('button', { type: 'button', class: 'btn btn-secundario', onclick: aoCancelar }, 'Cancelar') : null),
    resultado);
  return caixa;
}

async function secaoImobiliarias(recarregar) {
  const lista = await api.listarImobiliarias();
  const areaEdicao = h('div');
  const editar = (i) => {
    limpar(areaEdicao);
    areaEdicao.appendChild(formImobiliaria({ inicial: i, titulo: `Editar: ${i.nome}`, textoBotao: 'Salvar alterações',
      aoSalvar: async (v) => { await api.atualizarImobiliaria(i.id, v); toast('Imobiliária atualizada.'); recarregar(); },
      aoCancelar: () => limpar(areaEdicao) }));
    areaEdicao.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const nova = formImobiliaria({ titulo: 'Dados da nova imobiliária', textoBotao: 'Cadastrar imobiliária', comResponsavel: true,
    aoSalvar: async (v, resp) => {
      const im = await api.criarImobiliaria(v);
      if (!resp) { toast('Imobiliária cadastrada. Agora convide os corretores dela.'); recarregar(); return null; }
      let r;
      try { r = await api.convidar({ ...resp, papel: 'gestor_imobiliaria', imobiliaria_id: im.id }); }
      catch (e) { toast(`Imobiliária cadastrada, mas o acesso do responsável falhou: ${e.message}. Cadastre-o em Corretores.`); recarregar(); return null; }
      toast('Imobiliária e acesso do responsável criados.');
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        blocoLink({ nome: resp.nome, whatsapp: resp.whatsapp, link: r.link, email: resp.email }),
        h('button', { type: 'button', class: 'btn btn-secundario', onclick: recarregar }, 'Concluir e atualizar a lista'));
    } });
  return [cabecalho('Imobiliárias', 'Imobiliárias parceiras com acesso ao portal.'),
    secaoTitulo('Imobiliárias cadastradas', `${lista.length} no total. Use Editar para completar ou corrigir os dados.`),
    h('div', { class: 'ajuda' }, 'Avisos vão para: escolha se os avisos da CCA (status, documento recusado, cadastro recebido) vão para o corretor do cliente, para o WhatsApp/equipe de documentação da imobiliária, ou para os dois.'),
    tabela(['Nome', 'CNPJ', 'WhatsApp da imobiliária', 'Avisos vão para', 'Situação', ''], lista.map((i) => {
      const st = { avisos_para: i.avisos_para || 'corretor' };
      const pilulas = h('div', { class: 'pilulas' });
      const desenhar = () => {
        limpar(pilulas);
        [['corretor', 'Corretor'], ['imobiliaria', 'Imobiliária'], ['ambos', 'Os dois']].forEach(([v, r]) => pilulas.appendChild(botaoOpcao(r, st.avisos_para === v, async () => {
          if (v !== 'corretor' && !i.whatsapp) toast('Cadastre o WhatsApp da imobiliária (ou um gestor de documentação) para ela receber os avisos.');
          try { await api.atualizarImobiliaria(i.id, { avisos_para: v }); st.avisos_para = v; desenhar(); toast(`${i.nome}: avisos vão para ${r.toLowerCase()}.`); } catch (e) { toast(e.message); }
        }, 'pilula')));
      };
      desenhar();
      return [
        h('div', null, h('b', null, i.nome), i.razao_social && i.razao_social !== i.nome ? h('div', { class: 'sub' }, i.razao_social) : null,
          i.municipio ? h('div', { class: 'sub' }, `${i.municipio}${i.uf ? ` / ${i.uf}` : ''}`) : null),
        i.cnpj ? h('div', null, R.formatarCnpj(i.cnpj), i.situacao_cadastral && !/ativa/i.test(i.situacao_cadastral) ? h('div', { class: 'sub', style: { color: '#8A4E12', fontWeight: '700' } }, `Receita: ${i.situacao_cadastral}`) : null)
          : h('span', { class: 'chip chip-alerta' }, 'Sem CNPJ'),
        i.whatsapp ? R.formatarCelular(i.whatsapp) : h('span', { class: 'sub' }, 'Não informado'),
        pilulas, i.ativo === false ? 'Inativa' : 'Ativa',
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'aria-label': `Editar ${i.nome}`, onclick: () => editar(i) }, 'Editar')];
    }), 'Nenhuma imobiliária cadastrada.'),
    areaEdicao,
    secaoTitulo('Cadastro manual', 'Forma secundária. O caminho principal é o menu Convidar.'),
    nova];
}

// Edição do corretor: nome, WhatsApp e imobiliária. O e-mail é o login e não muda aqui.
function formEditarCorretor(c, imobiliarias, recarregar, fechar) {
  const v = { nome: c.nome || '', whatsapp: c.whatsapp ? R.formatarCelular(c.whatsapp) : '', imobiliaria_id: c.imobiliaria_id || '' };
  const nome = h('input', { class: 'entrada', value: v.nome, 'aria-label': 'Nome completo', oninput: (e) => { v.nome = e.target.value; } });
  const whats = h('input', { class: 'entrada', value: v.whatsapp, inputmode: 'tel', 'aria-label': 'WhatsApp', oninput: (e) => { e.target.value = R.formatarCelular(e.target.value); v.whatsapp = e.target.value; } });
  const imob = h('select', { class: 'entrada', 'aria-label': 'Imobiliária', onchange: (e) => { v.imobiliaria_id = e.target.value; } },
    h('option', { value: '' }, 'Autônomo (sem imobiliária)'), imobiliarias.map((i) => h('option', { value: i.id, selected: i.id === v.imobiliaria_id }, i.nome)));
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar');
  salvar.onclick = async () => {
    erro.textContent = '';
    if (v.nome.trim().split(/\s+/).length < 2) { erro.textContent = 'Digite o nome completo.'; return; }
    if (v.whatsapp && R.soDigitos(v.whatsapp).length < 10) { erro.textContent = 'WhatsApp incompleto.'; return; }
    salvar.disabled = true;
    try { await api.atualizarCorretor(c.id, { nome: v.nome.trim(), whatsapp: v.whatsapp, imobiliaria_id: v.imobiliaria_id || null }); toast('Dados do corretor salvos.'); recarregar(); }
    catch (e) { erro.textContent = e.message; salvar.disabled = false; }
  };
  const rot = (t, el) => h('label', { class: 'campo', style: { gap: '4px' } }, h('span', { style: { fontSize: '13px', fontWeight: '600' } }, t), el);
  return h('div', { class: 'cartao', style: { gap: '10px', padding: '12px', marginTop: '6px' } },
    rot('Nome completo', nome), rot('WhatsApp', whats), rot('Imobiliária', imob),
    h('div', { class: 'ajuda' }, `E-mail de acesso: ${c.email || '—'} (não muda aqui; para trocar, convide de novo com o e-mail novo).`),
    erro, h('div', { style: { display: 'flex', gap: '6px' } }, salvar, h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno', onclick: fechar }, 'Cancelar')));
}

async function secaoCorretores(recarregar) {
  const [lista, imobiliarias] = await Promise.all([api.listarCorretores(), api.listarImobiliarias()]);
  const linhas = lista.map((c) => {
    const area = h('div');
    return [h('div', null, h('b', null, c.nome), c.papel === 'gestor_imobiliaria' ? h('div', { class: 'sub' }, 'Documentação / gestor da imobiliária') : null), c.imobiliaria_nome, c.email,
      c.whatsapp ? R.formatarCelular(c.whatsapp) : null, c.ativo === false ? h('span', { class: 'chip chip-alerta' }, 'Desativado') : 'Ativo',
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' } },
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'aria-label': `Editar ${c.nome}`, onclick: () => { limpar(area); area.appendChild(formEditarCorretor(c, imobiliarias, recarregar, () => limpar(area))); } }, 'Editar'),
          botaoNovoLink(c, area), botaoAtivar(c, recarregar)), area)];
  });
  return [cabecalho('Corretores', 'Corretores com acesso, por imobiliária ou autônomos. Para incluir alguém, o caminho principal é o menu Convidar.'),
    secaoTitulo('Corretores cadastrados', `${lista.length} no total. Use Editar para corrigir nome, WhatsApp ou imobiliária.`),
    tabela(['Nome', 'Imobiliária', 'E-mail', 'WhatsApp', 'Situação', 'Acesso'], linhas, 'Nenhum corretor cadastrado.'),
    secaoTitulo('Cadastro manual', 'Forma secundária. O caminho principal é o menu Convidar.'),
    formConvite({ titulo: 'Dados do novo corretor', papeis: [['corretor', 'Corretor'], ['gestor_imobiliaria', 'Documentação / gestor da imobiliária']], imobiliarias })];
}

// ---------- Base de vendedores ----------
const estadoVend = { busca: '', selecionado: null };
async function secaoVendedores(recarregar) {
  const lista = await api.listarVendedores();
  const lateral = h('aside', { class: 'lateral' });
  const corpoTabela = h('div');
  const desenhar = () => {
    const termo = R.soDigitos(estadoVend.busca) || estadoVend.busca.toLowerCase().trim();
    const vis = lista.filter((v) => !termo || v.nome.toLowerCase().includes(termo) || v.cpf_cnpj.includes(termo) || (v.empreendimento || '').toLowerCase().includes(termo) || (v.construtora_nome || '').toLowerCase().includes(termo));
    limpar(corpoTabela);
    corpoTabela.appendChild(h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Vendedor', 'CPF/CNPJ', 'Tipo', 'Processos', 'Documentos'].map((c) => h('th', null, c)))),
      h('tbody', null, vis.length ? vis.map((v) => h('tr', { class: estadoVend.selecionado === v.id ? 'selecionada' : '', onclick: () => { estadoVend.selecionado = v.id; desenhar(); desenharLateral(); } },
        h('td', null, h('b', null, v.nome), v.empreendimento ? h('div', { class: 'sub' }, v.empreendimento) : null),
        h('td', null, v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)),
        h('td', null, v.tipo === 'PF' ? 'Pessoa física' : v.pj_tipo === 'Empreendimento' ? 'Empreendimento (SPE)' : 'PJ avulso'),
        h('td', null, String(v.processos)),
        h('td', null, `${v.docs_aceitos} aceitos`, v.docs_conferencia ? h('div', null, h('span', { class: 'chip chip-em_conferencia' }, `${v.docs_conferencia} p/ conferir`)) : null,
          v.docs_recusados ? h('div', null, h('span', { class: 'chip chip-alerta' }, `${v.docs_recusados} recusado`)) : null)))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { textAlign: 'center', padding: '30px' } }, lista.length ? 'Nenhum vendedor encontrado.' : 'Nenhum vendedor cadastrado ainda. Eles entram aqui quando o corretor preenche a tela Vendedor.'))))));
  };
  const desenharLateral = async () => {
    limpar(lateral);
    if (!estadoVend.selecionado) { lateral.appendChild(h('div', { class: 'cartao' }, h('div', { class: 'subtitulo' }, 'Toque num vendedor para ver os dados, a conta, os documentos e os processos.'))); return; }
    lateral.appendChild(h('div', { class: 'cartao' }, 'Carregando…'));
    const { vendedor: v, documentos, clientes } = await api.obterVendedor(estadoVend.selecionado);
    const ed = { ...v };
    const campo = (chave, rotulo, attrs = {}) => h('div', { class: 'campo' }, h('label', { for: `vd-${chave}` }, rotulo),
      h('input', { id: `vd-${chave}`, class: 'entrada', value: ed[chave] || '', ...attrs, oninput: (e) => { ed[chave] = e.target.value; } }));
    const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar dados');
    salvar.onclick = async () => {
      salvar.disabled = true;
      try { await api.salvarVendedor(v.id, ed); toast('Dados do vendedor salvos.'); recarregar(); } catch (e) { toast(e.message); salvar.disabled = false; }
    };
    const tipoNome = (cod) => ctxConfig?.tipos.find((t) => t.codigo === cod)?.nome || cod;
    limpar(lateral);
    lateral.appendChild(h('div', { class: 'cartao', style: { gap: '14px' } },
      h('div', null, h('div', { class: 'subtitulo' }, v.tipo === 'PF' ? `CPF ${R.formatarCpf(v.cpf_cnpj)}` : `CNPJ ${R.formatarCnpj(v.cpf_cnpj)}`), h('h2', { class: 'secao-titulo', style: { marginTop: '4px' } }, v.nome)),
      campo('nome', v.tipo === 'PF' ? 'Nome completo' : 'Razão social'),
      v.tipo === 'PJ' && v.pj_tipo === 'Empreendimento' ? campo('empreendimento', 'Nome do empreendimento') : null,
      v.tipo === 'PF' ? h('div', { class: 'ajuda' }, `Estado civil: ${v.estado_civil || '—'}${v.estado_civil === 'Casado(a)' ? ` · Cônjuge: ${v.conjuge_nome || '—'} (CPF ${R.formatarCpf(v.conjuge_cpf || '')})` : ''}`) : null,
      secaoTitulo('Conta para recebimento', null, { pequeno: true, nivel: 'h3' }),
      campo('banco', 'Banco'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr 0.7fr', gap: '8px' } }, campo('agencia', 'Agência'), campo('operacao', 'Operação'), campo('conta', 'Conta'), campo('conta_digito', 'Dígito')),
      h('div', null, salvar),
      h('div', { style: { borderTop: '1px solid #EFECE6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { class: 'rotulo' }, `Documentos (${documentos.length})`),
        documentos.length ? documentos.map((d) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' } },
          h('span', { style: { flex: '1', minWidth: '160px' } }, tipoNome(d.tipo_codigo), d.versao > 1 ? h('span', { class: 'sub' }, ` · versão ${d.versao}`) : null), chipSituacao(d.situacao),
          h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${tipoNome(d.tipo_codigo)}`, onclick: () => abrirDoc(d) }, icone('olho', { tam: 18 })),
          h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${tipoNome(d.tipo_codigo)}`, onclick: () => abrirDoc(d, true) }, icone('baixar', { tam: 18 }))))
          : h('div', { class: 'subtitulo' }, 'Nenhum documento ainda.'),
        documentos.some((d) => d.situacao === 'em_conferencia') && R.pode(perfilPainel, 'conferir_documentos') ? h('a', { href: '#/painel/docs' }, 'Conferir em "Docs a conferir"') : null),
      h('div', { style: { borderTop: '1px solid #EFECE6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { class: 'rotulo' }, `Processos com este vendedor (${clientes.length})`),
        clientes.map((c) => h('div', { style: { fontSize: '14px' } }, h('b', null, c.nome), ` · ${R.nomeStatus(c.status)} · corretor ${c.corretor?.nome || '—'}`)))));
  };
  const busca = h('input', { id: 'v-busca', type: 'search', class: 'entrada', placeholder: 'Nome, CPF/CNPJ, empreendimento ou construtora', value: estadoVend.busca, style: { width: '320px', maxWidth: '100%' },
    oninput: (e) => { estadoVend.busca = e.target.value; desenhar(); } });
  desenhar();
  await desenharLateral(); // monta o cliente selecionado antes de trocar a tela (não pula ao salvar)
  return [
    cabecalho('Vendedores', 'Base interna da CCA: cada vendedor tem um cadastro só, com documentos e conta, usado em todos os processos.', h('div', null, h('label', { for: 'v-busca', class: 'sr' }, 'Buscar vendedor'), busca)),
    h('div', { class: 'painel-colunas' }, h('div', { class: 'principal' }, corpoTabela), lateral),
  ];
}

async function secaoMensagens() {
  const lista = await api.listarMensagens();
  const tipo = { confirmacao: 'Cadastro recebido', status: 'Status', pendencia: 'Lembrete de documento', recusa: 'Recusa', convite: 'Link de acesso', conversa: 'Conversa', ia_alerta: 'Alerta da IA' };
  return [cabecalho('Mensagens', 'Avisos automáticos aos corretores e imobiliárias: WhatsApp (21) 99812-4395 ou notificação do app, e também por e-mail se estiver ligado em Configurações.'),
    tabela(['Quando', 'Para', 'Cliente', 'Tipo', 'Canal', 'Mensagem', 'Situação'], lista.map((m) => [dataHora(m.criada_em), m.destino_nome || (m.telefone ? R.formatarCelular(m.telefone) : 'Imobiliária'), m.cliente_nome, tipo[m.tipo] || m.tipo,
      m.canal === 'whatsapp' ? 'WhatsApp' : m.canal === 'push' ? 'Notificação' : m.canal === 'email' ? 'E-mail' : '—',
      h('div', { style: { whiteSpace: 'pre-line', maxWidth: '420px' } }, m.texto),
      m.situacao === 'erro' ? h('div', null, h('span', { class: 'chip chip-alerta' }, 'Não enviada'), m.erro ? h('div', { class: 'sub', style: { maxWidth: '220px' } }, m.erro) : null)
        : m.situacao === 'na_fila' ? 'Na fila' : 'Enviada']), 'Nenhuma mensagem ainda.')];
}

async function secaoAcessos() {
  const lista = await api.listarAcessos();
  const acao = { login: 'Entrou no sistema', ver_cliente: 'Abriu ficha', baixar_documento: 'Baixou documento', ver_documento: 'Viu documento', mudar_status: 'Mudou status',
    conferir_documento: 'Conferiu documento', alterar_usuario: 'Alterou usuário', alterar_parametro: 'Alterou parâmetro' };
  const detalhe = (a) => a.detalhes?.para ? `${R.nomeStatus(a.detalhes.de)} → ${R.nomeStatus(a.detalhes.para)}`
    : a.detalhes?.motivo ? `Recusado: ${a.detalhes.motivo}` : a.detalhes?.aceito ? 'Aceito'
    : a.detalhes?.chave ? `${a.detalhes.chave} = ${a.detalhes.valor}` : a.acao === 'alterar_usuario' ? `Perfil: ${a.detalhes?.papel === 'admin' ? 'ADM' : 'Usuário'}${a.detalhes?.ativo === false ? ' (desativado)' : ''}` : '';
  return [cabecalho('Registro de acessos', 'Quem entrou no sistema, viu ou alterou dados de clientes (LGPD).'),
    tabela(['Quando', 'Usuário', 'Imobiliária', 'Ação', 'Cliente', 'Detalhes'], lista.map((a) => [dataHora(a.em), h('b', null, a.usuario_nome || '—'), a.imobiliaria_nome,
      acao[a.acao] || a.acao, a.cliente_nome, detalhe(a)]), 'Nenhum acesso registrado.')];
}

// ---------- Avisos aos corretores (ADM) ----------
async function blocoAvisos(ctx, parametros) {
  const canalAtual = parametros.find((p) => p.chave === 'canal_avisos')?.valor || 'push';
  const st = { canal: canalAtual, email: parametros.find((p) => p.chave === 'email_avisos')?.valor === 'sim' };
  const integ = await api.integracoes().catch(() => []);
  const conf = (k) => integ.find((i) => i.chave === k);
  const caixa = h('section', { class: 'cartao', style: { gap: '14px', maxWidth: '760px' } });
  const saida = h('div');
  const mostrar = (titulo, conteudo, tipo = 'azul') => { limpar(saida); saida.appendChild(h('div', { class: `aviso aviso-${tipo}`, style: { flexDirection: 'column', gap: '6px', alignItems: 'stretch' } }, h('strong', null, titulo), conteudo)); };
  const acao = (rotulo, fn, classe = 'btn-contorno') => {
    const b = h('button', { type: 'button', class: `btn ${classe} btn-pequeno` }, rotulo);
    b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { mostrar('Não deu certo', e.message, 'laranja'); } b.disabled = false; };
    return b;
  };
  const listaModelos = (r) => h('div', null,
    (r.criacao || []).length ? h('div', { class: 'ajuda' }, r.criacao.map((c) => `${c.nome}: ${c.ok ? 'enviado para aprovação' : c.erro}`).join(' · ')) : null,
    (r.modelos || []).length ? h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, r.modelos.map((m) => h('li', null, `${m.nome}: `,
      h('b', null, { APPROVED: 'Aprovado', PENDING: 'Em análise na Meta', REJECTED: 'Recusado', PAUSED: 'Pausado', DISABLED: 'Desativado' }[m.situacao] || m.situacao),
      m.motivo ? ` (${m.motivo})` : ''))) : h('div', { class: 'ajuda' }, 'Nenhum modelo "cca_" encontrado ainda.'));

  const campoInteg = (chave, rotulo, ajuda, tipo = 'text', exemplo = '') => {
    const c = conf(chave);
    const secreto = ['meta_token', 'smtp_senha'].includes(chave);
    const input = h('input', { id: `int-${chave}`, class: 'entrada', type: tipo, autocomplete: tipo === 'password' ? 'new-password' : 'off', placeholder: c?.configurado ? (chave === 'meta_token' ? `Configurado (${c.final})` : secreto ? 'Senha guardada' : c.final) : (exemplo || '') });
    const salvar = acao('Salvar', async () => {
      if (!input.value.trim()) throw new Error('Preencha antes de salvar.');
      await api.salvarIntegracao(chave, input.value.trim());
      const item = integ.find((x) => x.chave === chave); if (item) item.configurado = true;
      input.placeholder = chave === 'meta_token' ? `Configurado (…${input.value.trim().slice(-4)})` : secreto ? 'Senha guardada' : input.value.trim();
      input.value = '';
      mostrar('Salvo.', `${rotulo} guardado com segurança. Ninguém consegue ler pelo app.`);
    });
    return h('div', { class: 'campo' }, h('label', { for: `int-${chave}` }, rotulo, c?.configurado ? h('span', { class: 'chip chip-aceito', style: { marginLeft: '8px' } }, 'Configurado') : null),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, salvar), h('span', { class: 'ajuda' }, ajuda));
  };

  const desenhar = () => {
    limpar(caixa);
    const pilulas = h('div', { class: 'pilulas' },
      botaoOpcao('WhatsApp – API Meta (com custo)', st.canal === 'whatsapp', async () => {
        try { await api.salvarParametro('canal_avisos', 'whatsapp'); st.canal = 'whatsapp'; ctx.config = await api.configuracao(); desenhar(); toast('Avisos agora saem pelo WhatsApp.'); } catch (e) { toast(e.message); }
      }, 'pilula'),
      botaoOpcao('Notificação do app – Push (sem custo)', st.canal === 'push', async () => {
        try { await api.salvarParametro('canal_avisos', 'push'); st.canal = 'push'; ctx.config = await api.configuracao(); desenhar(); toast('Avisos agora saem como notificação do app.'); } catch (e) { toast(e.message); }
      }, 'pilula'));
    adicionar(caixa,
      secaoTitulo('Avisos aos corretores', null, { pequeno: true }),
      h('div', { class: 'ajuda' }, 'Cadastro recebido, mudança de status, documento recusado e link de acesso. Quem recebe (corretor, imobiliária ou os dois) é escolhido em Imobiliárias.'),
      pilulas,
      st.canal === 'whatsapp'
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h('div', { class: 'ajuda' }, 'Número (21) 99812-4395 (API oficial da Meta). Cerca de 5 centavos por aviso; grátis se o corretor escreveu nas últimas 24 horas. Os dados abaixo são os mesmos usados no robô do Grupo.'),
          campoInteg('meta_phone_id', 'ID do número de telefone (Phone Number ID)', 'No Gerenciador do WhatsApp / app da Meta: WhatsApp → Configuração da API.'),
          campoInteg('meta_waba_id', 'ID da conta do WhatsApp Business (WABA ID)', 'Na mesma tela, logo acima do ID do número.'),
          campoInteg('meta_token', 'Token permanente', 'O mesmo token permanente do robô. Fica guardado no servidor; não aparece de novo.', 'password'),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            acao('1. Criar os modelos na Meta', async () => { const r = await api.avisosAdmin('criar_modelos'); mostrar('Modelos enviados para aprovação da Meta.', listaModelos(r)); }, 'btn-primario'),
            acao('2. Ver situação dos modelos', async () => { const r = await api.avisosAdmin('modelos'); mostrar('Situação dos modelos', listaModelos(r)); }),
            acao('3. Enviar teste para meu WhatsApp', async () => { const r = await api.avisosAdmin('testar', { canal: 'whatsapp' }); mostrar('Teste enviado', r.detalhe); })),
          h('div', { class: 'ajuda' }, 'O teste só funciona depois que a Meta aprovar os modelos (costuma levar de minutos a algumas horas). Seu WhatsApp é o do seu cadastro.'))
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          h('div', { class: 'ajuda' }, 'Sem custo. O corretor toca em "Ativar avisos neste celular" na tela inicial do app. No iPhone, o app precisa estar na tela de início.'),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            notificacoesAtivas() ? null : acao('Ativar notificações neste aparelho', async () => { await ativarNotificacoes(ctx.config.parametros.vapid_publica); mostrar('Notificações ativadas neste aparelho.', 'Agora envie um teste.'); }),
            acao('Enviar notificação de teste para mim', async () => { const r = await api.avisosAdmin('testar', { canal: 'push' }); mostrar('Teste enviado', r.detalhe); }))),
      // Também por e-mail (além do canal acima)
      h('div', { class: 'bloco-secao divisor' },
        secaoTitulo('Também por e-mail', 'Os mesmos avisos vão para o e-mail do corretor (e da imobiliária, quando ela recebe os avisos), com botões para abrir o Portal, falar no WhatsApp da CCA ou responder por e-mail. Sai pela caixa da CCA na Titan, sem custo.', { pequeno: true, nivel: 'h3' }),
        h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Avisos por e-mail' },
          botaoOpcao('Ligado', st.email, async () => {
            try { await api.salvarParametro('email_avisos', 'sim'); st.email = true; ctx.config = await api.configuracao(); desenhar(); toast('Avisos por e-mail ligados.'); } catch (e) { toast(e.message); }
          }, 'pilula'),
          botaoOpcao('Desligado', !st.email, async () => {
            try { await api.salvarParametro('email_avisos', 'nao'); st.email = false; ctx.config = await api.configuracao(); desenhar(); toast('Avisos por e-mail desligados.'); } catch (e) { toast(e.message); }
          }, 'pilula')),
        campoInteg('smtp_usuario', 'E-mail que envia os avisos', 'A caixa criada na Titan (HostGator). Quando o corretor responde o e-mail, a resposta volta para essa mesma caixa: passe o acesso dela para a equipe.', 'email', 'avisos@andradealmeidacca.com.br'),
        campoInteg('smtp_senha', 'Senha desse e-mail', 'A mesma senha usada para entrar nessa caixa na Titan. Fica guardada no servidor e não aparece de novo.', 'password'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          acao('Enviar e-mail de teste para mim', async () => { const r = await api.avisosAdmin('testar', { canal: 'email' }); mostrar('Teste enviado', r.detalhe); })),
        st.email && !(conf('smtp_usuario')?.configurado && conf('smtp_senha')?.configurado)
          ? aviso('laranja', 'Ligado, mas ainda sem e-mail e senha: os avisos por e-mail começam a sair assim que você salvar os dois acima.') : null),
      saida);
  };
  desenhar();
  return caixa;
}

// ---------- Processo parado e lembrete de documento (ADM) ----------
const CHAVES_ALERTAS = ['dias_alerta_parado', 'lembrete_docs', 'dias_lembrete_docs'];
function blocoAlertas(ctx, parametros) {
  const valor = (k) => parametros.find((p) => p.chave === k)?.valor ?? String(R.PARAMETROS_PADRAO[k]);
  const st = { lembrete: valor('lembrete_docs') !== 'nao' };
  const caixa = h('section', { class: 'cartao', style: { gap: '14px', maxWidth: '760px' } });
  const campoDias = (chave, rotulo, ajuda) => {
    const input = h('input', { id: `al-${chave}`, class: 'entrada', type: 'number', min: 1, max: 60, inputmode: 'numeric', value: valor(chave), style: { maxWidth: '110px' } });
    const salvar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Salvar');
    salvar.onclick = async () => {
      const n = Math.round(Number(input.value));
      if (!(n >= 1 && n <= 60)) return toast('Use um número de 1 a 60 dias.');
      salvar.disabled = true;
      try { await api.salvarParametro(chave, n); const p = parametros.find((x) => x.chave === chave); if (p) p.valor = String(n); ctx.config = await api.configuracao(); toast('Salvo.'); }
      catch (e) { toast(e.message); }
      salvar.disabled = false;
    };
    return h('div', { class: 'campo' }, h('label', { for: `al-${chave}` }, rotulo),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, h('span', null, 'dias'), salvar), h('span', { class: 'ajuda' }, ajuda));
  };
  const desenhar = () => {
    limpar(caixa);
    adicionar(caixa,
      secaoTitulo('Processo parado e lembretes', null, { pequeno: true }),
      campoDias('dias_alerta_parado', 'Marcar como parado depois de', 'Cliente que fica esse tempo no mesmo status ganha a etiqueta "Parado há N dias" na lista e no quadro, e entra no filtro "Parados". Contrato assinado não conta.'),
      h('div', { class: 'bloco-secao divisor' },
        secaoTitulo('Lembrete automático de documento obrigatório (**)', 'Uma vez por dia o sistema confere os clientes que ainda não podem ir para análise e lembra o corretor (notificação e e-mail) do que falta.', { pequeno: true, nivel: 'h3' }),
        h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Lembrete automático' },
          ['Ligado', 'Desligado'].map((nome) => botaoOpcao(nome, st.lembrete === (nome === 'Ligado'), async () => {
            const sim = nome === 'Ligado';
            try { await api.salvarParametro('lembrete_docs', sim ? 'sim' : 'nao'); st.lembrete = sim; const p = parametros.find((x) => x.chave === 'lembrete_docs'); if (p) p.valor = sim ? 'sim' : 'nao'; desenhar(); toast(sim ? 'Lembretes ligados.' : 'Lembretes desligados.'); }
            catch (e) { toast(e.message); }
          }, 'pilula'))),
        st.lembrete ? campoDias('dias_lembrete_docs', 'Lembrar de novo a cada', 'O primeiro lembrete sai depois desse prazo, contado do envio do cadastro.') : null));
  };
  desenhar();
  return caixa;
}

// ---------- Pré-conferência por IA (ADM) ----------
async function blocoIa(ctx, parametros) {
  const valor = (k, padrao) => parametros.find((p) => p.chave === k)?.valor ?? padrao;
  const st = { ligado: valor('ia_conferencia', 'sim') !== 'nao' };
  const [integ, uso] = await Promise.all([api.integracoes().catch(() => []), api.iaUsoMes().catch(() => null)]);
  const chave = integ.find((i) => i.chave === 'anthropic_chave');
  const caixa = h('section', { class: 'cartao', style: { gap: '14px', maxWidth: '760px' } });
  const saida = h('div');
  const mostrar = (titulo, texto, tipo = 'azul') => { limpar(saida); saida.appendChild(aviso(tipo, h('strong', null, titulo), ' ', texto)); };
  const dolar = (n) => `US$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
  const desenhar = () => {
    limpar(caixa);
    const input = h('input', { id: 'ia-chave', class: 'entrada', type: 'password', autocomplete: 'new-password', placeholder: chave?.configurado ? `Configurada (${chave.final})` : 'sk-ant-…' });
    const salvar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Salvar');
    salvar.onclick = async () => {
      const v = input.value.trim();
      if (!v) return toast('Cole a chave antes de salvar.');
      if (!/^sk-ant-/.test(v)) return toast('A chave da Anthropic começa com "sk-ant-". Confira se copiou inteira.');
      salvar.disabled = true;
      try {
        await api.salvarIntegracao('anthropic_chave', v);
        if (chave) Object.assign(chave, { configurado: true, final: `…${v.slice(-4)}` }); else integ.push({ chave: 'anthropic_chave', configurado: true, final: `…${v.slice(-4)}` });
        desenhar(); mostrar('Chave guardada.', 'Fica no servidor e ninguém consegue ler pelo app. Agora toque em "Testar a chave".');
      } catch (e) { toast(e.message); salvar.disabled = false; }
    };
    const testar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Testar a chave');
    testar.onclick = async () => {
      testar.disabled = true;
      try { const r = await api.iaAdmin('testar'); mostrar('Tudo certo.', r.detalhe); } catch (e) { mostrar('Não deu certo.', e.message, 'laranja'); }
      testar.disabled = false;
    };
    const ativa = chave?.configurado;
    const limite = h('input', { id: 'ia-limite', class: 'entrada', type: 'number', min: 10, max: 100000, inputmode: 'numeric', value: valor('ia_limite_mes', '3000'), style: { maxWidth: '130px' } });
    const salvarLimite = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Salvar');
    salvarLimite.onclick = async () => {
      const n = Math.round(Number(limite.value));
      if (!(n >= 10)) return toast('Use um número a partir de 10.');
      try { await api.salvarParametro('ia_limite_mes', n); const p = parametros.find((x) => x.chave === 'ia_limite_mes'); if (p) p.valor = String(n); toast('Limite salvo.'); } catch (e) { toast(e.message); }
    };
    adicionar(caixa,
      secaoTitulo('Pré-conferência de documentos por IA', null, { pequeno: true }),
      h('div', { class: 'ajuda' }, 'Quando um documento chega, a IA (Claude, da Anthropic) olha o arquivo e sugere: parece certo, conferir com atenção ou possível problema (documento errado, ilegível, cortado, vencido ou de outra pessoa). A sugestão aparece na hora de conferir, com o motivo da recusa já marcado. Se o problema for claro, o corretor é avisado para trocar o arquivo. A decisão final é sempre da equipe.'),
      h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Pré-conferência por IA' },
        ['Ligado', 'Desligado'].map((nome) => botaoOpcao(nome, st.ligado === (nome === 'Ligado'), async () => {
          const sim = nome === 'Ligado';
          try { await api.salvarParametro('ia_conferencia', sim ? 'sim' : 'nao'); st.ligado = sim; const p = parametros.find((x) => x.chave === 'ia_conferencia'); if (p) p.valor = sim ? 'sim' : 'nao'; ctx.config = await api.configuracao(); desenhar(); toast(sim ? 'Pré-conferência ligada.' : 'Pré-conferência desligada.'); }
          catch (e) { toast(e.message); }
        }, 'pilula'))),
      h('div', { class: 'campo' }, h('label', { for: 'ia-chave' }, 'Chave da API da Anthropic', ativa ? h('span', { class: 'chip chip-aceito', style: { marginLeft: '8px' } }, 'Configurada') : null),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, salvar),
        h('span', { class: 'ajuda' }, 'Crie em console.anthropic.com → API Keys. Cole aqui (não mande por WhatsApp nem e-mail). Fica guardada no servidor e não aparece de novo.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ativa ? testar : null),
      st.ligado && !ativa ? aviso('laranja', 'Ligado, mas ainda sem chave: a pré-conferência começa assim que você salvar a chave.') : null,
      h('div', { class: 'bloco-secao divisor' },
        secaoTitulo('Uso e custo neste mês', null, { pequeno: true, nivel: 'h3' }),
        uso ? h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', null, uso.documentos), h('span', null, 'documentos analisados')),
          h('div', { class: 'kpi' }, h('b', null, dolar(uso.custo_usd)), h('span', null, 'custo estimado')),
          uso.erros ? h('div', { class: 'kpi laranja' }, h('b', null, uso.erros), h('span', null, 'falhas')) : null) : h('div', { class: 'ajuda' }, 'Sem uso ainda.'),
        h('div', { class: 'campo' }, h('label', { for: 'ia-limite' }, 'Limite de documentos por mês'),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, limite, h('span', null, 'documentos'), salvarLimite),
          h('span', { class: 'ajuda' }, 'Proteção de custo: depois do limite, a IA para até o mês seguinte e a equipe confere normalmente. Cada documento custa em média menos de 1 centavo de real.'))),
      saida);
  };
  desenhar();
  return caixa;
}

async function secaoConfig(ctx, recarregar) {
  const config = ctx.config;
  if (ctx.perfil.papel !== 'admin') return [cabecalho('Configurações', 'Somente o perfil ADM acessa as configurações.')];
  const [equipe, parametros] = await Promise.all([api.listarEquipe(), api.listarParametros()]);

  // Usuários da equipe: perfil ADM ou Usuário, ativo e permissões
  const linhaUsuario = (u) => {
    const st = { papel: u.papel, ativo: u.ativo !== false, permissoes: { ...(u.permissoes || {}) } };
    const eu = u.id === ctx.perfil.id;
    const caixa = h('div', { class: 'cartao', style: { gap: '12px' } });
    const desenhar = () => {
      limpar(caixa);
      const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar');
      salvar.onclick = async () => {
        salvar.disabled = true;
        try { await api.atualizarUsuario(u.id, st); toast(`${u.nome}: alterações salvas.`); recarregar(); }
        catch (e) { toast(e.message); salvar.disabled = false; }
      };
      adicionar(caixa,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          h('div', null, h('div', { style: { fontWeight: '800', fontSize: '16px' } }, u.nome, eu ? ' (você)' : ''), h('div', { class: 'subtitulo' }, u.email || '')),
          h('div', { class: 'pilulas' },
            botaoOpcao('ADM', st.papel === 'admin', () => { if (!eu) { st.papel = 'admin'; desenhar(); } }, 'pilula'),
            botaoOpcao('Usuário', st.papel === 'equipe_cca', () => { if (eu) return toast('Você não pode tirar o seu próprio perfil de ADM.'); st.papel = 'equipe_cca'; desenhar(); }, 'pilula'),
            botaoOpcao(st.ativo ? 'Ativo' : 'Desativado', st.ativo, () => { if (eu) return toast('Você não pode desativar o seu próprio acesso.'); st.ativo = !st.ativo; desenhar(); }, 'pilula'))),
        st.papel === 'admin'
          ? h('div', { class: 'ajuda' }, 'ADM tem acesso a tudo, inclusive configurações, usuários e parâmetros.')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            secaoTitulo('O que este usuário pode fazer', null, { pequeno: true, nivel: 'h3' }),
            ...R.PERMISSOES.map(([chave, nome]) => {
              const id = `perm-${u.id}-${chave}`;
              const marcado = R.permissaoMarcada(st.permissoes, chave);
              return h('label', { for: id, style: { display: 'flex', gap: '10px', alignItems: 'center', fontSize: '15px', minHeight: '32px' } },
                h('input', { id, type: 'checkbox', checked: marcado, style: { width: '20px', height: '20px', accentColor: '#3D657C' },
                  onchange: (e) => { st.permissoes[chave] = e.target.checked; } }), nome);
            })),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, salvar, eu ? null : botaoNovoLink(u, areaLink)), areaLink);
    };
    const areaLink = h('div');
    desenhar();
    return caixa;
  };

  // Parâmetros (limites do MCMV, IR, prazo e idade)
  const linhaParametro = (p) => {
    const input = h('input', { class: 'entrada', value: p.valor, style: { maxWidth: '180px' }, 'aria-label': p.chave });
    const salvar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Salvar');
    salvar.onclick = async () => {
      salvar.disabled = true;
      try { await api.salvarParametro(p.chave, input.value.trim()); toast('Parâmetro salvo. Vale para os próximos cadastros.'); ctx.config = await api.configuracao(); }
      catch (e) { toast(e.message); }
      salvar.disabled = false;
    };
    return [h('b', null, p.descricao || p.chave), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, salvar)];
  };

  return [cabecalho('Configurações', 'Perfil ADM: avisos, usuários da equipe, permissões e regras do cadastro.'),
    await blocoAvisos(ctx, parametros),
    blocoAlertas(ctx, parametros),
    await blocoIa(ctx, parametros),
    secaoTitulo('Usuários da equipe CCA'),
    h('div', { class: 'ajuda' }, 'ADM (ex.: Bené e Suzana) acessa tudo. Usuário (ex.: Gabriel) faz só o que estiver marcado e não vê as configurações. Para incluir alguém, use o menu Convidar (ou o cadastro manual abaixo).'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' } }, equipe.map(linhaUsuario)),
    formConvite({ titulo: 'Cadastrar pessoa da equipe manualmente', papeis: [['equipe_cca', 'Usuário'], ['admin', 'ADM']] }),
    secaoTitulo('Parâmetros do cadastro'),
    tabela(['Parâmetro', 'Valor'], parametros.filter((p) => !['canal_avisos', 'url_app', 'vapid_publica', 'email_avisos', 'smtp_servidor', 'smtp_porta', 'email_responder_para', 'ia_conferencia', 'ia_limite_mes', ...CHAVES_ALERTAS].includes(p.chave)).map(linhaParametro), 'Nenhum parâmetro.'),
    secaoTitulo('Documentos e regra dos asteriscos'),
    tabela(['Documento', 'Grupo', 'Regra', 'Quando é pedido'], config.tipos.map((t) => [h('b', null, t.nome), t.grupo,
      t.regra === '**' ? h('span', { class: 'marca-forte' }, '** bloqueia análise') : t.regra === '*' ? '* pode vir depois' : 'comum',
      (t.condicao || []).length ? t.condicao.map((c) => Object.entries(c).map(([k, v]) => `${k.replaceAll('_', ' ')}: ${v === true ? 'sim' : v === false ? 'não' : v}`).join(', ')).join(' ou ') : 'Sempre']), ''),
    secaoTitulo('Opções do cadastro'),
    tabela(['Campo', 'Opções'], Object.entries(config.opcoes).map(([k, v]) => [h('b', null, k.replace('_', ' ')), v.join(' · ')]), '')];
}
