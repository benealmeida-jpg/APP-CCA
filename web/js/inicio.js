// Página inicial: painel da equipe (visão geral do negócio) e do corretor (o que depende dele).
import { h, limpar, icone } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho } from './componentes.js';
import { ETAPAS_ENGENHARIA, nomeTipoEngenharia, dataBR } from './engenharia-regras.js';
import * as D from './inicio-dados.js';
import * as K from './campanhas-dados.js';
import { colunaCategoria, chipEstado, irParaCampanhas } from './campanhas.js';
import { MODELO2 } from './config.js';
import * as F from './fluxo-dados.js';
import { blocoMuralInicio, itensDamp } from './modelo2.js';

// ---------- escolhas da pessoa (guardadas no aparelho) ----------
const CHAVE = MODELO2 ? 'appcca-inicio-m2' : 'appcca-inicio';
// Modelo 2: cada perfil abre com poucos blocos, "Sua vez" primeiro; o resto fica em Personalizar
const PADRAO_M2 = { equipe: ['fazer', 'prazos', 'indicadores', 'campanhas'], corretor: ['fazer', 'mural', 'prazos', 'metas', 'posicao', 'campanhas'], ceo: ['fazer', 'mural', 'indicadores', 'ranking', 'prazos'], gestor: ['fazer', 'mural', 'prazos', 'funil'] };
const padrao = { blocos: {}, metaPessoal: {}, periodo: 'mes', serie: 'minutas', rankGrupo: 'imobiliaria', rankMetrica: 'abertos', rankPeriodo: 'mes', engFiltro: 'vencendo' };
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

// ---------- novos blocos ----------
const wa = (tel, texto) => { const d = R.soDigitos(R.celularInternacional(tel) || ''); return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null; };
const botaoWa = (tel, texto, rotulo = 'WhatsApp') => { const href = wa(tel, texto); return href ? h('a', { class: 'ini-wa', href, target: '_blank', rel: 'noopener', 'aria-label': rotulo, title: rotulo }, icone('conversa', { tam: 16, traco: 2.2 }), h('span', null, rotulo)) : null; };
const dm = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function blocoAtalhos(itens) {
  return h('nav', { class: 'ini-atalhos', 'aria-label': 'Atalhos' }, itens.map((i) => h('a', { class: 'ini-atalho', href: i.href },
    h('span', { class: 'ini-atalho-ic' }, icone(i.icone, { tam: 20, traco: 2 })), h('span', null, i.nome), i.num ? h('b', { class: 'ini-atalho-num' }, numero(i.num)) : null)));
}

// Metas do mês: barra de progresso com a marca de "onde deveríamos estar hoje"
function blocoMetas({ titulo, sub, metas, podeEditar, salvar, textoVazio, rodape = null }) {
  const area = h('div'); let editando = false;
  const rotuloRitmo = { batida: ['Meta batida', 'ok'], no_ritmo: ['No ritmo', 'info'], atrasada: ['Atrasada', 'atencao'] };
  const desenhar = () => {
    limpar(area);
    const lista = metas();
    if (editando) {
      const campos = lista.map((m) => h('div', { class: 'campo' }, h('label', { for: `meta-${m.cod}` }, m.nome), h('input', { id: `meta-${m.cod}`, class: 'entrada', type: 'number', min: '0', inputmode: 'numeric', value: m.meta || '' })));
      area.appendChild(h('div', { class: 'ini-meta-form' }, campos, h('div', { class: 'linha-botoes' },
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { editando = false; desenhar(); } }, 'Cancelar'),
        h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try { await salvar(Object.fromEntries(lista.map((m) => [m.cod, Math.max(0, Math.round(Number(area.querySelector(`#meta-${m.cod}`).value) || 0))]))); editando = false; desenhar(); } catch (e) { toastLeve(e.message); ev.currentTarget.disabled = false; }
        } }, 'Salvar metas'))));
      return;
    }
    if (!lista.some((m) => m.meta)) area.appendChild(vazio(textoVazio, 'grafico'));
    else lista.filter((m) => m.meta).forEach((m) => {
      const [txt, tom] = rotuloRitmo[m.ritmo];
      area.appendChild(h('div', { class: 'ini-meta' },
        h('div', { class: 'ini-meta-topo' }, h('span', null, m.nome), h('b', null, `${numero(m.valor)} de ${numero(m.meta)}`),
          h('span', { class: `ini-chip tom-${tom}` }, m.ritmo === 'atrasada' ? `${txt}: faltam ${numero(m.falta)}` : txt)),
        h('div', { class: 'ini-meta-trilho', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, m.pct)), 'aria-label': `${m.nome}: ${m.pct}% da meta` },
          h('span', { class: `ini-meta-barra ${m.ritmo}`, style: { width: `${Math.min(100, m.pct)}%` } }), m.ritmo === 'batida' ? null : h('i', { class: 'ini-meta-hoje', style: { left: `${m.esperadoPct}%` }, title: 'Onde deveríamos estar hoje' }))));
    });
    if (podeEditar) area.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', style: { alignSelf: 'flex-start' }, onclick: () => { editando = true; desenhar(); } }, lista.some((m) => m.meta) ? 'Alterar metas' : 'Definir metas'));
  };
  desenhar();
  return caixa(titulo, sub, null, area);
}

