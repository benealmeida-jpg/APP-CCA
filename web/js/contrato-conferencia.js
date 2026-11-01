// Conferência do contrato pela CCA (etapa Contrato): tipo, gerente e procuração, assinaturas, dados e liberação.
import { h, toast, limpar } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import * as CC from './contrato-conferencia-dados.js';
import { lerAssinaturasPdf } from './assinatura-pdf.js';
import { secaoTitulo, perguntarSimNao, aviso, botaoOpcao } from './componentes.js';

const chip = (tom, texto) => h('span', { class: `cc-chip cc-${tom}` }, texto);

// Baixa o PDF do contrato e lê as assinaturas digitais
async function lerAssinaturasDoArquivo(a) {
  const url = await api.abrirContratoArquivo(a, { baixar: false });
  const r = await fetch(url);
  if (!r.ok) throw new Error('Não foi possível abrir o contrato assinado.');
  const bytes = new Uint8Array(await r.arrayBuffer());
  return lerAssinaturasPdf(bytes).nomes || [];
}

export function blocoConferenciaContrato({ cliente, atuais, participantes = [], vendedor = null, aoMudar }) {
  const caixa = h('div', { class: 'cc-bloco', id: 'secao-conferencia-contrato' }, h('div', { class: 'sub' }, 'Carregando a conferência…'));
  const st = { gerentes: [], imovel: null, lidas: cliente.contrato_conferencia?.assinaturas_lidas || null, lendo: false };
  const itens = () => cliente.contrato_conferencia?.itens || {};

  const desenhar = () => {
    limpar(caixa);
    const gerente = st.gerentes.find((g) => g.id === cliente.contrato_gerente_id) || null;
    const proc = CC.procuracaoVigente(gerente);
    const sitProc = CC.situacaoProcuracao(proc);
    const esperados = CC.assinantesEsperados({ cliente, participantes, vendedor, gerente });
    const dados = CC.dadosParaConferir({ cliente, participantes, vendedor, imovel: st.imovel, gerente });
    const falta = CC.pendenciasLiberacao({ cliente, arquivos: atuais, gerente });

    caixa.appendChild(secaoTitulo('Conferência antes de liberar', 'O corretor só baixa o contrato, a procuração e o validador depois que você liberar.', { pequeno: true, nivel: 'h3', icone: 'escudo' }));

    // 1. Tipo de contrato
    caixa.appendChild(h('div', { class: 'cc-passo' },
      h('div', { class: 'cc-passo-titulo' }, '1. Tipo de contrato (como foi cadastrado no SIOPI)'),
      h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Tipo de contrato' },
        CC.TIPOS_CONTRATO_CAIXA.map((t) => botaoOpcao(t.nome, cliente.contrato_tipo === t.codigo, async () => {
          try { await api.definirContrato(cliente.id, { tipo: t.codigo, gerenteId: cliente.contrato_gerente_id || null }); cliente.contrato_tipo = t.codigo; desenhar(); }
          catch (e) { toast(e.message); }
        }, 'pilula'))),
      cliente.contrato_tipo ? h('div', { class: 'ajuda' }, CC.TIPOS_CONTRATO_CAIXA.find((t) => t.codigo === cliente.contrato_tipo).ajuda) : null));

    // 2. Gerente e procuração
    const ativos = st.gerentes.filter((g) => g.ativo !== false || g.id === cliente.contrato_gerente_id);
    const sel = h('select', { class: 'entrada', id: 'cc-gerente', 'aria-label': 'Gerente responsável pelo contrato' },
      h('option', { value: '' }, ativos.length ? 'Escolha o gerente…' : 'Nenhum gerente cadastrado'),
      ativos.map((g) => h('option', { value: g.id, selected: g.id === cliente.contrato_gerente_id }, `${g.nome}${g.agencia ? ` · ag. ${g.agencia}` : ''}`)));
    sel.onchange = async () => {
      const g = st.gerentes.find((x) => x.id === sel.value) || null;
      sel.disabled = true;
      try {
        await api.definirContrato(cliente.id, { tipo: cliente.contrato_tipo || null, gerenteId: g?.id || null, gerente: g });
        toast(g && CC.procuracaoVigente(g) ? 'Gerente definido e procuração vinculada ao contrato.' : 'Gerente definido.');
        aoMudar();
      } catch (e) { toast(e.message); sel.disabled = false; }
    };
    caixa.appendChild(h('div', { class: 'cc-passo' },
      h('div', { class: 'cc-passo-titulo' }, '2. Gerente da CAIXA e jogo de procurações'),
      sel,
      !st.gerentes.length ? aviso('laranja', 'Cadastre os gerentes e as procurações em Configurações → Gerentes da CAIXA.') : null,
      gerente ? h('div', { class: 'cc-proc' },
        chip(sitProc.tom, sitProc.texto),
        proc ? h('span', { class: 'sub' }, `${proc.nome_original || 'Procuração'}${proc.validade_por === 'ia' ? ' · validade lida pela IA' : proc.validade_por === 'cca' ? ' · validade informada pela CCA' : ''}`) : null,
        atuais.has('procuracao_gerente') ? h('span', { class: 'sub' }, '· vinculada a este contrato') : null) : null,
      gerente && sitProc.estado !== 'ok' && sitProc.estado !== 'vence_logo' ? h('div', { class: 'ajuda' }, 'Atualize a procuração no cadastro do gerente (Configurações) e escolha o gerente de novo para vincular a versão nova.') : null));

    // 3. Assinaturas
    const contrato = atuais.get('contrato_assinado');
    const res = st.lidas ? CC.conferirAssinaturasContrato(esperados, st.lidas, cliente.contrato_tipo || 'digital') : null;
    const botaoLer = contrato ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'cc-ler', disabled: st.lendo, onclick: () => ler(contrato) }, st.lendo ? 'Lendo…' : st.lidas ? 'Ler de novo' : 'Ler assinaturas do contrato') : null;
    caixa.appendChild(h('div', { class: 'cc-passo', id: 'cc-assinaturas' },
      h('div', { class: 'cc-passo-titulo' }, '3. Assinaturas'),
      !contrato ? h('div', { class: 'sub' }, 'Anexe acima o contrato assinado por todos (inclusive o gerente) para o app conferir as assinaturas.') : null,
      res ? h('div', { class: `cc-resumo ${res.completo ? 'ok' : 'falta'}` }, res.resumo) : null,
      h('ul', { class: 'cc-pessoas' }, esperados.map((p) => {
        const assinou = res?.assinaram.some((x) => x.nome === p.nome);
        const estado = !res ? 'neutro' : p.indefinido ? 'alerta' : assinou ? 'ok' : cliente.contrato_tipo === 'misto' ? 'atencao' : 'alerta';
        const txt = !res ? 'aguardando leitura' : p.indefinido ? 'defina abaixo' : assinou ? 'assinou' : cliente.contrato_tipo === 'misto' ? 'conferir à mão' : 'sem assinatura digital';
        return h('li', null, h('span', null, h('b', null, p.nome || '—'), h('span', { class: 'sub' }, ` · ${p.papel}`)), chip(estado, txt));
      })),
      res?.outros.length ? h('div', { class: 'sub' }, `Outras assinaturas no PDF: ${res.outros.join(', ')}`) : null,
      h('div', { class: 'cc-acoes' }, botaoLer,
        h('a', { class: 'btn btn-contorno btn-pequeno', href: CC.URL_ITI, target: '_blank', rel: 'noopener' }, 'Validar no ITI')),
      h('div', { class: 'ajuda' }, 'No site do ITI, envie o contrato assinado, baixe o relatório de conformidade e anexe acima em "Validador das assinaturas".'),
      vendedor?.tipo === 'PJ' ? blocoAssinantesVendedor(vendedor, desenhar) : null));

    // 4. Conferir os dados do contrato com o cadastro
    caixa.appendChild(h('div', { class: 'cc-passo' },
      h('div', { class: 'cc-passo-titulo' }, '4. Conferir o contrato com o cadastro'),
      h('div', { class: 'ajuda' }, 'Abra o contrato assinado e marque cada item que confere com os dados abaixo.'),
      h('div', { class: 'cc-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'cc-ia', onclick: conferirComIa }, 'Conferir com IA')),
      CC.ITENS_CONFERENCIA.map((it) => {
        const marcado = itens()[it.codigo] === true;
        const cx = h('input', { type: 'checkbox', id: `cc-item-${it.codigo}`, checked: marcado });
        cx.onchange = async () => {
          cx.disabled = true;
          try { await api.salvarConferenciaContrato(cliente.id, { [it.codigo]: cx.checked }); cliente.contrato_conferencia = { ...(cliente.contrato_conferencia || {}), itens: { ...itens(), [it.codigo]: cx.checked } }; desenhar(); }
          catch (e) { toast(e.message); cx.checked = !cx.checked; cx.disabled = false; }
        };
        return h('label', { class: `cc-item${marcado ? ' ok' : ''}`, for: `cc-item-${it.codigo}` }, cx,
          h('span', { class: 'cc-item-txt' }, h('b', null, it.titulo), h('span', { class: 'sub' }, it.dica),
            dados[it.codigo] ? h('span', { class: 'cc-dados' }, dados[it.codigo].map((l) => h('span', null, l))) : null,
            iaDoItem(it.codigo),
            it.codigo === 'assinaturas' && !atuais.has('validador_assinatura') ? h('span', { class: 'cc-falta' }, 'Falta anexar o relatório do ITI.') : null));
      })));

    // 5. Liberar
    const botao = h('button', { type: 'button', class: 'btn btn-primario', id: 'cc-liberar', disabled: falta.length > 0 }, 'Liberar contrato e procuração para download');
    botao.onclick = async () => {
      if (!(await perguntarSimNao('Liberar o contrato?', `O(a) corretor(a) de ${cliente.nome} poderá baixar o contrato, a procuração do gerente e o validador, e será avisado(a) para levar ao cartório. Confirma?`))) return;
      botao.disabled = true;
      try { await api.liberarContrato(cliente.id); toast('Contrato liberado. O(a) corretor(a) foi avisado(a).'); aoMudar(); }
      catch (e) { toast(e.message); botao.disabled = false; }
    };
    caixa.appendChild(h('div', { class: 'cc-passo cc-liberar' },
      h('div', { class: 'cc-passo-titulo' }, '5. Liberar'),
      falta.length ? h('div', { class: 'cc-faltam' }, h('b', null, 'Antes de liberar, falta:'), h('ul', null, falta.map((f) => h('li', null, f))))
        : h('div', { class: 'cc-resumo ok' }, 'Tudo conferido. Só depende de você liberar.'),
      botao));
  };

  // Sugestão da IA em cada item (a CCA é quem marca)
  const iaDoItem = (codigo) => {
    const conf = cliente.contrato_conferencia || {};
    if (codigo === 'assinaturas') {
      const iti = conf.ia_iti; if (!iti) return null;
      return h('span', { class: `cc-ia ${iti.todas_aprovadas ? 'ok' : 'falta'}` }, `IA (relatório do ITI): ${iti.resumo || (iti.todas_aprovadas ? 'todas aprovadas' : 'há assinatura não aprovada')}`);
    }
    const x = conf.ia_contrato?.itens?.[codigo]; if (!x) return null;
    return h('span', { class: `cc-ia ${x.confere ? 'ok' : 'falta'}` }, `IA: ${x.confere ? 'confere' : 'não confere'}${x.observacao ? ` · ${x.observacao}` : ''}`);
  };

  const ler = async (contrato) => {
    st.lendo = true; desenhar();
    try {
      st.lidas = await lerAssinaturasDoArquivo(contrato);
      await api.salvarConferenciaContrato(cliente.id, {}, { assinaturas_lidas: st.lidas, assinaturas_lidas_em: new Date().toISOString() }).catch(() => {});
    } catch (e) { toast(e.message); }
    st.lendo = false; desenhar();
  };

  const conferirComIa = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.textContent = 'A IA está lendo o contrato…'; }
    try {
      const r = await api.lerComIa('contrato', { clienteId: cliente.id });
      if (r?.semIa) { toast('A IA ainda não está ligada (falta a chave em Configurações). Confira pela lista abaixo.'); if (b) { b.disabled = false; b.textContent = 'Conferir com IA'; } return; }
      if (atuais.has('validador_assinatura')) await api.lerComIa('iti', { clienteId: cliente.id }).catch(() => null);
      const div = r?.divergencias || [];
      toast(div.length ? `A IA encontrou ${div.length} ponto(s) para conferir. Veja em cada item.` : 'A IA não encontrou divergências. Confira e marque os itens.');
      aoMudar();
    } catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = 'Conferir com IA'; } }
  };

  Promise.all([api.listarGerentes().catch(() => []), cliente.imovel_id && api.obterImovel ? api.obterImovel(cliente.imovel_id).catch(() => null) : null])
    .then(([gerentes, imovel]) => { st.gerentes = gerentes; st.imovel = imovel; desenhar(); if (!st.lidas && atuais.get('contrato_assinado')) ler(atuais.get('contrato_assinado')); })
    .catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

