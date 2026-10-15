// Fluxograma do processo (Modelo 2): fases, etapas, o que acontece em cada uma e de quem é a vez. Regras puras.
import * as R from './regras.js';
import * as K from './contrato-dados.js';

export const FASES = [
  { codigo: 'cadastro', nome: 'Cadastro', etapas: ['cadastro_recebido', 'documentacao_pendente', 'cadastro_ok'] },
  { codigo: 'aprovacao', nome: 'Aprovação', etapas: ['em_analise', 'cliente_aprovado', 'entrevista'] },
  { codigo: 'contrato', nome: 'Contrato', etapas: ['conformidade', 'minuta_em_maos', 'contrato_assinado'] },
  { codigo: 'registro', nome: 'Registro e crédito', etapas: ['registro_cartorio', 'conformidade_final', 'credito_liberado'] },
];

// O que acontece em cada etapa (informativo)
export const O_QUE_E = {
  cadastro_recebido: 'A CCA recebeu o cadastro e confere os documentos.',
  documentacao_pendente: 'Faltam documentos ou algum foi recusado.',
  cadastro_ok: 'Documentos conferidos. A CCA monta a análise.',
  em_analise: 'O processo está na Caixa para análise de crédito.',
  cliente_aprovado: 'Crédito aprovado. A CCA agenda a entrevista.',
  entrevista: 'Entrevista com o gerente da Caixa na agência.',
  conformidade: 'A CCA prepara a minuta, a planilha e a carta de crédito.',
  minuta_em_maos: 'Minuta com o corretor para colher as assinaturas.',
  contrato_assinado: 'Contrato assinado também pelo gerente da Caixa.',
  registro_cartorio: 'Contrato no cartório de registro de imóveis.',
  conformidade_final: 'A CCA lança a documentação no SIOPI.',
  credito_liberado: 'Crédito liberado na conta do vendedor.',
  entrevista_reprovada: 'Entrevista reprovada. O processo foi encerrado.',
};

export const NOME_QUEM = { cca: 'CCA', corretor: 'Corretor', gestor: 'Gestor', cliente: 'Cliente', caixa: 'Caixa' };

// De quem é a vez numa etapa. `arquivos` = tipos de arquivo do contrato já anexados (só importa na etapa Contrato).
export function vezDaEtapa(status, arquivos = []) {
  switch (status) {
    case 'cadastro_recebido': return { quem: 'cca', acao: 'Conferir os documentos' };
    case 'documentacao_pendente': return { quem: 'corretor', acao: 'Enviar os documentos que faltam' };
    case 'cadastro_ok': return { quem: 'cca', acao: 'Montar a análise no SIOPI' };
    case 'em_analise': return { quem: 'caixa', acao: 'Analisar o crédito' };
    case 'cliente_aprovado': return { quem: 'cca', acao: 'Agendar a entrevista' };
    case 'entrevista': return { quem: 'cliente', acao: 'Ir à entrevista na agência' };
    case 'conformidade': return { quem: 'cca', acao: 'Anexar minuta, planilha e carta' };
    case 'minuta_em_maos': {
      const p = K.passoContrato(status, arquivos);
      if (p?.vez === 'cca') return { quem: 'cca', acao: p.codigo === 'preparo' ? 'Anexar minuta, planilha e carta' : 'Enviar ao gerente e anexar o contrato' };
      return { quem: 'corretor', acao: 'Colher as assinaturas e anexar a minuta assinada' };
    }
    case 'contrato_assinado':
    case 'registro_cartorio': return { quem: 'corretor', acao: 'Registrar no cartório e anexar os comprovantes' };
    case 'conformidade_final': return { quem: 'cca', acao: 'Lançar no SIOPI e liberar o crédito' };
    default: return { quem: null, acao: '' };
  }
}

// Situação de cada etapa para o desenho: feita, atual, futura (ou reprovada)
export function etapasDoFluxo(status, historico = [], enviadoEm = null) {
  const ordem = R.STATUS.map((s) => s.codigo);
  const reprovado = status === 'entrevista_reprovada';
  const i = reprovado ? ordem.indexOf('entrevista') : ordem.indexOf(status);
  const dataDe = (cod) => historico.filter((x) => x.para === cod).map((x) => x.em).sort().pop() || (cod === 'cadastro_recebido' ? enviadoEm : null);
  const final = status === 'credito_liberado';
  return FASES.map((f) => ({ ...f, itens: f.etapas.map((cod) => {
    const k = ordem.indexOf(cod);
    const estado = reprovado && k === i ? 'reprovada' : k < i || (final && k === i) ? 'feita' : k === i ? 'atual' : 'futura';
    return { codigo: cod, nome: R.STATUS.find((s) => s.codigo === cod)?.nome || cod, estado, em: estado === 'futura' ? null : dataDe(reprovado && k === i ? 'entrevista_reprovada' : cod) };
  }) }));
}

// Quantas etapas já foram cumpridas (de 12)
export function progresso(status) {
  const ordem = R.STATUS.map((s) => s.codigo);
  if (status === 'credito_liberado') return { feitas: ordem.length, total: ordem.length };
  const i = ordem.indexOf(status === 'entrevista_reprovada' ? 'entrevista' : status);
  return { feitas: Math.max(0, i), total: ordem.length };
}

// "Sua vez": clientes esperando por quem pergunta, agrupados por etapa. quem = 'cca' | 'corretor'.
// O corretor também vê a entrevista (lembrar o cliente). Rascunhos e encerrados ficam fora.
export function suaVez(clientes, quem, { rotaCliente = (c) => `#/cliente/${c.id}`, rotaLista = '#/clientes' } = {}) {
  const grupos = new Map();
  for (const c of clientes) {
    if (c.rascunho || R.STATUS_FINAIS.includes(c.status)) continue;
    const v = c.vez || vezDaEtapa(c.status);
    const lista = [].concat(quem);
    const minha = lista.includes(v.quem) || ((lista.includes('corretor') || lista.includes('gestor')) && v.quem === 'cliente');
    if (!minha) continue;
    const chave = `${c.status}|${v.acao}`;
    const g = grupos.get(chave) || { status: c.status, acao: v.acao, quem: v.quem, clientes: [] };
    g.clientes.push(c); grupos.set(chave, g);
  }
  const ordem = R.STATUS.map((s) => s.codigo);
  return [...grupos.values()].sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status)).map((g) => ({
    tipo: 'vez', tom: g.quem === 'cliente' ? 'info' : 'atencao', icone: 'seta', valor: g.clientes.length,
    titulo: `${R.nomeStatus(g.status)}: ${g.acao.charAt(0).toLowerCase()}${g.acao.slice(1)}`,
    detalhe: g.clientes.slice(0, 3).map((c) => c.nome).join(', ') + (g.clientes.length > 3 ? ` e mais ${g.clientes.length - 3}` : ''),
    href: g.clientes.length === 1 ? rotaCliente(g.clientes[0]) : rotaLista, status: g.status, clientes: g.clientes,
  }));
}
