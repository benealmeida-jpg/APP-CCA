// Números da tela "Campanhas e desempenho" (corretor, gestor e CEO da imobiliária). Sem tela: dá para testar no Node.
import * as R from './regras.js';
import { eventos, MESES_CURTOS } from './inicio-dados.js';

const DIA = 864e5;
const LIMITE_LINHAS = 6;

// Fases do processo para o gráfico de pizza (as 12 etapas agrupadas em 5 fatias legíveis)
export const FASES = [
  { id: 'cadastro', nome: 'Cadastro e documentos', status: ['cadastro_recebido', 'documentacao_pendente', 'cadastro_ok'] },
  { id: 'analise', nome: 'Análise na Caixa', status: ['em_analise'] },
  { id: 'aprovado', nome: 'Aprovado, até a Conformidade', status: ['cliente_aprovado', 'entrevista', 'assinaturas', 'conformidade'] },
  { id: 'contrato', nome: 'Contrato e assinatura', status: ['minuta_em_maos'] },
  { id: 'concluido', nome: 'Assinado até o crédito', status: ['contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado'] },
];

export function porFase(clientes) {
  const enviados = clientes.filter((c) => !c.rascunho && !(R.STATUS_REPROVADO || []).some((s) => s.codigo === c.status));
  const itens = FASES.map((f) => ({ id: f.id, nome: f.nome, valor: enviados.filter((c) => f.status.includes(c.status)).length }));
  return { total: itens.reduce((s, x) => s + x.valor, 0), itens };
}

const diasNoMes = (ano, mes) => new Date(ano, mes + 1, 0).getDate();

// Soma acumulada, dia a dia, de uma lista de datas dentro do mês [ano, mes]; até `ate` (dia) quando informado
function acumulado(datas, ano, mes, ate) {
  const n = diasNoMes(ano, mes);
  const porDia = new Array(n).fill(0);
  for (const em of datas) {
    const d = new Date(em);
    if (d.getFullYear() === ano && d.getMonth() === mes) porDia[d.getDate() - 1] += 1;
  }
  const saida = []; let soma = 0;
  for (let i = 0; i < n; i++) { soma += porDia[i]; saida.push(i < (ate ?? n) ? soma : null); }
  return saida;
}

// Linha de evolução dentro do mês.
// grupo 'corretor': uma linha por corretor (os 6 que mais pontuaram; os demais somados em "Demais").
// grupo 'eu': uma linha só (você), com o mês anterior para comparar.
export function evolucaoDoMes(metrica, clientes, historico, { grupo = 'eu', agora = new Date(), nomes = {} } = {}) {
  const ano = agora.getFullYear(); const mes = agora.getMonth();
  const hoje = agora.getDate();
  const ev = eventos(metrica, clientes, historico);
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const dias = diasNoMes(ano, mes);
  const rotuloMes = `${MESES_CURTOS[mes]}/${String(ano).slice(2)}`;
  if (grupo !== 'corretor') {
    const antes = new Date(ano, mes - 1, 1);
    const atual = acumulado(ev.map((e) => e.em), ano, mes, hoje);
    const anterior = acumulado(ev.map((e) => e.em), antes.getFullYear(), antes.getMonth()).slice(0, dias);
    while (anterior.length < dias) anterior.push(anterior[anterior.length - 1] ?? 0);
    return { dias, hoje, rotuloMes, series: [
      { id: 'atual', nome: 'Este mês', valores: atual, total: atual[hoje - 1] ?? 0, destaque: true },
      { id: 'anterior', nome: `Mês anterior (${MESES_CURTOS[antes.getMonth()]})`, valores: anterior, total: anterior[dias - 1] ?? 0, tracejada: true },
    ] };
  }
  const porCorretor = new Map();
  for (const e of ev) {
    const c = porId.get(e.cliente_id); if (!c) continue;
    const k = c.corretor_id || 'sem';
    if (!porCorretor.has(k)) porCorretor.set(k, { id: k, nome: nomes[k] || c.corretor_nome || 'Sem corretor', datas: [] });
    porCorretor.get(k).datas.push(e.em);
  }
  // corretores sem nenhum evento também aparecem na legenda (com zero), para o gestor ver quem não pontuou
  for (const [k, nome] of Object.entries(nomes)) if (!porCorretor.has(k)) porCorretor.set(k, { id: k, nome, datas: [] });
  const series = [...porCorretor.values()].map((s) => { const valores = acumulado(s.datas, ano, mes, hoje); return { id: s.id, nome: s.nome, valores, total: valores[hoje - 1] ?? 0 }; })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  const principais = series.slice(0, LIMITE_LINHAS);
  const resto = series.slice(LIMITE_LINHAS);
  if (resto.length) {
    const valores = principais[0]?.valores.map((_, i) => (i < hoje ? resto.reduce((s, x) => s + (x.valores[i] || 0), 0) : null)) || [];
    principais.push({ id: 'demais', nome: `Demais (${resto.length} ${resto.length === 1 ? 'corretor' : 'corretores'})`, valores, total: valores[hoje - 1] ?? 0, tracejada: true });
  }
  return { dias, hoje, rotuloMes, series: principais, semEventos: series.every((s) => !s.total) };
}

// Ritmo: quanto falta para a meta e quantos por semana até o fim do mês
export function ritmoDoMes(total, meta, agora = new Date()) {
  if (!meta) return null;
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
  const diasRestantes = Math.max(0, Math.round((fimMes.getTime() - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) / DIA) + 1);
  const falta = Math.max(0, meta - total);
  return { falta, diasRestantes, porSemana: diasRestantes ? Math.ceil((falta / diasRestantes) * 7) : falta, batida: total >= meta };
}
