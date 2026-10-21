// Tela "Campanhas e desempenho" do portal: corretor (os próprios números) e imobiliária (CEO e gestor: cada corretor).
import { h, limpar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho } from './componentes.js';
import * as D from './inicio-dados.js';
import * as P from './desempenho-dados.js';
import { nomeMes, mesIso } from './campanhas-dados.js';
import { caixa, pilulas, vazio, numero, blocoIndicadores, blocoComparativo, blocoRanking, blocoPosicao, blocoCampanhas, blocoMetas, carregarCampanhas, seguro, escolhas, guardar } from './inicio.js';

// Cores das linhas e fatias (paleta da CCA, com contraste entre vizinhas)
const CORES = ['#3D657C', '#D88934', '#26323A', '#7FA9C2', '#B8732A', '#5A646B', '#A9B3BA'];
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...filhos) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const f of filhos.flat()) if (f !== null && f !== undefined) el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
  return el;
};

// ---------- gráfico de linhas: evolução acumulada dentro do mês ----------
function graficoLinhas(ev) {
  const L = 340; const A = 190; const m = { e: 30, d: 12, t: 12, b: 26 };
  const larg = L - m.e - m.d; const alt = A - m.t - m.b;
  const max = Math.max(1, ...ev.series.flatMap((x) => x.valores.filter((v) => v !== null)));
  const passo = max <= 4 ? 1 : Math.ceil(max / 4);
  const topo = Math.ceil(max / passo) * passo;
  const x = (i) => m.e + (ev.dias === 1 ? 0 : (i / (ev.dias - 1)) * larg);
  const y = (v) => m.t + alt - (v / topo) * alt;
  const grade = [];
  for (let v = 0; v <= topo; v += passo) {
    grade.push(s('line', { x1: m.e, x2: L - m.d, y1: y(v), y2: y(v), class: 'dsp-grade' }));
    grade.push(s('text', { x: m.e - 6, y: y(v) + 4, class: 'dsp-eixo', 'text-anchor': 'end' }, String(v)));
  }
  const marcas = [1, 8, 15, 22, ev.dias].filter((d, i, a) => a.indexOf(d) === i && d <= ev.dias)
    .map((d) => s('text', { x: x(d - 1), y: A - 8, class: 'dsp-eixo', 'text-anchor': d === 1 ? 'start' : d === ev.dias ? 'end' : 'middle' }, String(d)));
  const hojeX = x(ev.hoje - 1);
  const linhas = ev.series.map((se, i) => {
    // degraus: a soma só muda no dia em que acontece (linha reta até o dia, depois sobe)
    const pts = [];
    se.valores.forEach((v, j) => { if (v === null) return; if (j > 0 && se.valores[j - 1] !== null && se.valores[j - 1] !== v) pts.push(`${x(j).toFixed(1)},${y(se.valores[j - 1]).toFixed(1)}`); pts.push(`${x(j).toFixed(1)},${y(v).toFixed(1)}`); });
    if (!pts.length) return null;
    const cor = se.cor || CORES[i % CORES.length];
    const ultimo = se.valores.reduce((k, v, j) => (v === null ? k : j), 0);
    return s('g', null,
      s('polyline', { points: pts.join(' '), fill: 'none', stroke: cor, 'stroke-width': se.destaque ? 3 : 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': se.tracejada ? '5 4' : null }),
      se.tracejada ? null : s('circle', { cx: x(ultimo), cy: y(se.valores[ultimo]), r: se.destaque ? 4.5 : 3.5, fill: cor, stroke: '#FFFFFF', 'stroke-width': 1.5 }));
  });
  const rotulo = ev.series.map((se) => `${se.nome}: ${se.total}`).join('; ');
  return s('svg', { viewBox: `0 0 ${L} ${A}`, class: 'dsp-linhas', role: 'img', 'aria-label': `Evolução no mês, dia a dia. ${rotulo}` },
    ...grade, ...marcas,
    s('line', { x1: hojeX, x2: hojeX, y1: m.t, y2: m.t + alt, class: 'dsp-hoje' }),
    s('text', { x: Math.min(hojeX + 4, L - m.d - 26), y: m.t + 10, class: 'dsp-eixo forte' }, 'hoje'),
    ...linhas.filter(Boolean));
}

const corLegenda = (cor, tracejada, quadrado = false) => h('span', { class: `dsp-cor${quadrado ? ' quadrado' : ''}`, 'aria-hidden': 'true',
  style: { background: tracejada ? `repeating-linear-gradient(90deg, ${cor} 0 5px, transparent 5px 9px)` : cor } });

function legendaLinhas(ev) {
  return h('ul', { class: 'dsp-legenda' }, ev.series.map((se, i) => h('li', null,
    corLegenda(se.cor || CORES[i % CORES.length], se.tracejada),
    h('span', { class: 'dsp-leg-nome' }, se.nome), h('b', null, numero(se.total)))));
}

function blocoEvolucao(clientes, historico, { grupo, nomes, titulo }) {
  const area = h('div', { class: 'dsp-evolucao' });
  const metr = D.METRICAS.map(([k, n]) => [k, n.replace('Chegaram na etapa Contrato', 'Etapa Contrato')]);
  const desenhar = () => {
    limpar(area);
    const ev = P.evolucaoDoMes(escolhas.dspMetrica || 'abertos', clientes, historico, { grupo, nomes });
    if (grupo === 'corretor' && ev.semEventos) { area.appendChild(vazio('Nenhum movimento neste mês ainda. As linhas aparecem com o primeiro cadastro.', 'grafico')); return; }
    area.append(graficoLinhas(ev), legendaLinhas(ev));
  };
  const controle = pilulas('O que contar', metr, escolhas.dspMetrica || 'abertos', (v) => { escolhas.dspMetrica = v; guardar(); desenhar(); marcar(); });
  const marcar = () => controle.querySelectorAll('button').forEach((b, i) => { const at = metr[i][0] === (escolhas.dspMetrica || 'abertos'); b.classList.toggle('ativa', at); b.setAttribute('aria-pressed', at ? 'true' : 'false'); });
  desenhar();
  return caixa(titulo, grupo === 'corretor' ? 'Soma acumulada dia a dia, uma linha por corretor' : 'Soma acumulada dia a dia, comparada ao mês anterior', null, h('div', { class: 'dsp-controle' }, controle), area);
}

// ---------- gráfico de pizza (rosca) ----------
function rosca(itens, { centro, sub }) {
  const total = itens.reduce((t, x) => t + x.valor, 0);
  const R0 = 62; const esp = 22; const C = 2 * Math.PI * R0;
  let acum = 0;
  const fatias = itens.filter((x) => x.valor > 0).map((x, i) => {
    const frac = x.valor / total; const el = s('circle', { cx: 80, cy: 80, r: R0, fill: 'none', stroke: x.cor || CORES[i % CORES.length], 'stroke-width': esp,
      'stroke-dasharray': `${(frac * C).toFixed(2)} ${C.toFixed(2)}`, 'stroke-dashoffset': (-acum * C).toFixed(2), transform: 'rotate(-90 80 80)' });
    acum += frac; return el;
  });
  return s('svg', { viewBox: '0 0 160 160', class: 'dsp-rosca', role: 'img', 'aria-label': itens.map((x) => `${x.nome}: ${x.valor}`).join('; ') },
    s('circle', { cx: 80, cy: 80, r: R0, fill: 'none', class: 'dsp-rosca-fundo', 'stroke-width': esp }), ...fatias,
    s('text', { x: 80, y: 82, 'text-anchor': 'middle', class: 'dsp-rosca-n' }, centro),
    s('text', { x: 80, y: 101, 'text-anchor': 'middle', class: 'dsp-rosca-sub' }, sub));
}

function blocoPizza(titulo, subtitulo, dados, { vazioTexto }) {
  const itens = dados.itens.map((x, i) => ({ ...x, cor: CORES[i % CORES.length] }));
  if (!dados.total) return caixa(titulo, subtitulo, null, vazio(vazioTexto, 'grafico'));
  return caixa(titulo, subtitulo, null, h('div', { class: 'dsp-pizza' },
    rosca(itens, { centro: numero(dados.total), sub: dados.total === 1 ? 'processo' : 'processos' }),
    h('ul', { class: 'dsp-legenda' }, itens.map((x) => h('li', { class: x.valor ? '' : 'zero' },
      corLegenda(x.cor, false, true), h('span', { class: 'dsp-leg-nome' }, x.nome),
      h('b', null, numero(x.valor)), h('small', null, `${Math.round((x.valor / dados.total) * 100)}%`))))));
}

// ---------- página ----------
export async function conteudoDesempenho({ perfil }) {
  const agora = new Date();
  const daImob = perfil.papel === 'gestor_imobiliaria';
  const consumidor = R.ehConsumidor(perfil);
  const [clientes, historico, corretores, posicao, campanhas] = await Promise.all([
    seguro(api.listarClientes()), seguro(api.historicoStatus()),
    daImob ? seguro(api.corretoresDaImobiliaria()) : [],
    !daImob && !consumidor ? seguro(api.minhaPosicao(), null) : null,
    consumidor ? [] : carregarCampanhas(agora, { equipe: false })]);
  const nomes = Object.fromEntries(corretores.filter((c) => c.papel === 'corretor').map((c) => [c.id, c.nome]));
  const enviados = clientes.filter((c) => !c.rascunho);
  const programa = D.porPrograma(clientes);
  const fases = P.porFase(clientes);
  const blocos = [
    blocoIndicadores(clientes, historico, { titulo: daImob ? 'Números da imobiliária' : 'Seus números' }),
    h('div', { class: 'ini-grade' },
      h('div', { class: 'ini-col-12' }, blocoEvolucao(clientes, historico, { grupo: daImob ? 'corretor' : 'eu', nomes, titulo: `Evolução em ${nomeMes(mesIso(agora)).replace(/ de \d+$/, '')}` })),
      h('div', { class: 'ini-col-6' }, blocoPizza('Processos por fase', 'Onde estão os processos agora', fases, { vazioTexto: 'Nenhum processo enviado ainda.' })),
      h('div', { class: 'ini-col-6' }, blocoPizza('Processos por programa', 'MCMV, SBPE, Pró-Cotista...', programa, { vazioTexto: 'Nenhum processo enviado ainda.' })),
      h('div', { class: 'ini-col-7' }, blocoComparativo(clientes, historico, 'Últimos 6 meses')),
      daImob ? h('div', { class: 'ini-col-5' }, blocoRanking(clientes, historico, { titulo: 'Corretores da imobiliária', grupos: [['corretor', 'Corretores']] }))
        : posicao ? h('div', { class: 'ini-col-5' }, blocoPosicao(posicao)) : null,
      h('div', { class: 'ini-col-12' }, blocoMetas({ titulo: daImob ? 'Meta do mês da imobiliária' : 'Sua meta do mês', sub: 'Defina a meta. Fica salva neste aparelho.',
        metas: () => D.metasDoMes(escolhas.metaPessoal, clientes, historico, agora), podeEditar: true, textoVazio: 'Defina quantos processos, minutas e contratos quer neste mês.',
        salvar: async (v) => { escolhas.metaPessoal = v; guardar(); } }))),
    campanhas.length ? h('section', { class: 'dsp-campanhas' }, h('div', { class: 'ini-secao' }, h('h2', null, 'Campanhas da CCA')), blocoCampanhas(campanhas, { equipe: false }))
      : h('section', { class: 'dsp-campanhas' }, caixa('Campanhas da CCA', null, null, vazio('Nenhuma campanha em andamento agora. Quando a CCA lançar uma, o placar aparece aqui.', 'trofeu'))),
  ];
  return [
    cabecalho({ sobre: daImob ? (perfil.imobiliaria_nome || 'Imobiliária') : 'Corretor', titulo: 'Campanhas e desempenho',
      sub: `${nomeMes(mesIso(agora))} · ${numero(enviados.length)} ${enviados.length === 1 ? 'processo enviado' : 'processos enviados'} no total` }),
    ...blocos.filter(Boolean),
  ];
}
