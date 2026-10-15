// Gestão da imobiliária: números do painel do gestor (regras puras, sem tela).
import * as R from './regras.js';

// Fases do processo, do ponto de vista de quem gerencia
export const FASES = [
  { codigo: 'andamento', nome: 'Em andamento', dica: 'Do cadastro recebido até a entrevista', status: ['cadastro_recebido', 'documentacao_pendente', 'cadastro_ok', 'em_analise', 'cliente_aprovado', 'entrevista'] },
  { codigo: 'finalizacao', nome: 'Em finalização', dica: 'Da conformidade ao registro do contrato', status: ['conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio', 'conformidade_final'] },
  { codigo: 'finalizado', nome: 'Finalizados', dica: 'Crédito liberado ao vendedor', status: ['credito_liberado'] },
  { codigo: 'encerrado', nome: 'Encerrados', dica: 'Entrevista reprovada', status: ['entrevista_reprovada'] },
];
export const faseDe = (status) => FASES.find((f) => f.status.includes(status))?.codigo || null;

const enviados = (clientes) => clientes.filter((c) => !c.rascunho);
const ativos = (c) => !c.rascunho && !R.STATUS_FINAIS.includes(c.status);
const comPendencia = (c) => ativos(c) && ((c.docs_pendentes || 0) > 0 || (c.docs_recusados || 0) > 0);

// Números gerais da imobiliária (ou de um corretor, quando corretorId é informado)
export function resumoGestao(clientes, { limiteParado = 5, agora = new Date(), corretorId = null } = {}) {
  const lista = enviados(corretorId ? clientes.filter((c) => c.corretor_id === corretorId) : clientes);
  const conta = (f) => lista.filter((c) => faseDe(c.status) === f).length;
  return {
    andamento: conta('andamento'), finalizacao: conta('finalizacao'), finalizados: conta('finalizado'), encerrados: conta('encerrado'),
    total: lista.length,
    parados: lista.filter((c) => R.diasParado(c, limiteParado, agora) > 0).length,
    pendencias: lista.filter(comPendencia).length,
    naoLidas: lista.reduce((s, c) => s + (c.conversa_nao_lidas || 0), 0),
  };
}

// Uma linha por corretor (inclui quem ainda não tem cliente e o que ficou sem corretor ativo)
export function porCorretor(clientes, corretores, { limiteParado = 5, agora = new Date() } = {}) {
  const linhas = new Map();
  const nova = (id, nome, extra = {}) => ({ id, nome, andamento: 0, finalizacao: 0, finalizados: 0, parados: 0, pendencias: 0, naoLidas: 0, total: 0, ultima: null, ...extra });
  for (const u of corretores) linhas.set(u.id, nova(u.id, u.nome, { gestor: u.papel === 'gestor_imobiliaria', funcao: u.funcao || null }));
  for (const c of enviados(clientes)) {
    const id = c.corretor_id || 'sem';
    if (!linhas.has(id)) linhas.set(id, nova(id, c.corretor_nome || 'Sem corretor ativo', { antigo: true }));
    const l = linhas.get(id);
    const f = faseDe(c.status);
    if (f === 'andamento') l.andamento++; else if (f === 'finalizacao') l.finalizacao++; else if (f === 'finalizado') l.finalizados++;
    l.total++;
    if (R.diasParado(c, limiteParado, agora) > 0) l.parados++;
    if (comPendencia(c)) l.pendencias++;
    l.naoLidas += c.conversa_nao_lidas || 0;
    const t = c.atualizado_em || c.enviado_em || null;
    if (t && (!l.ultima || String(t) > String(l.ultima))) l.ultima = t;
  }
  return [...linhas.values()].sort((a, b) => (b.andamento + b.finalizacao) - (a.andamento + a.finalizacao) || b.finalizados - a.finalizados || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Processos que precisam de atenção: parados há mais dias que o limite (mais antigos primeiro)
export function processosParados(clientes, { limiteParado = 5, agora = new Date(), corretorId = null, limite = 12 } = {}) {
  return enviados(corretorId ? clientes.filter((c) => c.corretor_id === corretorId) : clientes)
    .map((c) => ({ c, dias: R.diasParado(c, limiteParado, agora) })).filter((x) => x.dias > 0)
    .sort((a, b) => b.dias - a.dias || a.c.nome.localeCompare(b.c.nome, 'pt-BR')).slice(0, limite)
    .map(({ c, dias }) => ({ id: c.id, nome: c.nome, corretor: c.corretor_nome || '—', status: c.status, dias }));
}

// Clientes com conversa, mais recente primeiro (a imobiliária só lê)
export function conversasDaImobiliaria(clientes, { corretorId = null, limite = 15 } = {}) {
  return clientes.filter((c) => c.conversa_ultima && (!corretorId || c.corretor_id === corretorId))
    .sort((a, b) => String(b.conversa_ultima).localeCompare(String(a.conversa_ultima))).slice(0, limite)
    .map((c) => ({ id: c.id, nome: c.nome, corretor: c.corretor_nome || '—', ultima: c.conversa_ultima, naoLidas: c.conversa_nao_lidas || 0, status: c.status }));
}
