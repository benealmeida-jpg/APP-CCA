// Financeiro da CCA (Modelo 2): Faturamento (nível 1), Despesas e créditos (conforme a permissão) e Fechamento do mês (nível 1).
import { h, limpar, icone, toast } from './dom.js';
import { api } from './api.js';
import { cabecalho, aviso, secaoTitulo, mascaraMoeda } from './componentes.js';
import { gerarXlsx, baixarArquivo } from './xlsx-simples.js';
import * as F from './financeiro-dados.js';

const reais = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const valorCampo = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const nomeAssin = { nato_digital: 'Nato Digital', manual: 'Assinatura manual' };
const estado = { mes: null, aberto: {} };

// Seletor de mês: ‹ outubro de 2026 ›
function seletorMes(mes, aoMudar, extra = null) {
  const ir = (n) => { estado.mes = F.somarMes(mes, n); aoMudar(); };
  return h('div', { class: 'fin-mes' },
    h('button', { type: 'button', class: 'fin-mes-seta', 'aria-label': 'Mês anterior', onclick: () => ir(-1) }, '‹'),
    h('h2', { class: 'fin-mes-nome', 'aria-live': 'polite' }, F.nomeMes(mes).replace(/^./, (x) => x.toUpperCase())),
    h('button', { type: 'button', class: 'fin-mes-seta', 'aria-label': 'Próximo mês', onclick: () => ir(1) }, '›'),
    extra);
}
const cartao = (titulo, sub, ...corpo) => h('section', { class: 'ini-cartao' }, h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, titulo), sub ? h('p', null, sub) : null)), ...corpo);
// Quadros clicáveis: ao tocar num quadro, a lista detalhada dele aparece logo abaixo (toque de novo para fechar)
// itens: [{ id, nome, valor, dica, cls, titulo, detalhe: () => elemento }]
function quadros(pagina, itens) {
  const caixa = h('div', { class: 'fin-quadros' });
  const desenhar = () => {
    limpar(caixa);
    const aberto = itens.find((i) => i.id === estado.aberto[pagina]) || null;
    caixa.appendChild(h('div', { class: 'ini-kpis fin-kpis' }, itens.map((i) => h('button', {
      type: 'button', class: `ini-kpi fin-kpi ${i.cls || ''}${aberto?.id === i.id ? ' aberto' : ''}`, 'aria-expanded': String(aberto?.id === i.id), 'aria-controls': `fin-det-${pagina}`, 'data-quadro': i.id,
      onclick: () => { estado.aberto[pagina] = aberto?.id === i.id ? null : i.id; desenhar(); if (estado.aberto[pagina]) mostrarDetalhe(caixa); },
    }, h('span', { class: 'ini-kpi-nome' }, i.nome), h('span', { class: 'ini-kpi-valor fin-valor' }, i.valor), i.dica ? h('small', { class: 'gest-dica' }, i.dica) : null,
      h('span', { class: 'fin-kpi-ver' }, aberto?.id === i.id ? 'Fechar detalhes' : 'Ver detalhes', icone('seta', { tam: 14, traco: 2.4 }))))));
    if (aberto) caixa.appendChild(h('section', { class: 'ini-cartao fin-detalhe', id: `fin-det-${pagina}` },
      h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, aberto.titulo || aberto.nome), aberto.sub ? h('p', null, aberto.sub) : null),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { estado.aberto[pagina] = null; desenhar(); } }, 'Fechar')),
      aberto.detalhe()));
  };
  desenhar();
  return caixa;
}
// Leva a tela até o detalhe aberto, deixando o começo dele à vista logo abaixo do menu fixo
function mostrarDetalhe(caixa) {
  const det = caixa.querySelector('.fin-detalhe');
  if (!det) return;
  const topo = document.querySelector('.painel-topo')?.getBoundingClientRect().height || 0;
  const r = det.getBoundingClientRect();
  if (r.top >= topo + 8 && r.top < window.innerHeight * 0.75) return; // já está à vista
  const alvo = window.innerWidth < 761 ? det : caixa;
  window.scrollTo({ top: Math.max(0, alvo.getBoundingClientRect().top + window.scrollY - topo - 12), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
// Tabela dos detalhes: colunas [{ t, num? }], linhas [[...]], total [...] (opcional)
function tabelaDetalhe(colunas, linhas, total = null, vazio = 'Nada neste mês.') {
  if (!linhas.length) return h('div', { class: 'ajuda' }, vazio);
  const cel = (v, c, tag = 'td') => h(tag, { class: c.num ? 'fin-num-col' : null }, v ?? '—');
  return h('div', { class: 'tabela-caixa fin-det-tabela' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, colunas.map((c) => h('th', { class: c.num ? 'fin-num-col' : null }, c.t)))),
    h('tbody', null, linhas.map((l) => h('tr', null, l.map((v, i) => cel(v, colunas[i])))),
      total ? h('tr', { class: 'fin-total' }, total.map((v, i) => cel(v, colunas[i]))) : null)));
}
const pct = (v, t) => (t ? `${((v / t) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const nomeCli = (c) => h('a', { href: `#/painel/clientes/${c.id}` }, c.nome);
function detalheLancamentos(lista, vazio) {
  const total = lista.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const porCat = {};
  lista.forEach((l) => { porCat[l.categoria] = (porCat[l.categoria] || 0) + (Number(l.valor) || 0); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  return h('div', { class: 'fin-det-corpo' },
    cats.length > 1 ? h('div', { class: 'fin-det-chips' }, cats.map(([c, v]) => h('span', { class: 'chip' }, `${c}: ${reais(v)}`))) : null,
    tabelaDetalhe([{ t: 'Data' }, { t: 'Descrição' }, { t: 'Categoria' }, { t: 'Lançado por' }, { t: 'Valor', num: true }],
      [...lista].sort((a, b) => String(a.data).localeCompare(String(b.data))).map((l) => [F.dataBr(l.data), l.descricao || '—', l.categoria, l.autor_nome || '—', reais(l.valor)]),
      ['Total', `${lista.length} lançamento${lista.length === 1 ? '' : 's'}`, '', '', reais(total)], vazio));
}
function detalheCategorias(despesas) {
  const total = despesas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const grupos = new Map();
  despesas.forEach((l) => { const g = grupos.get(l.categoria) || { tipo: l.tipo, n: 0, v: 0 }; g.n++; g.v += Number(l.valor) || 0; grupos.set(l.categoria, g); });
  return tabelaDetalhe([{ t: 'Categoria' }, { t: 'Tipo' }, { t: 'Lançamentos', num: true }, { t: 'Valor', num: true }, { t: '% do total', num: true }],
    [...grupos.entries()].sort((a, b) => b[1].v - a[1].v).map(([c, g]) => [c, F.NOME_TIPO[g.tipo], String(g.n), reais(g.v), pct(g.v, total)]),
    ['Total', '', String(despesas.length), reais(total), '100%'], 'Nenhuma despesa neste mês.');
}
function detalhesFaturamento(fat) {
  const it = fat.itens; const T = fat.totais;
  return {
    contratos: () => tabelaDetalhe([{ t: 'Cliente' }, { t: 'Corretor / imobiliária' }, { t: 'Assinatura' }, { t: 'Assinado em' }, { t: 'Nº do contrato' }],
      it.map((c) => [nomeCli(c), [c.corretor_nome, c.imobiliaria_nome].filter(Boolean).join(' · ') || '—', c.assinatura_contrato ? nomeAssin[c.assinatura_contrato] : '—', F.dataBr(F.dataLocal(c.assinado_em)), c.contrato_numero || h('span', { class: 'chip chip-alerta' }, 'Falta')]),
      null, 'Nenhum contrato neste mês.'),
    valor: () => tabelaDetalhe([{ t: 'Cliente' }, { t: 'Valor financiado', num: true }, { t: '% do mês', num: true }],
      [...it].sort((a, b) => (b.valor_financiado || 0) - (a.valor_financiado || 0)).map((c) => [nomeCli(c), c.valor_financiado ? reais(c.valor_financiado) : h('span', { class: 'chip chip-alerta' }, 'Falta'), pct(c.valor_financiado || 0, T.valor)]),
      ['Total', reais(T.valor), '100%'], 'Nenhum contrato neste mês.'),
    bruto: () => tabelaDetalhe([{ t: 'Cliente' }, { t: 'Regra da comissão' }, { t: 'Valor financiado', num: true }, { t: 'Bruto', num: true }],
      it.map((c) => [nomeCli(c), c.regra === 'fixo' ? h('span', { class: 'chip chip-em_conferencia' }, 'Fixo · empreendimento Caixa') : F.nomeRegra(c, fat.taxas), reais(c.valor_financiado), reais(c.bruto)]),
      ['Total (valor da NF-e)', '', reais(T.valor), reais(T.bruto)], 'Nenhum contrato neste mês.'),
    liquido: () => tabelaDetalhe([{ t: 'Cliente' }, { t: 'Bruto', num: true }, { t: `Imposto (${F.pct(fat.taxas.imposto)})`, num: true }, { t: 'Líquido CCA', num: true }],
      it.map((c) => [nomeCli(c), reais(c.bruto), `− ${reais(c.imposto)}`, reais(c.liquido)]), ['Total', reais(T.bruto), `− ${reais(T.imposto)}`, reais(T.liquido)], 'Nenhum contrato neste mês.'),
  };
}
async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado.'); } catch { toast('Não deu para copiar. Selecione o texto e copie.'); }
}

// ================= Faturamento (só nível 1) =================
export async function secaoFaturamento() {
  const raiz = h('div', { class: 'gest-corpo fin' });
  const desenhar = async () => {
    const { contratos, fechamentos, parametros } = await api.listarContratosFaturamento();
    estado.mes ||= F.mesAberto(new Date(), fechamentos);
    const mes = estado.mes;
    const fat = F.faturamentoDoMes(contratos, mes, { parametros, fechamentos });
    const aberto = F.mesAberto(new Date(), fechamentos);
    limpar(raiz);
    const situacao = fat.fechado
      ? h('span', { class: 'chip chip-aceito' }, fat.fechado.recebido_em ? `Recebido em ${F.dataBr(fat.fechado.recebido_em)}` : fat.fechado.nfe ? `NF-e ${fat.fechado.nfe.numero}` : `Fechado em ${F.dataBr(F.dataLocal(fat.fechado.em))}`)
      : h('span', { class: `chip ${mes === aberto ? 'chip-em_conferencia' : ''}` }, `${mes < aberto ? 'Não fechado' : 'Aberto'} · fecha em ${F.dataBr(fat.fechamento)}`);
    raiz.appendChild(seletorMes(mes, desenhar, situacao));
    const D = detalhesFaturamento(fat);
    raiz.appendChild(quadros('faturamento', [
      { id: 'contratos', nome: 'Contratos', valor: String(fat.totais.contratos), dica: 'Assinados pelo gerente', titulo: 'Contratos do mês', sub: 'Quem assinou, quando e como.', detalhe: D.contratos },
      { id: 'valor', nome: 'Valor financiado', valor: reais(fat.totais.valor), dica: 'Soma dos contratos', titulo: 'Valor financiado por contrato', sub: 'Do maior para o menor.', detalhe: D.valor },
      { id: 'bruto', nome: 'Bruto (comissão)', valor: reais(fat.totais.bruto), dica: `Valor da NF-e${fat.itens.some((x) => x.regra === 'fixo') ? ` · ${fat.itens.filter((x) => x.regra === 'fixo').length} empreend. Caixa` : ''}`, cls: 'destaque', titulo: 'Bruto por contrato',
        sub: `${F.pct(fat.taxas.taxa_bruta)} do valor financiado, ou ${reais(fat.taxas.valor_empreendimento)} fixo quando é empreendimento Caixa. A soma é o valor da NF-e.`, detalhe: D.bruto },
      { id: 'liquido', nome: 'Líquido CCA', valor: reais(fat.totais.liquido), dica: `Depois de ${F.pct(fat.taxas.imposto)} de imposto (${reais(fat.totais.imposto)})`, titulo: 'Do bruto ao líquido', sub: `Bruto menos ${F.pct(fat.taxas.imposto)} de imposto, contrato por contrato.`, detalhe: D.liquido },
    ]));
    if (fat.pendentes && !fat.fechado) raiz.appendChild(aviso('laranja', h('b', null, `Faltam dados em ${fat.pendentes} contrato${fat.pendentes > 1 ? 's' : ''}. `), 'Preencha o número e o valor financiado antes de fechar.'));

    // contratos do mês
    const linha = (c) => {
      const novo = { contrato_numero: c.contrato_numero || '', valor_financiado: c.valor_financiado, contrato_assinado_em: F.dataLocal(c.assinado_em) };
      const salvar = async (campo, valor) => {
        try { await api.salvarDadosContrato(c.id, { [campo]: valor }); toast('Salvo.'); desenhar(); } catch (e) { toast(e.message); }
      };
      const fechado = !!fat.fechado;
      return h('li', { class: `fin-linha${c.faltaDados ? ' falta' : ''}`, 'data-contrato': c.id },
        h('span', { class: 'gest-corretor-nome' }, h('a', { href: `#/painel/clientes/${c.id}` }, h('b', null, c.nome)),
          h('small', null, [c.imobiliaria_nome || c.corretor_nome, c.assinatura_contrato ? nomeAssin[c.assinatura_contrato] : null].filter(Boolean).join(' · ')),
          fechado ? (c.regra === 'fixo' ? h('span', { class: 'chip chip-em_conferencia fin-emp' }, 'Empreendimento Caixa · comissão fixa') : null)
            : h('label', { class: 'fin-emp-check' }, h('input', { type: 'checkbox', checked: c.regra === 'fixo', 'data-emp': c.id, onchange: (e) => salvar('empreendimento_caixa', e.target.checked) }),
              h('span', null, `Empreendimento Caixa (comissão fixa de ${reais(fat.taxas.valor_empreendimento)})`))),
        fechado ? h('span', { class: 'fin-campo-lido' }, h('small', null, 'Contrato'), h('b', null, c.contrato_numero || '—'))
          : h('label', { class: 'fin-campo' }, h('small', null, 'Nº do contrato'), h('input', { class: 'entrada fin-input', value: novo.contrato_numero, placeholder: 'Número', 'aria-label': `Número do contrato de ${c.nome}`, onchange: (e) => salvar('contrato_numero', e.target.value) })),
        fechado ? h('span', { class: 'fin-campo-lido' }, h('small', null, 'Assinado em'), h('b', null, F.dataBr(novo.contrato_assinado_em)))
          : h('label', { class: 'fin-campo' }, h('small', null, 'Assinado em'), h('input', { type: 'date', class: 'entrada fin-input fin-data', value: novo.contrato_assinado_em || '', 'aria-label': `Data da assinatura do contrato de ${c.nome}`, onchange: (e) => salvar('contrato_assinado_em', e.target.value) })),
        fechado ? h('span', { class: 'fin-campo-lido' }, h('small', null, 'Financiado'), h('b', null, reais(c.valor_financiado)))
          : h('label', { class: 'fin-campo' }, h('small', null, 'Valor financiado'), h('input', { class: 'entrada fin-input', inputmode: 'numeric', value: valorCampo(c.valor_financiado), placeholder: 'R$ 0,00', 'aria-label': `Valor financiado de ${c.nome}`, oninput: mascaraMoeda, onchange: (e) => salvar('valor_financiado', e.target.value) })),
        h('span', { class: 'gest-num fin-num' }, h('b', null, reais(c.bruto)), h('small', null, 'bruto')),
        h('span', { class: 'gest-num fin-num' }, h('b', null, reais(c.liquido)), h('small', null, 'líquido')));
    };
    raiz.appendChild(cartao('Contratos do mês', fat.fechado ? 'Mês fechado: os valores ficaram guardados como estavam no fechamento.' : `Entram os contratos assinados até ${F.dataBr(fat.fechamento)}. Os assinados depois vão para ${F.nomeMes(F.somarMes(mes, 1))}.`,
      fat.itens.length ? h('ul', { class: 'fin-lista' }, fat.itens.map(linha)) : h('div', { class: 'ajuda' }, 'Nenhum contrato assinado neste mês.'),
      fat.itens.length ? h('div', { class: 'gest-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'baixarFaturamento', onclick: () => baixarArquivo(gerarXlsx(F.planilhaFaturamento(fat)), `faturamento-cca-${mes}.xlsx`) }, icone('doc', { tam: 16 }), ' Baixar planilha (Excel)')) : null));

    // fechamento e NF-e
    raiz.appendChild(fat.fechado ? cartaoNfe(fat, desenhar) : cartaoFechar(fat, mes, aberto, desenhar));
    raiz.appendChild(await cartaoRegras(parametros, desenhar));
  };
  await desenhar();
  return [cabecalho('Faturamento', 'Contratos assinados no mês, quanto a CCA recebe da Caixa e os dados para emitir a NF-e. Só o nível 1 vê esta tela.'), raiz];
}

function cartaoFechar(fat, mes, aberto, desenhar) {
  const btn = h('button', { type: 'button', class: 'btn btn-primario', id: 'fecharMes', disabled: !fat.itens.length || !!fat.pendentes }, `Fechar o faturamento de ${F.nomeMes(mes).split(' ')[0]}`);
  const antes = mes === aberto && F.dataLocal(new Date()) < fat.fechamento;
  let confirmar = false;
  btn.onclick = async () => {
    if (antes && !confirmar) { confirmar = true; btn.textContent = `Ainda não é o dia ${F.dataBr(fat.fechamento)}. Fechar mesmo assim?`; return; }
    btn.disabled = true;
    try { await api.fecharMes(mes); toast('Mês fechado. Agora emita a NF-e com o valor bruto.'); desenhar(); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  return cartao('Fechamento', null,
    h('p', { class: 'fin-texto' }, `O fechamento é no penúltimo dia útil do mês: ${F.dataBr(fat.fechamento)}. Ao fechar, os contratos e valores ficam guardados e o app monta os dados da NF-e (valor bruto de ${reais(fat.totais.bruto)}).`),
    !fat.itens.length ? h('div', { class: 'ajuda' }, 'Sem contratos neste mês, não há o que fechar.') : fat.pendentes ? h('div', { class: 'ajuda' }, 'Preencha os dados que faltam para liberar o fechamento.') : null,
    h('div', { class: 'gest-acoes' }, btn));
}

function cartaoNfe(fat, desenhar) {
  const f = fat.fechado;
  const texto = F.textoNfe(fat);
  const area = h('textarea', { class: 'entrada fin-nfe-texto', rows: 4, 'aria-label': 'Descrição sugerida para a NF-e' }, texto);
  const blocoDados = h('dl', { class: 'resumo fin-nfe-dados' },
    h('dt', null, 'Tomador'), h('dd', null, 'Caixa Econômica Federal'),
    h('dt', null, 'Competência'), h('dd', null, F.nomeMesCurto(fat.mes)),
    h('dt', null, 'Valor da nota (bruto)'), h('dd', null, h('b', null, reais(f.bruto)), ' ', h('button', { type: 'button', class: 'btn-link', onclick: () => copiar(valorCampo(f.bruto)) }, 'Copiar')),
    h('dt', null, `Imposto (${F.pct(f.imposto)})`), h('dd', null, reais(fat.totais.imposto)),
    h('dt', null, 'Líquido para a CCA'), h('dd', null, reais(f.liquido)));
  let acoes;
  if (!f.nfe) {
    const num = h('input', { class: 'entrada fin-input', id: 'nfeNumero', placeholder: 'Número da NF-e', 'aria-label': 'Número da NF-e' });
    const data = h('input', { type: 'date', class: 'entrada fin-input fin-data', id: 'nfeData', value: F.dataLocal(new Date()), 'aria-label': 'Data de emissão da NF-e' });
    acoes = h('div', { class: 'fin-nfe-form' },
      h('label', { class: 'fin-campo' }, h('small', null, 'Número da NF-e emitida'), num),
      h('label', { class: 'fin-campo' }, h('small', null, 'Emitida em'), data),
      h('button', { type: 'button', class: 'btn btn-primario', id: 'registrarNfe', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.registrarNfe(fat.mes, { numero: num.value, data: data.value }); toast('NF-e registrada.'); desenhar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; } } }, 'Registrar NF-e'),
      h('button', { type: 'button', class: 'btn-link', id: 'reabrirMes', onclick: async () => { try { await api.reabrirMes(fat.mes); toast('Mês reaberto.'); desenhar(); } catch (er) { toast(er.message); } } }, 'Reabrir o mês'));
  } else {
    const dataRec = h('input', { type: 'date', class: 'entrada fin-input fin-data', value: f.recebido_em || F.dataLocal(new Date()), 'aria-label': 'Data do recebimento' });
    acoes = h('div', { class: 'fin-nfe-form' },
      h('span', { class: 'chip chip-aceito' }, `NF-e ${f.nfe.numero} · ${F.dataBr(f.nfe.data)}`),
      f.recebido_em ? h('span', { class: 'chip chip-aceito' }, `Recebido em ${F.dataBr(f.recebido_em)}`)
        : h('label', { class: 'fin-campo' }, h('small', null, 'Recebido da Caixa em'), dataRec),
      f.recebido_em ? h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await api.marcarRecebido(fat.mes, null); desenhar(); } catch (er) { toast(er.message); } } }, 'Desfazer recebimento')
        : h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'marcarRecebido', onclick: async () => { try { await api.marcarRecebido(fat.mes, dataRec.value); toast('Recebimento registrado.'); desenhar(); } catch (er) { toast(er.message); } } }, 'Marcar como recebido'),
      f.recebido_em ? null : h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await api.registrarNfe(fat.mes, null); desenhar(); } catch (er) { toast(er.message); } } }, 'Desfazer NF-e'));
  }
  return cartao('NF-e do mês', `Fechado em ${F.dataBr(F.dataLocal(f.em))}. Use estes dados para emitir a nota à Caixa.`,
    blocoDados,
    h('label', { class: 'fin-campo fin-campo-largo' }, h('small', null, 'Descrição sugerida (confira com o seu contador)'), area),
    h('div', { class: 'gest-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => copiar(area.value) }, 'Copiar descrição')),
    acoes);
}

async function cartaoRegras(parametros, desenhar) {
  const v = { ...parametros };
  const campo = (k, rot, moeda = false) => h('label', { class: 'fin-campo' }, h('small', null, rot), h('input', { class: `entrada fin-input ${moeda ? '' : 'fin-pct'}`, inputmode: moeda ? 'numeric' : 'decimal', value: moeda ? valorCampo(v[k]) : String(v[k] ?? '').replace('.', ','), oninput: (e) => { v[k] = moeda ? mascaraMoeda(e) : F.valorEmNumero(e.target.value); } }));
  return h('details', { class: 'ini-cartao fin-regras' }, h('summary', null, 'Regras do faturamento'),
    h('p', { class: 'fin-texto' }, 'Comissão que a Caixa paga por contrato: um percentual do valor financiado ou, em empreendimento Caixa, um valor fixo. Depois sai o imposto. Mudar aqui vale para os meses ainda abertos.'),
    h('div', { class: 'fin-nfe-form' }, campo('taxa_bruta', 'Comissão (% do financiado)'), campo('valor_empreendimento', 'Empreendimento Caixa (valor fixo)', true), campo('imposto', 'Imposto (%)'),
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await api.salvarFinanceiroConfig({ parametros: v }); toast('Regras salvas.'); desenhar(); } catch (e) { toast(e.message); } } }, 'Salvar')));
}

