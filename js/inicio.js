// Página inicial: painel da equipe (visão geral do negócio) e do corretor (o que depende dele).
import { h, limpar, icone } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho } from './componentes.js';
import { ETAPAS_ENGENHARIA, nomeTipoEngenharia, dataBR } from './engenharia-regras.js';
import * as D from './inicio-dados.js';

// ---------- escolhas da pessoa (guardadas no aparelho) ----------
const CHAVE = 'appcca-inicio';
const padrao = { periodo: 'mes', serie: 'minutas', rankGrupo: 'imobiliaria', rankMetrica: 'abertos', rankPeriodo: 'mes', engFiltro: 'vencendo' };
const escolhas = { ...padrao };
try { Object.assign(escolhas, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch { /* sem armazenamento */ }
const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(escolhas)); } catch { /* sem armazenamento */ } };

// ---------- peças ----------
const numero = (n) => Number(n).toLocaleString('pt-BR');
const enderecoCurto = (e) => [e.imovel_endereco, e.imovel_cidade && e.imovel_uf ? `${e.imovel_cidade}/${e.imovel_uf}` : null].filter(Boolean).join(' · ') || 'Endereço não informado';

function caixa(titulo, sub, controle, ...corpo) {
  corpo = corpo.flat();
  return h('section', { class: 'ini-cartao' },
    h('header', { class: 'ini-cartao-cab' },
      h('div', { class: 'ini-cartao-tit' }, h('h2', null, titulo), sub ? h('p', null, sub) : null),
      controle || null),
    ...corpo.filter(Boolean));
}

function seletor(rotulo, opcoes, valor, aoMudar) {
  const id = `ini-${Math.random().toString(36).slice(2, 8)}`;
  return h('label', { class: 'ini-seletor', for: id }, h('span', { class: 'sr' }, rotulo),
    h('select', { id, class: 'ini-select', 'aria-label': rotulo, onchange: (e) => aoMudar(e.target.value) },
      opcoes.map(([v, nome]) => h('option', { value: v, selected: v === valor }, nome))),
    icone('baixo', { tam: 14, traco: 2.4 }));
}

function pilulas(rotulo, opcoes, valor, aoMudar) {
  return h('div', { class: 'ini-pilulas', role: 'group', 'aria-label': rotulo },
    opcoes.map(([v, nome]) => h('button', { type: 'button', class: `ini-pilula${v === valor ? ' ativa' : ''}`, 'aria-pressed': v === valor ? 'true' : 'false', onclick: () => aoMudar(v) }, nome)));
}

function variacaoChip(ind, rotuloAnterior) {
  if (ind.variacao === null) return h('span', { class: 'ini-delta novo' }, 'novo', h('small', null, ` ${rotuloAnterior}: 0`));
  const sobe = ind.variacao > 0; const igual = ind.variacao === 0;
  return h('span', { class: `ini-delta ${igual ? 'igual' : sobe ? 'sobe' : 'desce'}` },
    igual ? '=' : sobe ? '↑' : '↓', ` ${Math.abs(ind.variacao)}%`, h('small', null, ` ${rotuloAnterior}: ${numero(ind.anterior)}`));
}

function linhaAcao(item, comValor = true) {
  return h('a', { class: `ini-acao tom-${item.tom}`, href: item.href },
    h('span', { class: 'ini-acao-ic' }, icone(item.icone || 'seta', { tam: 18, traco: 2 })),
    h('span', { class: 'ini-acao-txt' }, h('b', null, item.titulo), item.detalhe ? h('small', null, item.detalhe) : null),
    item.quando ? h('span', { class: `ini-chip tom-${item.tom}` }, item.quando) : (comValor && item.valor ? h('span', { class: `ini-chip tom-${item.tom}` }, numero(item.valor)) : null),
    icone('seta', { tam: 16, traco: 2.2 }));
}

const vazio = (texto, ic = 'check') => h('div', { class: 'ini-vazio' }, h('span', null, icone(ic, { tam: 20, traco: 2.4 })), texto);