function blocoAniversariantes(clientes, { agora, saudacaoDe }) {
  const lista = D.aniversariantes(clientes, agora);
  const mes = agora.toLocaleDateString('pt-BR', { month: 'long' });
  return caixa('Aniversariantes do mês', lista.length ? `${lista.length} ${lista.length === 1 ? 'cliente faz' : 'clientes fazem'} aniversário em ${mes}` : `Clientes que fazem aniversário em ${mes}`, null,
    lista.length ? h('ul', { class: 'ini-lista ini-rolagem' }, lista.map((x) => h('li', null, h('div', { class: `ini-linha${x.hoje ? ' destaque' : ''}` },
      h('span', { class: 'ini-linha-txt' }, h('b', null, x.c.nome), h('small', null, `${x.hoje ? 'Faz' : x.passou ? 'Fez' : 'Faz'} ${x.idade} anos · dia ${x.dia}`)),
      x.hoje ? h('span', { class: 'ini-chip tom-atencao' }, 'Hoje 🎉') : h('small', { class: 'ini-linha-data' }, `${String(x.dia).padStart(2, '0')}/${String(x.mes + 1).padStart(2, '0')}`),
      botaoWa(x.c.celular, saudacaoDe(x.c), 'Parabenizar'))))) : vazio('Nenhum aniversário neste mês.', 'pessoas'));
}

function blocoContratos(clientes, historico, { agora, mensagemDe }) {
  const lista = D.aniversarioContrato(clientes, historico, { agora });
  return caixa('Aniversário de contrato', 'Clientes que assinaram há 1 ano ou mais: bom momento para um contato de pós-venda', null,
    lista.length ? h('ul', { class: 'ini-lista' }, lista.map((x) => h('li', null, h('div', { class: 'ini-linha' },
      h('span', { class: 'ini-linha-txt' }, h('b', null, x.c.nome), h('small', null, `${x.anos} ${x.anos === 1 ? 'ano' : 'anos'} de contrato · dia ${dm(x.data)}`)),
      h('span', { class: `ini-chip tom-${x.dias <= 0 ? 'atencao' : 'info'}` }, x.dias < 0 ? `foi há ${-x.dias}d` : x.dias === 0 ? 'hoje' : `em ${x.dias}d`),
      botaoWa(x.c.celular, mensagemDe(x.c, x.anos), 'Contato'))))) : vazio('Nenhum aniversário de contrato nos próximos 30 dias.', 'calendario'));
}