// ================= Despesas e créditos =================
const form = { tipo: 'fixa', categoria: '', descricao: '', valor: '', data: '' };
export async function secaoLancamentos(perfil) {
  const raiz = h('div', { class: 'gest-corpo fin' });
  const cfg = await api.financeiroConfig();
  const a = cfg.acesso;
  const tipos = [['fixa', 'Despesa fixa'], ['variavel', 'Despesa variável'], ['credito', 'Crédito']].filter(([t]) => (t === 'credito' ? a.lancar_creditos : a.lancar_despesas));
  if (!tipos.some(([t]) => t === form.tipo)) form.tipo = tipos[0]?.[0] || 'fixa';
  const desenhar = async () => {
    estado.mes ||= F.mesDe(F.dataLocal(new Date()));
    const mes = estado.mes;
    const lista = await api.listarLancamentos(mes);
    const todos = a.ver_todos ? await api.listarLancamentos() : lista;
    limpar(raiz);
    raiz.appendChild(seletorMes(mes, desenhar));
    const r = F.resumoLancamentos(lista, mes);
    const doTipo = (t) => lista.filter((l) => l.tipo === t);
    raiz.appendChild(quadros('lancamentos', [
      { id: 'fixa', nome: 'Despesas fixas', valor: reais(r.fixas), dica: a.ver_todos ? 'Aluguel, luz, contador…' : 'Lançadas por você', titulo: 'Despesas fixas do mês', detalhe: () => detalheLancamentos(doTipo('fixa'), 'Nenhuma despesa fixa neste mês.') },
      { id: 'variavel', nome: 'Despesas variáveis', valor: reais(r.variaveis), dica: 'Mudam de um mês para outro', titulo: 'Despesas variáveis do mês', detalhe: () => detalheLancamentos(doTipo('variavel'), 'Nenhuma despesa variável neste mês.') },
      { id: 'total', nome: 'Total de despesas', valor: reais(r.despesas), dica: `${r.quantidade} lançamento${r.quantidade === 1 ? '' : 's'}`, cls: 'destaque', titulo: 'Despesas por categoria', sub: 'Fixas e variáveis juntas.', detalhe: () => detalheCategorias(lista.filter((l) => l.tipo !== 'credito')) },
      { id: 'credito', nome: 'Créditos', valor: reais(r.creditos), dica: 'Outras entradas (fora a Caixa)', titulo: 'Créditos do mês', detalhe: () => detalheLancamentos(doTipo('credito'), 'Nenhum crédito neste mês.') },
    ]));

    // novo lançamento
    if (tipos.length) {
      const erro = h('div', { class: 'erro-campo', role: 'alert' });
      if (!form.data || F.mesDe(form.data) !== mes) form.data = F.mesDe(F.dataLocal(new Date())) === mes ? F.dataLocal(new Date()) : `${mes}-01`;
      const cats = F.CATEGORIAS[form.tipo];
      if (!cats.includes(form.categoria)) form.categoria = cats[0];
      const sel = h('select', { class: 'entrada', id: 'lancCategoria', 'aria-label': 'Categoria', onchange: (e) => { form.categoria = e.target.value; } }, cats.map((c) => h('option', { value: c, selected: c === form.categoria }, c)));
      const desc = h('input', { class: 'entrada', id: 'lancDescricao', value: form.descricao, placeholder: 'Ex.: conta de luz de outubro', oninput: (e) => { form.descricao = e.target.value; } });
      const valor = h('input', { class: 'entrada', id: 'lancValor', inputmode: 'numeric', value: form.valor, placeholder: 'R$ 0,00', oninput: (e) => { mascaraMoeda(e); form.valor = e.target.value; } });
      const data = h('input', { type: 'date', class: 'entrada', id: 'lancData', value: form.data, oninput: (e) => { form.data = e.target.value; } });
      const btn = h('button', { type: 'button', class: 'btn btn-primario', id: 'lancar' }, 'Lançar');
      btn.onclick = async () => {
        erro.textContent = ''; btn.disabled = true;
        try {
          await api.salvarLancamento({ ...form, mes });
          toast(form.tipo === 'credito' ? 'Crédito lançado.' : 'Despesa lançada.');
          Object.assign(form, { descricao: '', valor: '' });
          desenhar();
        } catch (e) { erro.textContent = e.message; btn.disabled = false; }
      };
      const copiaveis = a.lancar_despesas ? F.fixasParaCopiar(todos, mes) : [];
      raiz.appendChild(cartao('Novo lançamento', a.ver_todos ? null : 'Você vê aqui só o que lançou.',
        h('div', { class: 'ini-pilulas fin-tipos', role: 'group', 'aria-label': 'Tipo do lançamento' }, tipos.map(([t, n]) => h('button', { type: 'button', class: `ini-pilula${form.tipo === t ? ' ativa' : ''}`, 'aria-pressed': String(form.tipo === t), 'data-tipo': t, onclick: () => { form.tipo = t; desenhar(); } }, n))),
        h('div', { class: 'fin-form' },
          h('label', { class: 'campo' }, h('span', null, 'Categoria'), sel),
          h('label', { class: 'campo fin-form-desc' }, h('span', null, 'Descrição'), desc),
          h('label', { class: 'campo' }, h('span', null, 'Valor (R$)'), valor),
          h('label', { class: 'campo' }, h('span', null, 'Data'), data)),
        erro,
        h('div', { class: 'gest-acoes' }, btn,
          copiaveis.length ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'copiarFixas', onclick: async () => { try { const n = await api.copiarFixas(mes); toast(`${n} despesa${n === 1 ? '' : 's'} fixa${n === 1 ? '' : 's'} copiada${n === 1 ? '' : 's'}. Confira os valores.`); desenhar(); } catch (e) { toast(e.message); } } },
            `Copiar ${copiaveis.length} despesa${copiaveis.length === 1 ? '' : 's'} fixa${copiaveis.length === 1 ? '' : 's'} de ${F.nomeMes(F.somarMes(mes, -1)).split(' ')[0]}`) : null)));
    }

    // lista
    const podeApagar = (l) => l.autor_id === perfil.id || a.permissoes;
    raiz.appendChild(cartao('Lançamentos do mês', null,
      lista.length ? h('ul', { class: 'fin-lista' }, lista.map((l) => h('li', { class: `fin-linha fin-lanc ${l.tipo}`, 'data-lancamento': l.id },
        h('span', { class: 'fin-lanc-data' }, F.dataBr(l.data).slice(0, 5)),
        h('span', { class: 'gest-corretor-nome' }, h('b', null, l.descricao || l.categoria), h('small', null, `${l.categoria} · ${F.NOME_TIPO[l.tipo]} · lançado por ${l.autor_nome}`)),
        h('span', { class: `fin-lanc-valor ${l.tipo === 'credito' ? 'credito' : 'despesa'}` }, `${l.tipo === 'credito' ? '+' : '−'} ${reais(l.valor)}`),
        podeApagar(l) ? h('button', { type: 'button', class: 'btn-link fin-apagar', 'aria-label': `Apagar ${l.descricao || l.categoria}`, onclick: async () => { try { await api.removerLancamento(l.id); toast('Lançamento apagado.'); desenhar(); } catch (e) { toast(e.message); } } }, 'Apagar') : null)))
        : h('div', { class: 'ajuda' }, 'Nenhum lançamento neste mês.')));

    if (a.permissoes) raiz.appendChild(cartaoPermissoes(cfg, desenhar));
  };
  await desenhar();
  return [cabecalho('Despesas e créditos', 'Custos fixos e variáveis do mês (aluguel, luz, contador, internet…) e outras entradas da CCA.'), raiz];
}