function barrasMensais(serie) {
  const max = Math.max(1, ...serie.map((s) => s.valor));
  return h('div', { class: 'ini-barras', role: 'img', 'aria-label': serie.map((s) => `${s.rotulo}: ${s.valor}`).join(', ') },
    serie.map((s) => h('div', { class: `ini-barra${s.atual ? ' atual' : ''}` },
      h('span', { class: 'ini-barra-valor' }, numero(s.valor)),
      h('span', { class: 'ini-barra-coluna', style: { height: `${Math.max(s.valor ? 6 : 2, Math.round((s.valor / max) * 100))}%` } }),
      h('span', { class: 'ini-barra-mes' }, s.rotulo))));
}

function barrasHorizontais(lista, { cor = '' } = {}) {
  const max = Math.max(1, ...lista.map((x) => x.valor));
  return h('ul', { class: 'ini-hbarras' }, lista.map((x) => h('li', null,
    h('div', { class: 'ini-hb-topo' }, h('span', { class: 'ini-hb-nome' }, x.nome, x.sub ? h('small', null, x.sub) : null), h('b', null, numero(x.valor))),
    h('div', { class: `ini-hb-trilho ${cor}` }, h('span', { style: { width: `${x.valor ? Math.max(4, Math.round((x.valor / max) * 100)) : 0}%` } })))));
}

function dicaCartao(texto) {
  return h('section', { class: 'ini-cartao ini-dica' }, h('span', { class: 'ini-dica-ic' }, icone('lampada', { tam: 22, traco: 2 })),
    h('div', null, h('h2', null, 'Dica do dia'), h('p', null, texto)));
}

// ---------- blocos que se repetem nas duas páginas ----------
function blocoIndicadores(clientes, historico, { titulo = 'Como estamos' } = {}) {
  const corpo = h('div', { class: 'ini-kpis' });
  const rotuloAnt = () => (escolhas.periodo === 'mes' ? 'mês anterior' : escolhas.periodo === 'ano' ? 'ano anterior' : 'período anterior');
  const desenhar = () => {
    limpar(corpo);
    D.METRICAS.forEach(([cod, nome, dica]) => {
      const ind = D.indicador(cod, escolhas.periodo, clientes, historico);
      corpo.appendChild(h('div', { class: 'ini-kpi', title: dica }, h('span', { class: 'ini-kpi-nome' }, nome), h('span', { class: 'ini-kpi-valor' }, numero(ind.valor)), variacaoChip(ind, rotuloAnt())));
    });
    const andamento = clientes.filter((c) => !c.rascunho && !R.STATUS_FINAIS.includes(c.status)).length;
    corpo.appendChild(h('div', { class: 'ini-kpi suave', title: 'Clientes enviados que ainda não assinaram o contrato' }, h('span', { class: 'ini-kpi-nome' }, 'Em andamento agora'), h('span', { class: 'ini-kpi-valor' }, numero(andamento)), h('span', { class: 'ini-delta igual' }, 'neste momento')));
  };
  const controle = pilulas('Período', D.PERIODOS, escolhas.periodo, (v) => { escolhas.periodo = v; guardar(); desenhar(); marcar(); });
  const cab = h('div', { class: 'ini-secao' }, h('h2', null, titulo), controle);
  const marcar = () => { limpar(controle); D.PERIODOS.forEach(([v, nome]) => controle.appendChild(h('button', { type: 'button', class: `ini-pilula${v === escolhas.periodo ? ' ativa' : ''}`, 'aria-pressed': v === escolhas.periodo ? 'true' : 'false', onclick: () => { escolhas.periodo = v; guardar(); desenhar(); marcar(); } }, nome))); };
  desenhar();
  return h('div', { class: 'ini-bloco' }, cab, corpo);
}