function blocoResumoSemana(clientes, historico, { agora, limiteParado, nome }) {
  const r = D.resumoSemana(clientes, historico, { agora, limiteParado, nome });
  const copiar = async () => { try { await navigator.clipboard.writeText(r.texto); toastLeve('Resumo copiado.'); } catch { toastLeve('Não consegui copiar. Use o botão do WhatsApp.'); } };
  return caixa('Resumo da semana', 'Últimos 7 dias, comparado com a semana anterior', null,
    h('div', { class: 'ini-semana' }, r.linhas.map((l) => h('div', { class: 'ini-semana-item' }, h('span', null, l.rot), h('b', null, numero(l.valor)),
      h('small', { class: l.valor > l.anterior ? 'sobe' : l.valor < l.anterior ? 'desce' : '' }, l.valor === l.anterior ? `igual (${l.anterior})` : `${l.valor > l.anterior ? '↑' : '↓'} antes: ${l.anterior}`)))),
    h('p', { class: 'ini-resumo' }, `${r.parados} ${r.parados === 1 ? 'processo parado' : 'processos parados'} · ${r.msgs} ${r.msgs === 1 ? 'cliente com mensagem sem resposta' : 'clientes com mensagem sem resposta'}`),
    h('div', { class: 'ini-acoes-linha' },
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: copiar }, 'Copiar resumo'),
      h('a', { class: 'btn btn-contorno btn-pequeno', href: `https://wa.me/?text=${encodeURIComponent(r.texto)}`, target: '_blank', rel: 'noopener' }, 'Enviar pelo WhatsApp')));
}
function toastLeve(t) { import('./dom.js').then((m) => m.toast(t)); }

function blocoPrograma(clientes) {
  const r = D.porPrograma(clientes);
  return caixa('Clientes por programa', `${numero(r.total)} ${r.total === 1 ? 'processo enviado' : 'processos enviados'} (MCMV, SBPE, Pró-Cotista...)`, null,
    r.total ? barrasHorizontais(r.itens, { cor: 'azul' }) : vazio('Nenhum processo enviado ainda.', 'pessoas'));
}

function blocoTempoEtapas(clientes, historico) {
  const r = D.tempoPorEtapa(historico, clientes);
  return caixa('Tempo em cada etapa', r.maisLenta ? `Média de dias que o processo fica em cada etapa · a mais demorada: ${r.maisLenta.nome} (${numero(r.maisLenta.media)} dias)` : 'Média de dias que o processo fica em cada etapa', null,
    r.itens.length ? barrasHorizontais(r.itens.map((x) => ({ nome: x.nome, sub: `${x.n} ${x.n === 1 ? 'processo' : 'processos'}`, valor: x.media })), { cor: '' }) : vazio('Ainda não há andamento suficiente para calcular.', 'historico'));
}

function blocoRecusas(docs, agora) {
  const r = D.motivosRecusa(docs, { agora });
  return caixa('Motivos de recusa', r.total ? `${numero(r.total)} ${r.total === 1 ? 'documento recusado' : 'documentos recusados'} nos últimos 90 dias` : 'Documentos recusados nos últimos 90 dias', null,
    r.total ? [barrasHorizontais(r.itens), r.restantes ? h('p', { class: 'ini-mais' }, `+ ${r.restantes} ${r.restantes === 1 ? 'outro motivo' : 'outros motivos'}`) : null,
      h('p', { class: 'ini-resumo' }, 'Os mais frequentes viram orientação para os corretores: um aviso ou treinamento reduz o retrabalho.')] : vazio('Nenhuma recusa no período.', 'doc'));
}

function blocoInativos(lista) {
  return caixa('Corretores sem cadastro novo', 'Sem enviar cliente há 30 dias ou mais', null,
    lista.length ? h('ul', { class: 'ini-lista ini-rolagem' }, lista.slice(0, 8).map((x) => h('li', null, h('div', { class: 'ini-linha' },
      h('span', { class: 'ini-linha-txt' }, h('b', null, x.nome), h('small', null, x.imobiliaria)),
      h('span', { class: 'ini-chip tom-atencao' }, x.nunca ? 'nunca enviou' : `há ${x.dias} dias`),
      botaoWa(x.whatsapp, `Oi, ${R.primeiroNome(x.nome)}! Aqui é da Andrade Almeida CCA. Faz um tempo que não recebemos um cadastro seu. Posso ajudar com alguma dúvida ou novo cliente?`, 'Chamar'))))) : vazio('Todos os corretores enviaram cadastro neste mês.'));
}