function cartaoPermissoes(cfg, desenhar) {
  const p = JSON.parse(JSON.stringify(cfg.permissoes));
  const quem = { 2: 'Nível 2 (Suzana)', 3: 'Nível 3 (Gabriel)' };
  return cartao('Quem pode o quê', 'Faturamento e fechamento do mês são só do nível 1. Aqui você escolhe o que os outros níveis fazem nas despesas e créditos.',
    h('div', { class: 'fin-perm' }, [2, 3].map((n) => h('fieldset', { class: 'fin-perm-nivel' }, h('legend', null, quem[n]),
      F.PERMISSOES.map(([k, nome]) => h('label', { class: 'fin-perm-item' },
        h('input', { type: 'checkbox', checked: !!p[n]?.[k], 'data-perm': `${n}-${k}`, onchange: (e) => { (p[n] ||= {})[k] = e.target.checked; } }), h('span', null, nome)))))),
    h('div', { class: 'gest-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'salvarPermissoes', onclick: async () => { try { await api.salvarFinanceiroConfig({ permissoes: p }); toast('Permissões salvas.'); desenhar(); } catch (e) { toast(e.message); } } }, 'Salvar permissões')));
}

// ================= Fechamento do mês (só nível 1) =================
export async function secaoFechamento() {
  const raiz = h('div', { class: 'gest-corpo fin' });
  const desenhar = async () => {
    const [{ contratos, fechamentos, parametros }, lancs] = await Promise.all([api.listarContratosFaturamento(), api.listarLancamentos()]);
    estado.mes ||= F.mesAberto(new Date(), fechamentos);
    const mes = estado.mes;
    const fat = F.faturamentoDoMes(contratos, mes, { parametros, fechamentos });
    const r = F.resumoLancamentos(lancs, mes);
    const res = F.resultadoDoMes(fat, r);
    limpar(raiz);
    raiz.appendChild(seletorMes(mes, desenhar, h('span', { class: `chip ${fat.fechado ? 'chip-aceito' : ''}` }, fat.fechado ? 'Faturamento fechado' : 'Faturamento aberto (prévia)')));
    const doMes = lancs.filter((l) => l.mes === mes);
    const linhaRes = (nome, v, sinal = '') => [nome, `${sinal}${reais(v)}`];
    raiz.appendChild(quadros('fechamento', [
      { id: 'liquido', nome: 'Líquido da Caixa', valor: reais(res.liquidoCaixa), dica: `${fat.totais.contratos} contrato${fat.totais.contratos === 1 ? '' : 's'} · bruto ${reais(fat.totais.bruto)}`, titulo: 'Líquido da Caixa por contrato', detalhe: detalhesFaturamento(fat).liquido },
      { id: 'creditos', nome: 'Outros créditos', valor: reais(res.creditos), dica: 'Lançados no mês', titulo: 'Outros créditos do mês', detalhe: () => detalheLancamentos(doMes.filter((l) => l.tipo === 'credito'), 'Nenhum crédito neste mês.') },
      { id: 'despesas', nome: 'Despesas', valor: reais(res.despesas), dica: `Fixas ${reais(r.fixas)} · variáveis ${reais(r.variaveis)}`, titulo: 'Despesas por categoria', detalhe: () => detalheCategorias(doMes.filter((l) => l.tipo !== 'credito')) },
      { id: 'resultado', nome: 'Resultado do mês', valor: reais(res.resultado), dica: res.resultado >= 0 ? 'Entradas menos despesas' : 'Despesas maiores que as entradas', cls: `destaque ${res.resultado < 0 ? 'negativo' : ''}`, titulo: 'Como chegamos ao resultado',
        detalhe: () => tabelaDetalhe([{ t: 'Conta' }, { t: 'Valor', num: true }], [linhaRes(`Líquido da Caixa (${fat.totais.contratos} contratos)`, res.liquidoCaixa, '+ '), linhaRes('Outros créditos', res.creditos, '+ '), linhaRes('Despesas fixas', r.fixas, '− '), linhaRes('Despesas variáveis', r.variaveis, '− ')], ['Resultado do mês', reais(res.resultado)]) },
    ]));
    const maior = Math.max(1, ...r.porCategoria.map(([, v]) => v));
    raiz.appendChild(cartao('Para onde foi o dinheiro', 'Despesas do mês por categoria',
      r.porCategoria.length ? h('ul', { class: 'fin-barras' }, r.porCategoria.map(([cat, v]) => h('li', null,
        h('span', { class: 'fin-barra-nome' }, cat), h('span', { class: 'fin-barra-trilho' }, h('i', { style: { width: `${Math.round((v / maior) * 100)}%` } })), h('b', null, reais(v)))))
        : h('div', { class: 'ajuda' }, 'Nenhuma despesa lançada neste mês.')));
    // últimos 6 meses
    const meses = Array.from({ length: 6 }, (_, i) => F.somarMes(mes, -i));
    raiz.appendChild(cartao('Últimos 6 meses', null, h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela fin-tabela' },
      h('thead', null, h('tr', null, ['Mês', 'Contratos', 'Bruto', 'Líquido', 'Despesas', 'Resultado', 'Situação'].map((t) => h('th', null, t)))),
      h('tbody', null, meses.map((m) => {
        const f = F.faturamentoDoMes(contratos, m, { parametros, fechamentos });
        const x = F.resultadoDoMes(f, F.resumoLancamentos(lancs, m));
        const sit = f.fechado ? (f.fechado.recebido_em ? 'Recebido' : f.fechado.nfe ? 'NF-e emitida' : 'Fechado') : 'Aberto';
        return h('tr', { class: m === mes ? 'atual' : '' }, h('td', null, h('button', { type: 'button', class: 'btn-link', onclick: () => { estado.mes = m; desenhar(); } }, F.nomeMesCurto(m))),
          h('td', null, String(f.totais.contratos)), h('td', null, reais(f.totais.bruto)), h('td', null, reais(f.totais.liquido)), h('td', null, reais(x.despesas)),
          h('td', { class: x.resultado < 0 ? 'fin-neg' : '' }, reais(x.resultado)), h('td', null, sit));
      }))))));
  };
  await desenhar();
  return [cabecalho('Fechamento do mês', 'O que entrou da Caixa, as outras entradas, as despesas e o resultado da CCA no mês.'), raiz];
}

// ================= Itens para a "Sua vez" do nível 1 =================
export function itensFinanceiro(dados, hoje = new Date()) {
  if (!dados) return [];
  const { contratos, fechamentos, parametros } = dados;
  const itens = [];
  const aberto = F.mesAberto(hoje, fechamentos);
  // meses anteriores que ficaram sem fechar
  for (let i = 1; i <= 3; i++) {
    const m = F.somarMes(aberto, -i);
    const f = F.faturamentoDoMes(contratos, m, { parametros, fechamentos });
    if (!f.fechado && f.itens.length) itens.push({ tipo: 'fin', tom: 'alerta', icone: 'cifrao', valor: f.itens.length, titulo: `Fechar o faturamento de ${F.nomeMes(m)}`, detalhe: `Bruto de ${reais(f.totais.bruto)} para a NF-e`, href: '#/painel/faturamento' });
    else if (f.fechado && !f.fechado.nfe) itens.push({ tipo: 'fin', tom: 'atencao', icone: 'cifrao', valor: 1, titulo: `Emitir a NF-e de ${F.nomeMes(m)}`, detalhe: `Valor bruto: ${reais(f.fechado.bruto)}`, href: '#/painel/faturamento' });
  }
  const f = F.faturamentoDoMes(contratos, aberto, { parametros, fechamentos });
  if (f.pendentes) itens.push({ tipo: 'fin', tom: 'atencao', icone: 'cifrao', valor: f.pendentes, titulo: 'Faturamento: completar número e valor dos contratos', detalhe: f.itens.filter((x) => x.faltaDados).slice(0, 3).map((x) => x.nome).join(', '), href: '#/painel/faturamento' });
  if (F.dataLocal(hoje) === f.fechamento && f.itens.length) itens.push({ tipo: 'fin', tom: 'alerta', icone: 'cifrao', valor: f.itens.length, titulo: 'Hoje é o dia de fechar o faturamento', detalhe: `${F.nomeMes(aberto)} · bruto de ${reais(f.totais.bruto)}`, href: '#/painel/faturamento' });
  return itens;
}

// ================= Dados do contrato no painel do cliente (equipe) =================
export function blocoDadosContrato({ cliente, perfil, aoMudar }) {
  const etapas = ['minuta_em_maos', 'contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado'];
  if (!etapas.includes(cliente.status)) return null;
  const caixa = h('div', { class: 'bloco-secao divisor fin-contrato', id: 'dadosContrato' }, h('div', { class: 'ajuda' }, 'Carregando os dados do contrato…'));
  api.dadosContrato(cliente.id).then((c) => {
    limpar(caixa);
    const v = { contrato_numero: c?.contrato_numero || '', valor_financiado: valorCampo(c?.valor_financiado), contrato_assinado_em: F.dataLocal(c?.assinado_em) || '', empreendimento_caixa: !!c?.empreendimento_caixa };
    const comp = v.contrato_assinado_em ? F.competencia(v.contrato_assinado_em) : null;
    const calc = c?.valor_financiado || v.empreendimento_caixa ? F.calcular(c?.valor_financiado, F.PADRAO, { empreendimento: v.empreendimento_caixa }) : null;
    const salvar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', id: 'salvarDadosContrato' }, 'Salvar dados do contrato');
    salvar.onclick = async () => { salvar.disabled = true; try { await api.salvarDadosContrato(cliente.id, v); toast('Dados do contrato salvos.'); aoMudar(); } catch (e) { toast(e.message); salvar.disabled = false; } };
    const inp = (k, attrs) => h('input', { class: 'entrada', value: v[k], oninput: (e) => { v[k] = e.target.value; }, ...attrs });
    caixa.append(
      secaoTitulo('Dados do contrato', `Para o faturamento da CCA.${cliente.assinatura_contrato ? ` Assinatura: ${nomeAssin[cliente.assinatura_contrato]}.` : ''}`, { pequeno: true, nivel: 'h3', icone: 'cifrao' }),
      h('div', { class: 'fin-form fin-form-lateral' },
        h('label', { class: 'campo' }, h('span', null, 'Número do contrato'), inp('contrato_numero', { id: 'ctNumero', placeholder: 'Número' })),
        h('label', { class: 'campo' }, h('span', null, 'Valor financiado (R$)'), inp('valor_financiado', { id: 'ctValor', inputmode: 'numeric', placeholder: 'R$ 0,00', oninput: (e) => { mascaraMoeda(e); v.valor_financiado = e.target.value; } })),
        h('label', { class: 'campo' }, h('span', null, 'Assinado pelo gerente em'), inp('contrato_assinado_em', { id: 'ctData', type: 'date' })),
        h('label', { class: 'fin-emp-check' }, h('input', { type: 'checkbox', id: 'ctEmp', checked: v.empreendimento_caixa, onchange: (e) => { v.empreendimento_caixa = e.target.checked; } }),
          h('span', null, `Empreendimento Caixa (comissão fixa de ${reais(F.PADRAO.valor_empreendimento)})`))),
      comp ? h('div', { class: 'ajuda' }, `Entra no faturamento de ${F.nomeMes(comp)}.${perfil?.financeiro?.faturamento && calc ? ` A CCA recebe ${reais(calc.bruto)} bruto (${reais(calc.liquido)} líquido).` : ''}`) : null,
      h('div', { class: 'gest-acoes' }, salvar));
  }).catch(() => { limpar(caixa); });
  return caixa;
}