function blocoComparativo(clientes, historico, titulo = 'Comparativo dos últimos meses') {
  const area = h('div', { class: 'ini-area' });
  const desenhar = () => {
    limpar(area);
    const serie = D.serieMensal(escolhas.serie, clientes, historico);
    const atual = serie[serie.length - 1]; const ant = serie[serie.length - 2];
    const nome = D.METRICAS.find(([k]) => k === escolhas.serie)?.[1] || '';
    const dif = atual.valor - ant.valor;
    area.appendChild(h('p', { class: 'ini-resumo' }, h('b', null, `${numero(atual.valor)} em ${atual.rotulo}`), ` · ${numero(ant.valor)} em ${ant.rotulo} `,
      h('span', { class: `ini-delta ${dif > 0 ? 'sobe' : dif < 0 ? 'desce' : 'igual'}` }, dif === 0 ? 'igual' : `${dif > 0 ? '↑' : '↓'} ${Math.abs(dif)}`)));
    area.appendChild(barrasMensais(serie));
    area.setAttribute('aria-label', nome);
  };
  const sel = seletor('Mostrar', D.METRICAS.map(([k, n]) => [k, n]), escolhas.serie, (v) => { escolhas.serie = v; guardar(); desenhar(); });
  const cartao = caixa(titulo, 'Mês atual em azul, comparado aos anteriores', sel, area);
  desenhar();
  return cartao;
}

function blocoFunil(clientes, titulo = 'Clientes em cada etapa') {
  const lista = D.funil(clientes);
  const total = lista.reduce((s, x) => s + x.valor, 0);
  return caixa(titulo, `${numero(total)} ${total === 1 ? 'processo enviado' : 'processos enviados'}`, null, total ? barrasHorizontais(lista) : vazio('Nenhum processo enviado ainda.', 'pessoas'));
}

function blocoEngenharias(engenharias, { href }) {
  const area = h('div');
  const desenhar = () => {
    limpar(area);
    const etapas = D.engenhariasPorEtapa(engenharias, ETAPAS_ENGENHARIA.map((e) => [e.codigo, e.nome]));
    const emCurso = etapas.filter((x) => x.valor > 0);
    area.appendChild(emCurso.length ? h('div', { class: 'ini-etapas' }, emCurso.map((x) => h('span', { class: 'ini-etapa' }, h('b', null, x.valor), ` ${x.nome}`))) : h('p', { class: 'ini-resumo' }, 'Nenhuma engenharia em andamento.'));
    let v = D.validades(engenharias);
    if (escolhas.engFiltro === 'vencendo') v = v.filter((x) => x.dias <= 30);
    area.appendChild(h('h3', { class: 'ini-sub' }, escolhas.engFiltro === 'vencendo' ? 'Laudos vencendo em até 30 dias' : 'Laudos aprovados'));
    area.appendChild(v.length ? h('ul', { class: 'ini-lista' }, v.slice(0, 5).map((x) => h('li', null, h('a', { href: `${href}/${x.e.id}`, class: 'ini-linha' },
      h('span', { class: 'ini-linha-txt' }, h('b', null, x.e.vendedor?.nome || 'Vendedor'), h('small', null, enderecoCurto(x.e))),
      h('span', { class: `ini-chip tom-${x.dias <= 10 ? 'alerta' : x.dias <= 30 ? 'atencao' : 'ok'}` }, x.dias < 0 ? `vencido há ${-x.dias}d` : x.dias === 0 ? 'vence hoje' : `${x.dias} dias`),
      h('small', { class: 'ini-linha-data' }, `até ${dataBR(x.validade)}`)))))
      : vazio(escolhas.engFiltro === 'vencendo' ? 'Nenhum laudo vence nos próximos 30 dias.' : 'Ainda não há laudos aprovados.'));
  };
  const sel = seletor('Laudos', [['vencendo', 'Vencendo'], ['todos', 'Todos']], escolhas.engFiltro, (x) => { escolhas.engFiltro = x; guardar(); desenhar(); });
  const cartao = caixa('Engenharias', 'Andamento e validade dos laudos (180 dias)', sel, area, h('a', { class: 'ini-ver-tudo', href }, 'Ver todas as engenharias', icone('seta', { tam: 14, traco: 2.4 })));
  desenhar();
  return cartao;
}

