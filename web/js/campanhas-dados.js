// Campanhas (concursos com prêmio) e metas por mês. Sem tela: dá para testar no Node.
// O placar espelha a função campanha_ranking do banco.
import { eventos } from './inicio-dados.js';
import { hojeIso } from './regras.js';

// [código, nome, explicação]
export const METRICAS_CAMPANHA = [
  ['assinados', 'Contratos assinados', 'Minuta assinada: é quando a CCA recebe da Caixa'],
  ['minutas', 'Minutas em mãos', 'Cliente chegou em Minuta em mãos'],
  ['aprovados', 'Clientes aprovados', 'Cliente chegou em Cliente Aprovado'],
  ['abertos', 'Processos abertos', 'Cadastros enviados para a CCA'],
];
export const CATEGORIAS = [['imobiliaria', 'Imobiliária'], ['corretor', 'Corretor']];
export const nomeMetrica = (m) => METRICAS_CAMPANHA.find(([k]) => k === m)?.[1] || m;
export const nomeCategoria = (c) => CATEGORIAS.find(([k]) => k === c)?.[1] || c;

const DIA = 864e5;
const brasilia = (iso, fimDoDia = false) => new Date(`${iso}T00:00:00-03:00`).getTime() + (fimDoDia ? DIA : 0);
export const dataCurta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
export const dataLonga = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const periodoTexto = (c) => `${dataLonga(c.inicio)} a ${dataLonga(c.fim)}`;
const diasEntreIso = (a, b) => Math.round((brasilia(b) - brasilia(a)) / DIA);

// agendada | andamento | encerrada, com a contagem de dias
export function situacaoCampanha(c, agora = new Date()) {
  const hoje = hojeIso(agora);
  if (hoje < c.inicio) return { estado: 'agendada', rotulo: 'Começa em breve', dias: diasEntreIso(hoje, c.inicio), detalhe: `Começa em ${diasEntreIso(hoje, c.inicio)} ${diasEntreIso(hoje, c.inicio) === 1 ? 'dia' : 'dias'}` };
  if (hoje > c.fim) return { estado: 'encerrada', rotulo: 'Encerrada', dias: 0, detalhe: `Terminou em ${dataLonga(c.fim)}` };
  const resta = diasEntreIso(hoje, c.fim);
  return { estado: 'andamento', rotulo: 'Em andamento', dias: resta, detalhe: resta === 0 ? 'Último dia!' : resta === 1 ? 'Falta 1 dia' : `Faltam ${resta} dias` };
}

// Placar: { categoria, ref_id, nome, subnome, valor, posicao, meu }
// Desempate: quem chegou primeiro ao total (último evento mais antigo). Sem pontos = sem posição.
export function placarCampanha(campanha, { clientes, historico, corretores, imobiliarias, euId = null, minhaImobiliariaId = null }) {
  const ini = brasilia(campanha.inicio); const fim = brasilia(campanha.fim, true);
  const ev = eventos(campanha.metrica, clientes, historico).filter((e) => { const t = new Date(e.em).getTime(); return t >= ini && t < fim; });
  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  const acumula = (chaveDe) => { const m = new Map(); for (const e of ev) { const k = chaveDe(porCliente.get(e.cliente_id)); if (!k) continue; const x = m.get(k) || { n: 0, ultimo: 0 }; x.n++; x.ultimo = Math.max(x.ultimo, new Date(e.em).getTime()); m.set(k, x); } return m; };
  const porCorretor = acumula((c) => c?.corretor_id); const porImob = acumula((c) => c?.imobiliaria_id);
  const imobPorId = new Map(imobiliarias.map((i) => [i.id, i.nome]));
  const linhas = [
    ...corretores.map((p) => ({ categoria: 'corretor', ref_id: p.id, nome: p.nome, subnome: imobPorId.get(p.imobiliaria_id) || 'Autônomo', valor: porCorretor.get(p.id)?.n || 0, ultimo: porCorretor.get(p.id)?.ultimo || 0, meu: p.id === euId })),
    ...imobiliarias.map((i) => ({ categoria: 'imobiliaria', ref_id: i.id, nome: i.nome, subnome: null, valor: porImob.get(i.id)?.n || 0, ultimo: porImob.get(i.id)?.ultimo || 0, meu: !!minhaImobiliariaId && i.id === minhaImobiliariaId })),
  ];
  const saida = [];
  for (const [cat] of CATEGORIAS) {
    linhas.filter((l) => l.categoria === cat).sort((a, b) => b.valor - a.valor || a.ultimo - b.ultimo || a.nome.localeCompare(b.nome))
      .forEach((l, i) => saida.push({ categoria: l.categoria, ref_id: l.ref_id, nome: l.nome, subnome: l.subnome, valor: l.valor, posicao: l.valor > 0 ? i + 1 : null, meu: l.meu }));
  }
  return saida;
}

// O que cada pessoa pode ver: a equipe vê tudo; os demais veem o placar completo só se a campanha mostrar nomes
export function placarVisivel(linhas, campanha, { equipe }) {
  return equipe || campanha.mostrar_nomes ? linhas : linhas.filter((l) => l.meu);
}
export const doGrupo = (linhas, categoria) => linhas.filter((l) => l.categoria === categoria);
export const premiosAtivos = (c) => (c.premios || []).filter((p) => !p.removido).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.posicao - b.posicao);
export const premiosDe = (c, categoria) => premiosAtivos(c).filter((p) => p.categoria === categoria);
export const rotuloPosicao = (n) => `${n}º lugar`;

// Campanhas que a pessoa deve ver no Início: em andamento (e as encerradas recentes sem entrega), sem arquivadas
export function campanhasDoInicio(campanhas, agora = new Date(), { equipe = false } = {}) {
  return campanhas.filter((c) => !c.arquivada && (equipe || c.ativa)).map((c) => ({ c, s: situacaoCampanha(c, agora) }))
    .filter(({ c, s }) => s.estado === 'andamento' || (s.estado === 'agendada' && diasEntreIso(hojeIso(agora), c.inicio) <= 7)
      || (s.estado === 'encerrada' && (equipe ? premiosAtivos(c).some((p) => !p.entregue_em) : diasEntreIso(c.fim, hojeIso(agora)) <= 15)))
    .sort((a, b) => ({ andamento: 0, agendada: 1, encerrada: 2 })[a.s.estado] - ({ andamento: 0, agendada: 1, encerrada: 2 })[b.s.estado] || a.c.fim.localeCompare(b.c.fim));
}

// ---------- Metas por mês ----------
export const mesIso = (agora = new Date()) => hojeIso(agora).slice(0, 7); // "2026-10"
export const somarMes = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
const PARAM = { abertos: 'meta_abertos', minutas: 'meta_minutas', assinados: 'meta_contratos' };
// Meta de um mês: valor definido para o mês; se não houver, o padrão geral (parâmetros)
export function metasDoMesDefinidas(mes, metasMensais, parametros = {}) {
  const saida = {}; let proprias = 0;
  for (const cod of Object.keys(PARAM)) {
    const m = (metasMensais || []).find((x) => String(x.mes).slice(0, 7) === mes && x.metrica === cod);
    if (m) { saida[cod] = Number(m.valor); proprias++; } else saida[cod] = Number(parametros?.[PARAM[cod]]) || 0;
  }
  return { ...saida, proprias };
}