// Campanhas em andamento (ou recém-encerradas): prêmio, placar e a posição de quem está olhando
function blocoCampanhas(itens, { equipe }) {
  if (!itens.length) return null;
  return h('div', { class: 'camp-pilha' }, itens.map(({ c, s, placar }) => {
    const pendente = equipe && s.estado === 'encerrada' && K.premiosAtivos(c).some((p) => !p.entregue_em);
    return caixa(c.nome, `${K.periodoTexto(c)} · conta: ${K.nomeMetrica(c.metrica).toLowerCase()} · ${K.regraPontos(c)}`, h('div', { class: 'camp-chips' }, chipEstado(s), h('small', null, pendente ? 'Falta apurar e entregar os prêmios' : s.detalhe)),
      c.descricao ? h('p', { class: 'camp-desc' }, c.descricao) : null,
      h('div', { class: 'camp-cats' }, K.categoriasDaCampanha(c).map((k) => colunaCategoria(c, k, K.doGrupo(K.placarVisivel(placar, c, { equipe }), k), { limite: 3 }))),
      c.regulamento ? h('details', { class: 'camp-regulamento' }, h('summary', null, 'Regulamento'), h('p', null, c.regulamento)) : null,
      equipe ? h('div', { class: 'linha-botoes camp-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => irParaCampanhas({ aba: 'campanhas', id: c.id }) }, 'Abrir campanha')) : null);
  }));
}

function blocoPosicao(pos) {
  if (!pos) return null;
  const lider = pos.posicao === 1 && pos.meus > 0;
  return caixa('Sua posição no mês', 'Entre os corretores da CCA, por cadastros enviados', null,
    h('div', { class: 'ini-posicao' }, h('span', { class: 'ini-posicao-n' }, `${pos.posicao}º`), h('div', null,
      h('b', null, lider ? 'Você lidera este mês!' : `de ${pos.total} corretores`),
      h('small', null, `${numero(pos.meus)} ${pos.meus === 1 ? 'cadastro' : 'cadastros'} seus${lider ? '' : ` · líder: ${numero(pos.lider)}`}`))));
}

// ---------- montagem da página (blocos que a pessoa pode esconder e reordenar) ----------
function montarPagina(chave, blocos) {
  if (MODELO2 && !escolhas.blocos[chave] && PADRAO_M2[chave]) {
    const visiveis = PADRAO_M2[chave];
    escolhas.blocos[chave] = { ordem: [...visiveis, ...blocos.map((b) => b.id).filter((x) => !visiveis.includes(x))], ocultos: blocos.map((b) => b.id).filter((x) => !visiveis.includes(x)) };
  }
  const guardado = escolhas.blocos[chave] || {};
  const ordem = () => { const ids = blocos.map((b) => b.id); const o = (guardado.ordem || []).filter((x) => ids.includes(x)); return [...o, ...ids.filter((x) => !o.includes(x))]; };
  const grade = h('div', { class: 'ini-grade' }); const painel = h('div', { class: 'ini-personalizar', hidden: true });
  const salvar = () => { escolhas.blocos[chave] = guardado; guardar(); };
  const desenharGrade = () => {
    limpar(grade); const ocultos = new Set(guardado.ocultos || []);
    for (const id of ordem()) {
      const b = blocos.find((x) => x.id === id); if (!b || ocultos.has(id)) continue;
      const el = b.render(); if (el) grade.appendChild(h('div', { class: `ini-col-${b.col}`, 'data-bloco': id }, el));
    }
  };
  const desenharPainel = () => {
    limpar(painel); const ocultos = new Set(guardado.ocultos || []); const o = ordem();
    painel.appendChild(h('div', { class: 'ini-pers-cab' }, h('div', null, h('b', null, 'Personalizar esta página'), h('small', null, 'Marque o que quer ver e use as setas para mudar a ordem. Fica salvo neste aparelho.')),
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { guardado.ocultos = []; guardado.ordem = []; salvar(); desenharGrade(); desenharPainel(); } }, 'Restaurar padrão')));
    painel.appendChild(h('ul', { class: 'ini-pers-lista' }, o.map((id, i) => { const b = blocos.find((x) => x.id === id);
      const mover = (d) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; guardado.ordem = n; salvar(); desenharGrade(); desenharPainel(); };
      return h('li', null, h('label', null, h('input', { type: 'checkbox', checked: !ocultos.has(id), onchange: (e) => { const s = new Set(guardado.ocultos || []); if (e.target.checked) s.delete(id); else s.add(id); guardado.ocultos = [...s]; salvar(); desenharGrade(); } }), ` ${b.nome}`),
        h('span', { class: 'ini-pers-mover' }, h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Subir ${b.nome}`, disabled: i === 0, onclick: () => mover(-1) }, '↑'), h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Descer ${b.nome}`, disabled: i === o.length - 1, onclick: () => mover(1) }, '↓'))); })));
  };
  const botao = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'aria-expanded': 'false', onclick: () => { painel.hidden = !painel.hidden; botao.setAttribute('aria-expanded', String(!painel.hidden)); if (!painel.hidden) desenharPainel(); } }, icone('engrenagem', { tam: 16, traco: 2 }), ' Personalizar');
  desenharGrade();
  return [h('div', { class: 'ini-barra-topo' }, botao), painel, grade];
}