function blocoRanking(clientes, historico, { titulo, grupos }) {
  const area = h('div');
  const controles = h('div', { class: 'ini-controles' });
  const desenhar = () => {
    limpar(area); limpar(controles);
    const r = D.ranking(escolhas.rankGrupo, escolhas.rankMetrica, escolhas.rankPeriodo, clientes, historico);
    const nomeMetrica = D.METRICAS.find(([k]) => k === escolhas.rankMetrica)?.[1]?.toLowerCase() || '';
    controles.appendChild(seletor('Agrupar por', grupos, escolhas.rankGrupo, (v) => { escolhas.rankGrupo = v; guardar(); desenhar(); }));
    controles.appendChild(seletor('Contar', D.METRICAS.map(([k, n]) => [k, n]), escolhas.rankMetrica, (v) => { escolhas.rankMetrica = v; guardar(); desenhar(); }));
    controles.appendChild(seletor('Período', D.PERIODOS, escolhas.rankPeriodo, (v) => { escolhas.rankPeriodo = v; guardar(); desenhar(); }));
    if (!r.itens.length) { area.appendChild(vazio('Nada neste período. Troque o período ou o que está sendo contado.', 'grafico')); return; }
    area.appendChild(h('p', { class: 'ini-resumo' }, `${numero(r.total)} ${r.total === 1 ? nomeMetrica.replace(/s( |$)/, '$1') : nomeMetrica} no período`));
    area.appendChild(barrasHorizontais(r.itens, { cor: 'azul' }));
    if (r.restantes) area.appendChild(h('p', { class: 'ini-mais' }, `+ ${r.restantes} ${r.restantes === 1 ? 'outro' : 'outros'}`));
  };
  const cartao = caixa(titulo, 'Quem mais trouxe movimento', null, controles, area);
  desenhar();
  return cartao;
}

function blocoFazer(itens, { titulo = 'Precisa de você', vazioTexto = 'Tudo em dia por aqui.' }) {
  return caixa(titulo, itens.length ? `${itens.length} ${itens.length === 1 ? 'assunto' : 'assuntos'} esperando` : null, null,
    itens.length ? [h('div', { class: 'ini-acoes' }, itens.slice(0, 6).map((i) => linhaAcao(i))), itens.length > 6 ? h('p', { class: 'ini-mais' }, `+ ${itens.length - 6} ${itens.length - 6 === 1 ? 'outro assunto' : 'outros assuntos'} nas telas do menu`) : null] : vazio(vazioTexto));
}
function blocoPrazos(itens, { titulo = 'Prazos e validades' } = {}) {
  return caixa(titulo, 'Entrevistas, laudos e certidões com data', null,
    itens.length ? h('div', { class: 'ini-acoes' }, itens.slice(0, 6).map((i) => linhaAcao(i, false))) : vazio('Nenhum prazo nos próximos dias.', 'calendario'));
}

function resumoHero(fazer, prazos) {
  const urgentes = [...fazer, ...prazos].filter((x) => x.tom === 'alerta').length;
  if (!fazer.length && !prazos.length) return 'Tudo em dia. Nada esperando por você agora.';
  if (urgentes) return `${urgentes} ${urgentes === 1 ? 'assunto pede' : 'assuntos pedem'} atenção hoje. O resto está encaminhado.`;
  return `${fazer.length + prazos.length} ${fazer.length + prazos.length === 1 ? 'assunto' : 'assuntos'} para acompanhar. Nada urgente.`;
}

const dataExtensa = (agora) => agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (x) => x.toUpperCase());
const seguro = (p, vazioPadrao = []) => p.catch(() => vazioPadrao);