// Vendedor pessoa jurídica: quem assina pela empresa e regras de dispensa (procuração / contrato social)
function blocoAssinantesVendedor(vendedor, aoSalvar) {
  const nomes = h('textarea', { class: 'entrada', id: 'cc-assinantes', rows: 2, placeholder: 'Um nome por linha' }, (vendedor.assinantes || []).join('\n'));
  const regra = h('textarea', { class: 'entrada', id: 'cc-regra', rows: 2, placeholder: 'Ex.: o diretor assina só a última página; funcionários da equipe não precisam assinar.' }, vendedor.regra_assinatura || '');
  const salvar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'cc-salvar-assinantes' }, 'Salvar');
  salvar.onclick = async () => {
    salvar.disabled = true;
    try {
      const lista = CC.listaDeNomes(nomes.value);
      await api.salvarRegraAssinaturaVendedor(vendedor.id, lista, regra.value);
      vendedor.assinantes = lista.length ? lista : null; vendedor.regra_assinatura = regra.value.trim() || null;
      toast('Regra de assinatura do vendedor salva (vale para os próximos contratos dele).'); aoSalvar();
    } catch (e) { toast(e.message); salvar.disabled = false; }
  };
  return h('details', { class: 'cc-vendedor', open: !(vendedor.assinantes || []).length && !vendedor.responsavel_nome },
    h('summary', null, `Quem assina por ${vendedor.nome}`),
    h('div', { class: 'ajuda' }, 'Veja no jogo de procurações ou no contrato social do vendedor. Fica salvo no vendedor e vale para os próximos contratos dele.'),
    h('div', { class: 'campo' }, h('label', { for: 'cc-assinantes' }, 'Pessoas que assinam pela empresa'), nomes),
    h('div', { class: 'campo' }, h('label', { for: 'cc-regra' }, 'Dispensas e observações'), regra),
    salvar);
}