// Campanhas que cabem no Início, já com o placar
async function carregarCampanhas(agora, { equipe }) {
  try {
    const lista = K.campanhasDoInicio(await api.listarCampanhas(), agora, { equipe });
    return await Promise.all(lista.map(async ({ c, s }) => ({ c, s, placar: await api.rankingCampanha(c.id).catch(() => []) })));
  } catch { return []; }
}

// ---------- página do painel da equipe ----------
export async function inicioEquipe({ perfil, config, docsConferir = [] }) {
  const agora = new Date();
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const verCorretores = R.pode(perfil, 'ver_imobiliarias_corretores');
  const [clientes, historico, engenharias, entrevistas, verificacoes, emissoes, recusas, corretores, campanhasDoMes, metasMensais] = await Promise.all([
    seguro(api.listarClientes()), seguro(api.historicoStatus()), R.pode(perfil, 'mudar_status') ? seguro(api.listarEngenharias()) : [],
    R.pode(perfil, 'mudar_status') ? seguro(api.listarEntrevistas()) : [], R.pode(perfil, 'conferir_documentos') ? seguro(api.listarVerificacoes()) : [], seguro(api.listarEmissoes()),
    seguro(api.listarMotivosRecusa()), verCorretores ? seguro(api.listarCorretores()) : [], carregarCampanhas(agora, { equipe: true }), seguro(api.listarMetasMensais())]);
  const { fazer, prazos } = D.pendenciasEquipe({ clientes, engenharias, entrevistas, docsConferir, verificacoes, emissoes, tipos: config?.tipos || [], limiteParado, agora });
  const atividade = D.atividadeRecente(clientes, historico, { agora });
  const grupos = [['imobiliaria', 'Imobiliárias'], ['corretor', 'Corretores']];
  const par = config?.parametros || {};
  const mesAtual = K.mesIso(agora);
  const metasAtuais = () => K.metasDoMesDefinidas(mesAtual, metasMensais, par);
  const atalhos = [
    { nome: 'Clientes', href: '#/painel/clientes', icone: 'pessoas' },
    ...(R.tiposDeConvite(perfil).length ? [{ nome: 'Convidar', href: '#/painel/convites', icone: 'mais' }] : []),
    ...(R.pode(perfil, 'conferir_documentos') ? [{ nome: 'Docs a conferir', href: '#/painel/docs', icone: 'docCheck', num: docsConferir.length }] : []),
    ...(R.pode(perfil, 'mudar_status') ? [{ nome: 'Engenharia', href: '#/painel/engenharia', icone: 'casa' }, { nome: 'Agenda', href: '#/painel/agenda', icone: 'calendario' }] : []),
    ...(R.pode(perfil, 'ver_relatorios') ? [{ nome: 'Relatórios', href: '#/painel/relatorios', icone: 'grafico' }] : []),
  ];
  const wp = (c) => `Parabéns, ${R.primeiroNome(c.nome)}! A equipe da Andrade Almeida CCA deseja um dia muito especial para você. 🎉`;
  const inativos = D.corretoresInativos(corretores, clientes, { agora });
  const blocos = [
    { id: 'atalhos', nome: 'Atalhos', col: 12, render: () => blocoAtalhos(atalhos) },
    { id: 'campanhas', nome: 'Campanhas', col: 12, render: () => blocoCampanhas(campanhasDoMes, { equipe: true }) },
    { id: 'fazer', nome: MODELO2 ? 'Sua vez' : 'Precisa de você', col: 7, render: () => blocoFazer(MODELO2 ? [...fazer, ...itensDamp(clientes, { equipe: true, rotaCliente: (c) => `#/painel/clientes/${c.id}`, rotaLista: '#/painel/clientes' }), ...F.suaVez(clientes, 'cca', { rotaCliente: (c) => `#/painel/clientes/${c.id}`, rotaLista: '#/painel/clientes' })] : fazer, MODELO2 ? { titulo: 'Sua vez', vazioTexto: 'Nada esperando pela CCA agora.' } : {}) },
    { id: 'prazos', nome: 'Prazos e validades', col: 5, render: () => blocoPrazos(prazos) },
    { id: 'indicadores', nome: 'Como estamos', col: 12, render: () => blocoIndicadores(clientes, historico) },
    { id: 'metas', nome: 'Metas do mês', col: 5, render: () => blocoMetas({ titulo: 'Metas do mês', sub: `Meta da CCA para ${K.nomeMes(mesAtual)}. A marca vertical mostra onde deveríamos estar hoje.`,
      rodape: h('a', { class: 'ini-mais-link', href: '#/painel/campanhas', onclick: () => irParaCampanhas({ aba: 'metas' }) }, 'Metas de outros meses'), metas: () => D.metasDoMes(metasAtuais(), clientes, historico, agora),
      podeEditar: perfil.papel === 'admin', textoVazio: perfil.papel === 'admin' ? 'Ainda não há metas. Defina quantos processos, minutas e contratos a CCA quer no mês.' : 'O administrador ainda não definiu as metas do mês.',
      salvar: async (v) => { for (const cod of Object.keys(D.META_CHAVES)) { await api.salvarMetaMensal(mesAtual, cod, v[cod]); const i = metasMensais.findIndex((x) => String(x.mes).slice(0, 7) === mesAtual && x.metrica === cod); const novo = { mes: `${mesAtual}-01`, metrica: cod, valor: v[cod] }; if (i >= 0) metasMensais[i] = novo; else metasMensais.push(novo); } } }) },
    { id: 'semana', nome: 'Resumo da semana', col: 7, render: () => blocoResumoSemana(clientes, historico, { agora, limiteParado, nome: 'CCA' }) },
    { id: 'comparativo', nome: 'Comparativo dos últimos meses', col: 7, render: () => blocoComparativo(clientes, historico) },
    { id: 'funil', nome: 'Clientes em cada etapa', col: 5, render: () => blocoFunil(clientes) },
    { id: 'ranking', nome: 'Principais clientes', col: 7, render: () => blocoRanking(clientes, historico, { titulo: 'Principais clientes', grupos }) },
    { id: 'engenharias', nome: 'Engenharias', col: 5, render: () => blocoEngenharias(engenharias, { href: '#/painel/engenharia' }) },
    { id: 'tempo', nome: 'Tempo em cada etapa', col: 7, render: () => blocoTempoEtapas(clientes, historico) },
    { id: 'programa', nome: 'Clientes por programa', col: 5, render: () => blocoPrograma(clientes) },
    { id: 'recusas', nome: 'Motivos de recusa', col: 5, render: () => blocoRecusas(recusas, agora) },
    ...(verCorretores ? [{ id: 'inativos', nome: 'Corretores sem cadastro novo', col: 7, render: () => blocoInativos(inativos) }] : []),
    { id: 'aniversariantes', nome: 'Aniversariantes do mês', col: 6, render: () => blocoAniversariantes(clientes, { agora, saudacaoDe: wp }) },
    { id: 'contratos', nome: 'Aniversário de contrato', col: 6, render: () => blocoContratos(clientes, historico, { agora, mensagemDe: (c, anos) => `Olá, ${R.primeiroNome(c.nome)}! Faz ${anos} ${anos === 1 ? 'ano' : 'anos'} que você assinou o contrato do seu financiamento com a gente. Está tudo bem com o imóvel? Conte com a Andrade Almeida CCA!` }) },
    { id: 'movimento', nome: 'Movimento recente', col: 7, render: () => caixa('Movimento recente', 'Últimas mudanças de etapa', null,
      atividade.length ? h('ul', { class: 'ini-lista' }, atividade.map((a) => h('li', null, h('a', { class: 'ini-linha', href: `#/painel/clientes/${a.cliente.id}` },
        h('span', { class: 'ini-linha-txt' }, h('b', null, a.cliente.nome), h('small', null, `${a.cliente.corretor_nome || ''}${a.cliente.imobiliaria_nome ? ` · ${a.cliente.imobiliaria_nome}` : ''}`)),
        h('span', { class: 'ini-chip tom-info' }, a.paraNome), h('small', { class: 'ini-linha-data' }, D.quandoCurto(a.dias)))))) : vazio('Sem movimento ainda.', 'historico')) },
    { id: 'dica', nome: 'Dica do dia', col: 5, render: () => dicaCartao(D.dicaDoDia(D.DICAS_EQUIPE, agora)) },
  ];
  return [
    cabecalho({ sobre: dataExtensa(agora), titulo: `${D.saudacao(agora)}, ${R.primeiroNome(perfil.nome)}`, sub: resumoHero(fazer, prazos), foto: 'inicio-adm' }),
    ...montarPagina('equipe', blocos),
  ];
}