// ---------- página do painel da equipe ----------
export async function inicioEquipe({ perfil, config, docsConferir = [] }) {
  const agora = new Date();
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const [clientes, historico, engenharias, entrevistas, verificacoes, emissoes] = await Promise.all([
    seguro(api.listarClientes()), seguro(api.historicoStatus()), R.pode(perfil, 'mudar_status') ? seguro(api.listarEngenharias()) : [],
    R.pode(perfil, 'mudar_status') ? seguro(api.listarEntrevistas()) : [], R.pode(perfil, 'conferir_documentos') ? seguro(api.listarVerificacoes()) : [], seguro(api.listarEmissoes())]);
  const { fazer, prazos } = D.pendenciasEquipe({ clientes, engenharias, entrevistas, docsConferir, verificacoes, emissoes, tipos: config?.tipos || [], limiteParado, agora });
  const atividade = D.atividadeRecente(clientes, historico, { agora });
  const grupos = [['imobiliaria', 'Imobiliárias'], ['corretor', 'Corretores']];
  return [
    cabecalho({ sobre: dataExtensa(agora), titulo: `${D.saudacao(agora)}, ${R.primeiroNome(perfil.nome)}`, sub: resumoHero(fazer, prazos), foto: 'inicio-adm' }),
    h('div', { class: 'ini-grade' },
      h('div', { class: 'ini-col-7' }, blocoFazer(fazer, {})), h('div', { class: 'ini-col-5' }, blocoPrazos(prazos)),
      h('div', { class: 'ini-col-12' }, blocoIndicadores(clientes, historico)),
      h('div', { class: 'ini-col-7' }, blocoComparativo(clientes, historico)), h('div', { class: 'ini-col-5' }, blocoFunil(clientes)),
      h('div', { class: 'ini-col-7' }, blocoRanking(clientes, historico, { titulo: 'Principais clientes', grupos })), h('div', { class: 'ini-col-5' }, blocoEngenharias(engenharias, { href: '#/painel/engenharia' })),
      h('div', { class: 'ini-col-7' }, caixa('Movimento recente', 'Últimas mudanças de etapa', null,
        atividade.length ? h('ul', { class: 'ini-lista' }, atividade.map((a) => h('li', null, h('a', { class: 'ini-linha', href: `#/painel/clientes/${a.cliente.id}` },
          h('span', { class: 'ini-linha-txt' }, h('b', null, a.cliente.nome), h('small', null, `${a.cliente.corretor_nome || ''}${a.cliente.imobiliaria_nome ? ` · ${a.cliente.imobiliaria_nome}` : ''}`)),
          h('span', { class: 'ini-chip tom-info' }, a.paraNome), h('small', { class: 'ini-linha-data' }, D.quandoCurto(a.dias)))))) : vazio('Sem movimento ainda.', 'historico'))),
      h('div', { class: 'ini-col-5' }, dicaCartao(D.dicaDoDia(D.DICAS_EQUIPE, agora)))),
  ];
}

// ---------- página do corretor / gestor da imobiliária ----------
export async function inicioCorretor({ perfil, config }) {
  const agora = new Date();
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const [clientes, historico, engenharias, entrevistas, emissoes] = await Promise.all([seguro(api.listarClientes()), seguro(api.historicoStatus()), seguro(api.listarEngenharias()), seguro(api.listarEntrevistas()), seguro(api.listarEmissoes())]);
  const gestor = perfil.papel === 'gestor_imobiliaria';
  const { fazer, prazos } = D.pendenciasCorretor({ clientes, engenharias, entrevistas, emissoes, tipos: config?.tipos || [], limiteParado, agora });
  if (gestor) escolhas.rankGrupo = 'corretor';
  return [
    cabecalho({ sobre: dataExtensa(agora), titulo: `${D.saudacao(agora)}, ${R.primeiroNome(perfil.nome)}`, sub: resumoHero(fazer, prazos), foto: 'inicio-corretor' }),
    h('div', { class: 'ini-grade' },
      h('div', { class: 'ini-col-7' }, blocoFazer(fazer, { titulo: 'O que depende de você', vazioTexto: 'Nada esperando por você. Bom trabalho!' })), h('div', { class: 'ini-col-5' }, blocoPrazos(prazos)),
      h('div', { class: 'ini-col-12' }, blocoIndicadores(clientes, historico, { titulo: gestor ? 'Como está a imobiliária' : 'Como estão seus clientes' })),
      h('div', { class: 'ini-col-7' }, blocoComparativo(clientes, historico, 'Comparativo dos últimos meses')), h('div', { class: 'ini-col-5' }, blocoFunil(clientes, gestor ? 'Clientes em cada etapa' : 'Seus clientes em cada etapa')),
      gestor ? h('div', { class: 'ini-col-7' }, blocoRanking(clientes, historico, { titulo: 'Corretores da imobiliária', grupos: [['corretor', 'Corretores']] })) : null,
      h('div', { class: gestor ? 'ini-col-5' : 'ini-col-7' }, blocoEngenharias(engenharias, { href: '#/engenharia' })),
      h('div', { class: gestor ? 'ini-col-12' : 'ini-col-5' }, dicaCartao(D.dicaDoDia(D.DICAS_CORRETOR, agora)))),
  ];
}
