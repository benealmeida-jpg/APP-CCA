// Painel da equipe da CCA (computador e celular).
import { h, limpar, icone, toast, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { botaoOpcao, marcaRegra, chipSituacao, abrirDoc, dataHora } from './componentes.js';

const MENU = [
  ['clientes', 'Clientes', 'pessoas'],
  ['docs', 'Docs a conferir', 'docCheck'],
  ['imobiliarias', 'Imobiliárias', 'predio'],
  ['corretores', 'Corretores', 'pessoa'],
  ['mensagens', 'Mensagens', 'conversa'],
  ['acessos', 'Acessos', 'escudo'],
  ['config', 'Configurações', 'engrenagem'],
];

const estado = { filtro: 'todos', busca: '', selecionado: null, novoStatus: null, avisar: true, recusa: {} };

export async function telaPainel(secao, ctx) {
  const paraConferir = await api.listarDocsParaConferir();
  const corpo = h('main', { class: 'painel-corpo' });
  const recarregar = async () => {
    const nova = await telaPainel(secao, ctx);
    const atual = document.querySelector('.painel');
    atual?.replaceWith(nova);
  };

  const conteudo = {
    clientes: () => secaoClientes(ctx, paraConferir, recarregar),
    docs: () => secaoDocs(paraConferir, recarregar),
    imobiliarias: secaoImobiliarias,
    corretores: secaoCorretores,
    mensagens: secaoMensagens,
    acessos: secaoAcessos,
    config: () => secaoConfig(ctx.config),
  }[secao] || (() => secaoClientes(ctx, paraConferir, recarregar));
  adicionar(corpo, ...[].concat(await conteudo()));

  return h('div', { class: 'painel' },
    h('nav', { class: 'painel-topo', 'aria-label': 'Menu da equipe' },
      h('div', { class: 'marca-topo', style: { gap: '10px' } },
        h('div', { class: 'monograma' }, 'AA'),
        h('div', null, h('div', { style: { fontWeight: '700' } }, 'andrade almeida'), h('div', { style: { fontSize: '12px', color: '#C4C5BF' } }, `CCA · ${ctx.perfil.nome}`))),
      h('div', { class: 'menu-botoes' },
        MENU.map(([cod, nome, ic]) => h('a', { href: `#/painel/${cod}`, class: secao === cod ? 'ativo' : '', 'aria-current': secao === cod ? 'page' : null },
          icone(ic, { cor: secao === cod ? '#FFFFFF' : '#E4E1DA' }), nome,
          cod === 'docs' && paraConferir.length ? h('span', { class: 'num' }, paraConferir.length) : null)),
        h('a', { href: '#/entrar', onclick: (e) => { e.preventDefault(); ctx.sair(); } }, icone('sair', { cor: '#E4E1DA' }), 'Sair'))),
    corpo);
}

function cabecalho(titulo, sub, ...extra) {
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' } },
    h('div', null, h('h1', { style: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' } }, titulo), sub ? h('p', { style: { margin: '4px 0 0', color: '#5A646B' } }, sub) : null),
    ...extra);
}

// ---------- Clientes ----------
async function secaoClientes(ctx, paraConferir, recarregar) {
  const clientes = await api.listarClientes();
  const enviados = clientes.filter((c) => !c.rascunho);
  const filtros = [
    ['todos', 'Todos', () => true],
    ['pendente', 'Doc. pendente', (c) => c.docs_pendentes > 0 || c.docs_recusados > 0],
    ['conferir', 'Docs para conferir', (c) => c.docs_em_conferencia > 0],
    ...ctx.config.status.map((s) => [s.codigo, s.nome, (c) => c.status === s.codigo]),
  ];
  const caixaFiltros = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Filtrar por status' });
  const caixaTabela = h('div', { class: 'tabela-caixa' });
  const lateral = h('aside', { class: 'lateral' });

  const desenhar = () => {
    limpar(caixaFiltros);
    filtros.forEach(([cod, nome, fn]) => {
      const n = enviados.filter(fn).length;
      if (n || cod === 'todos' || estado.filtro === cod) caixaFiltros.appendChild(botaoOpcao(`${nome} · ${n}`, estado.filtro === cod, () => { estado.filtro = cod; desenhar(); }, 'pilula'));
    });
    const termo = estado.busca.toLowerCase().trim();
    const f = (filtros.find((x) => x[0] === estado.filtro) || filtros[0])[2];
    const vis = enviados.filter(f).filter((c) => !termo || [c.nome, R.soDigitos(c.cpf), c.corretor_nome, c.imobiliaria_nome].join(' ').toLowerCase().includes(R.soDigitos(termo) || termo));
    limpar(caixaTabela);
    caixaTabela.appendChild(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Cliente', 'Corretor / imobiliária', 'Operação', 'Docs', 'Status'].map((t) => h('th', null, t)))),
      h('tbody', null, vis.length ? vis.map((c) => h('tr', { class: estado.selecionado === c.id ? 'selecionado' : '', tabindex: 0,
        onclick: () => { estado.selecionado = c.id; estado.novoStatus = null; desenhar(); desenharLateral(); },
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
        h('td', null, h('div', { style: { fontWeight: '700' } }, c.nome), h('div', { class: 'sub' }, R.formatarCpf(c.cpf))),
        h('td', null, h('div', { style: { fontWeight: '600' } }, c.corretor_nome), h('div', { class: 'sub' }, c.imobiliaria_nome)),
        h('td', null, c.programa || '—', h('div', { class: 'sub' }, c.imovel || '')),
        h('td', null,
          c.docs_recusados ? h('div', null, h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado`)) : null,
          c.docs_pendentes ? h('div', null, h('span', { class: 'chip chip-alerta' }, `Faltam ${c.docs_pendentes}`)) : null,
          c.docs_em_conferencia ? h('div', null, h('span', { class: 'chip chip-em_conferencia' }, `${c.docs_em_conferencia} p/ conferir`)) : null,
          !c.docs_pendentes && !c.docs_recusados && !c.docs_em_conferencia ? 'Completo' : null,
          c.pode_ir_para_analise ? null : h('div', { class: 'sub', style: { color: '#8A4E12', fontWeight: '700', marginTop: '4px' } }, 'Falta **')),
        h('td', null, h('span', { class: 'chip chip-status' }, c.status_nome || R.nomeStatus(c.status)))))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { padding: '30px', textAlign: 'center' } }, 'Nenhum cliente neste filtro.')))));
  };

  const desenharLateral = async () => {
    limpar(lateral);
    if (!estado.selecionado) {
      lateral.appendChild(h('div', { class: 'cartao' }, h('div', { class: 'subtitulo' }, 'Toque num cliente da lista para mudar o status, conferir documentos e ver a pasta.')));
      return;
    }
    lateral.appendChild(h('div', { class: 'cartao' }, 'Carregando…'));
    const pedido = (desenharLateral.pedido = (desenharLateral.pedido || 0) + 1);
    let dados;
    try { dados = await api.obterCliente(estado.selecionado); } catch (e) { toast(e.message); return; }
    if (pedido !== desenharLateral.pedido) return; // outro clique chegou antes
    limpar(lateral);
    const { cliente, necessarios, corretor, imobiliaria } = dados;
    const escolhido = estado.novoStatus;
    const grade = h('div', { class: 'status-grade' }, ctx.config.status.map((s) => h('button', {
      type: 'button', class: s.codigo === cliente.status ? 'atual' : '', 'aria-pressed': escolhido === s.codigo ? 'true' : 'false',
      onclick: () => { estado.novoStatus = s.codigo === cliente.status ? null : s.codigo; desenharLateral(); },
    }, s.codigo === cliente.status ? `${s.nome} (atual)` : s.nome)));
    const previa = escolhido ? R.msgStatus({ corretor, cliente, novoStatus: escolhido }) : null;
    const salvar = h('button', { class: 'btn btn-primario', disabled: !escolhido, type: 'button' }, 'Salvar status');
    salvar.onclick = async () => {
      salvar.disabled = true;
      try { await api.mudarStatus(cliente.id, escolhido); estado.novoStatus = null; toast('Status salvo. O corretor foi avisado no WhatsApp.'); recarregar(); }
      catch (e) { toast(e.message); salvar.disabled = false; }
    };
    const docsConferir = necessarios.filter((n) => n.situacao === 'em_conferencia');

    lateral.appendChild(h('div', { class: 'cartao', style: { gap: '16px' } },
      h('div', null, h('div', { class: 'subtitulo' }, 'Cliente selecionado'), h('h2', { style: { fontSize: '20px', fontWeight: '800' } }, cliente.nome),
        h('div', { class: 'subtitulo' }, `Corretor: ${corretor?.nome || '—'} · ${imobiliaria?.nome || 'Autônomo'}`)),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { class: 'rotulo' }, 'Mudar status para'), grade),
      previa ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { class: 'rotulo' }, 'Mensagem que o corretor vai receber'), h('div', { class: 'balao' }, previa),
        h('div', { class: 'ajuda' }, 'Enviada pelo WhatsApp (21) 99812-4395')) : null,
      salvar,
      h('div', { style: { borderTop: '1px solid #EFECE6', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { class: 'rotulo' }, docsConferir.length ? `Documentos para conferir (${docsConferir.length})` : 'Documentos'),
        docsConferir.length ? docsConferir.map((n) => blocoConferencia({ nome: n.nome, regra: n.regra, documento: n.documento, aoTerminar: recarregar }))
          : h('div', { class: 'subtitulo' }, 'Nenhum documento novo para conferir.'),
        h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: '700', fontSize: '14px', minHeight: '32px' } }, 'Ver todos os documentos'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } }, necessarios.map((n) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' } },
            h('span', { style: { flex: '1', minWidth: '140px' } }, n.nome, marcaRegra(n.regra)), chipSituacao(n.situacao),
            n.documento ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${n.nome}`, onclick: () => abrirDoc(n.documento) }, icone('olho', { tam: 18 })) : null,
            n.documento ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${n.nome}`, onclick: () => abrirDoc(n.documento, true) }, icone('baixar', { tam: 18 })) : null)))),
        cliente.pasta_drive_id ? h('a', { href: `https://drive.google.com/drive/folders/${cliente.pasta_drive_id}`, target: '_blank', rel: 'noopener' }, 'Abrir pasta no Drive') : h('div', { class: 'ajuda' }, 'A pasta no Drive é criada quando a integração estiver ligada.'))));
  };

  const busca = h('input', { id: 'p-busca', type: 'search', class: 'entrada', placeholder: 'Nome, CPF, corretor ou imobiliária', value: estado.busca, style: { width: '300px', maxWidth: '100%' },
    oninput: (e) => { estado.busca = e.target.value; desenhar(); } });
  desenhar();
  desenharLateral();
  return [
    cabecalho('Clientes', 'Todos os cadastros enviados por corretores e imobiliárias parceiras.', h('div', null, h('label', { for: 'p-busca', class: 'sr' }, 'Buscar'), busca)),
    caixaFiltros,
    h('div', { class: 'painel-colunas' }, h('div', { class: 'principal' }, caixaTabela), lateral),
  ];
}

// Aceitar / recusar um documento
function blocoConferencia({ nome, regra, documento, clienteNome, aoTerminar }) {
  const st = (estado.recusa[documento.id] ||= { motivo: null, obs: '' });
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
      await api.conferirDocumento(documento.id, aceito, st.motivo, st.obs);
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
    h('div', { class: 'linha-botoes' }, aceitar, recusar),
    h('div', { class: 'rotulo', style: { fontSize: '13px' } }, 'Motivo da recusa'), motivos, obs,
    h('div', { class: 'ajuda' }, 'Ao recusar, o corretor recebe o motivo no WhatsApp e o botão Substituir no app.'));
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

async function secaoImobiliarias() {
  const lista = await api.listarImobiliarias();
  return [cabecalho('Imobiliárias', 'Imobiliárias parceiras com acesso ao portal.'),
    tabela(['Nome', 'CNPJ', 'WhatsApp', 'Situação'], lista.map((i) => [h('b', null, i.nome), i.cnpj, i.whatsapp ? R.formatarCelular(i.whatsapp) : null, i.ativo === false ? 'Inativa' : 'Ativa']), 'Nenhuma imobiliária cadastrada.'),
    h('div', { class: 'ajuda' }, 'Cadastro de nova imobiliária e convite de corretores: próxima etapa do app.')];
}

async function secaoCorretores() {
  const lista = await api.listarCorretores();
  return [cabecalho('Corretores', 'Corretores com acesso, por imobiliária ou autônomos.'),
    tabela(['Nome', 'Imobiliária', 'E-mail', 'WhatsApp', 'Situação'], lista.map((c) => [h('b', null, c.nome), c.imobiliaria_nome, c.email, c.whatsapp ? R.formatarCelular(c.whatsapp) : null, c.ativo === false ? 'Inativo' : 'Ativo']), 'Nenhum corretor cadastrado.')];
}

async function secaoMensagens() {
  const lista = await api.listarMensagens();
  const tipo = { confirmacao: 'Confirmação', status: 'Status', pendencia: 'Pendência', recusa: 'Recusa' };
  return [cabecalho('Mensagens de WhatsApp', 'Avisos automáticos enviados aos corretores pelo número (21) 99812-4395.'),
    tabela(['Quando', 'Para', 'Cliente', 'Tipo', 'Mensagem', 'Situação'], lista.map((m) => [dataHora(m.criada_em), m.destino_nome, m.cliente_nome, tipo[m.tipo] || m.tipo,
      h('div', { style: { whiteSpace: 'pre-line', maxWidth: '420px' } }, m.texto), m.situacao === 'erro' ? h('span', { class: 'chip chip-alerta' }, 'Erro') : m.situacao === 'na_fila' ? 'Na fila' : 'Enviada']), 'Nenhuma mensagem ainda.')];
}

async function secaoAcessos() {
  const lista = await api.listarAcessos();
  const acao = { ver_cliente: 'Abriu ficha', baixar_documento: 'Baixou documento', ver_documento: 'Viu documento', mudar_status: 'Mudou status', conferir_documento: 'Conferiu documento' };
  return [cabecalho('Registro de acessos', 'Quem viu ou alterou dados de clientes (LGPD).'),
    tabela(['Quando', 'Usuário', 'Ação', 'Detalhes'], lista.map((a) => [dataHora(a.em), a.usuario_nome || a.usuario_id, acao[a.acao] || a.acao,
      a.detalhes?.para ? `${R.nomeStatus(a.detalhes.de)} → ${R.nomeStatus(a.detalhes.para)}` : a.detalhes?.motivo ? `Recusado: ${a.detalhes.motivo}` : a.detalhes?.aceito ? 'Aceito' : '']), 'Nenhum acesso registrado.')];
}

function secaoConfig(config) {
  return [cabecalho('Configurações', 'Regras usadas no cadastro. Por enquanto, alterações são feitas no banco; a edição por aqui vem numa próxima etapa.'),
    h('h2', { style: { fontSize: '18px' } }, 'Documentos e regra dos asteriscos'),
    tabela(['Documento', 'Grupo', 'Regra', 'Quando é pedido'], config.tipos.map((t) => [h('b', null, t.nome), t.grupo,
      t.regra === '**' ? h('span', { class: 'marca-forte' }, '** bloqueia análise') : t.regra === '*' ? '* pode vir depois' : 'comum',
      (t.condicao || []).length ? t.condicao.map((c) => Object.entries(c).map(([k, v]) => `${k.replace('_', ' ')}: ${v === true ? 'sim' : v}`).join(', ')).join(' ou ') : 'Sempre']), ''),
    h('h2', { style: { fontSize: '18px' } }, 'Opções do cadastro'),
    tabela(['Campo', 'Opções'], Object.entries(config.opcoes).map(([k, v]) => [h('b', null, k.replace('_', ' ')), v.join(' · ')]), '')];
}