// ---------- página do corretor / gestor da imobiliária ----------
export async function inicioCorretor({ perfil, config }) {
  const agora = new Date();
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const gestor = perfil.papel === 'gestor_imobiliaria';
  const [clientes, historico, engenharias, entrevistas, emissoes, posicao, campanhasDoMes] = await Promise.all([seguro(api.listarClientes()), seguro(api.historicoStatus()), seguro(api.listarEngenharias()), seguro(api.listarEntrevistas()), seguro(api.listarEmissoes()),
    !gestor && !R.ehConsumidor(perfil) ? seguro(api.minhaPosicao(), null) : null, R.ehConsumidor(perfil) ? [] : carregarCampanhas(agora, { equipe: false })]);
  const { fazer, prazos } = D.pendenciasCorretor({ clientes, engenharias, entrevistas, emissoes, tipos: config?.tipos || [], limiteParado, agora });
  if (gestor) escolhas.rankGrupo = 'corretor';
  const nome = R.primeiroNome(perfil.nome);
  const blocos = [
    { id: 'atalhos', nome: 'Atalhos', col: 12, render: () => blocoAtalhos([{ nome: 'Novo cliente', href: '#/novo', icone: 'mais' }, { nome: gestor ? 'Clientes' : 'Meus clientes', href: '#/clientes', icone: 'pessoas' }, { nome: 'Engenharia', href: '#/engenharia', icone: 'casa' }]) },
    { id: 'campanhas', nome: 'Campanhas', col: 12, render: () => blocoCampanhas(campanhasDoMes, { equipe: false }) },
    { id: 'fazer', nome: MODELO2 ? 'Sua vez' : 'O que depende de você', col: 7, render: () => blocoFazer(MODELO2 ? [...itensDamp(clientes, { equipe: false }), ...F.suaVez(clientes, gestor ? ['gestor', 'corretor'] : 'corretor'), ...fazer] : fazer, { titulo: MODELO2 ? 'Sua vez' : 'O que depende de você', vazioTexto: 'Nada esperando por você. Bom trabalho!' }) },
    { id: 'prazos', nome: 'Prazos e validades', col: 5, render: () => blocoPrazos(prazos) },
    ...(MODELO2 && perfil.imobiliaria_id ? [{ id: 'mural', nome: 'Avisos da equipe', col: 5, render: () => blocoMuralInicio() }] : []),
    { id: 'indicadores', nome: 'Como estão seus clientes', col: 12, render: () => blocoIndicadores(clientes, historico, { titulo: gestor ? 'Como está a imobiliária' : 'Como estão seus clientes' }) },
    { id: 'metas', nome: 'Sua meta do mês', col: 5, render: () => blocoMetas({ titulo: gestor ? 'Meta do mês da imobiliária' : 'Sua meta do mês', sub: 'Defina a sua meta. Fica salva neste aparelho.',
      metas: () => D.metasDoMes(escolhas.metaPessoal, clientes, historico, agora), podeEditar: true, textoVazio: 'Defina quantos processos, minutas e contratos você quer neste mês.',
      salvar: async (v) => { escolhas.metaPessoal = v; guardar(); } }) },
    ...(posicao ? [{ id: 'posicao', nome: 'Sua posição no mês', col: 7, render: () => blocoPosicao(posicao) }] : []),
    { id: 'semana', nome: 'Resumo da semana', col: 7, render: () => blocoResumoSemana(clientes, historico, { agora, limiteParado, nome }) },
    { id: 'comparativo', nome: 'Comparativo dos últimos meses', col: 7, render: () => blocoComparativo(clientes, historico, 'Comparativo dos últimos meses') },
    { id: 'funil', nome: 'Seus clientes em cada etapa', col: 5, render: () => blocoFunil(clientes, gestor ? 'Clientes em cada etapa' : 'Seus clientes em cada etapa') },
    ...(gestor ? [{ id: 'ranking', nome: 'Corretores da imobiliária', col: 7, render: () => blocoRanking(clientes, historico, { titulo: 'Corretores da imobiliária', grupos: [['corretor', 'Corretores']] }) }] : []),
    { id: 'programa', nome: 'Clientes por programa', col: 5, render: () => blocoPrograma(clientes) },
    { id: 'engenharias', nome: 'Engenharias', col: 7, render: () => blocoEngenharias(engenharias, { href: '#/engenharia' }) },
    { id: 'aniversariantes', nome: 'Aniversariantes do mês', col: 6, render: () => blocoAniversariantes(clientes, { agora, saudacaoDe: (c) => `Parabéns, ${R.primeiroNome(c.nome)}! Desejo um dia muito especial para você. 🎉` }) },
    { id: 'contratos', nome: 'Aniversário de contrato', col: 6, render: () => blocoContratos(clientes, historico, { agora, mensagemDe: (c, anos) => `Olá, ${R.primeiroNome(c.nome)}! Faz ${anos} ${anos === 1 ? 'ano' : 'anos'} que você assinou o contrato do seu financiamento. Está tudo bem com o imóvel? Conte comigo!` }) },
    { id: 'dica', nome: 'Dica do dia', col: 5, render: () => dicaCartao(D.dicaDoDia(D.DICAS_CORRETOR, agora)) },
  ];
  return [
    cabecalho({ sobre: dataExtensa(agora), titulo: `${D.saudacao(agora)}, ${R.primeiroNome(perfil.nome)}`, sub: resumoHero(fazer, prazos), foto: 'inicio-corretor' }),
    ...montarPagina(MODELO2 && gestor ? (perfil.funcao === 'gestor' ? 'gestor' : 'ceo') : 'corretor', blocos),
  ];
}

// Peças reaproveitadas pela página de Gestão da imobiliária
export { caixa, seletor, barrasHorizontais, vazio, numero, blocoIndicadores, blocoFunil, blocoComparativo, blocoRanking, escolhas };
