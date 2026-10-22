// Fluxograma do processo (Modelo 2): fases, etapas, o que acontece em cada uma e de quem é a vez. Regras puras.
import * as R from './regras.js';
import * as K from './contrato-dados.js';

export const FASES = [
  { codigo: 'cadastro', nome: 'Cadastro', etapas: ['cadastro_recebido', 'documentacao_pendente', 'cadastro_ok'] },
  { codigo: 'aprovacao', nome: 'Aprovação', etapas: ['em_analise', 'cliente_aprovado', 'entrevista'] },
  { codigo: 'conformidade', nome: 'Assinaturas e conformidade', etapas: ['assinaturas', 'conformidade'] },
  { codigo: 'contrato', nome: 'Contrato', etapas: ['minuta_em_maos', 'contrato_assinado'] },
  { codigo: 'registro', nome: 'Registro e crédito', etapas: ['registro_cartorio', 'conformidade_final', 'credito_liberado'] },
];

// O que acontece em cada etapa (informativo)
export const O_QUE_E = {
  cadastro_recebido: 'A CCA recebeu o cadastro e confere os documentos.',
  documentacao_pendente: 'Faltam documentos ou algum foi recusado.',
  cadastro_ok: 'Documentos conferidos. A CCA monta a análise.',
  em_analise: 'O processo está na Caixa para análise de crédito.',
  cliente_aprovado: 'Crédito aprovado no sistema da Caixa (1ª aprovação). A CCA agenda a entrevista.',
  entrevista: 'Entrevista com o gerente da Caixa: a 2ª aprovação (gerencial). Se for reprovada, o processo é encerrado e nova tentativa só depois de 180 dias.',
  assinaturas: 'A CCA monta o processo, prepara os formulários e envia para compradores e vendedores assinarem no gov.br.',
  conformidade: 'Com tudo assinado, a CCA monta o dossiê e envia ao setor de Conformidade da Caixa. Aprovado, a CCA anexa a minuta, a planilha e a carta de crédito do vendedor.',
  minuta_em_maos: 'Minuta com o corretor para colher as assinaturas.',
  contrato_assinado: 'Contrato assinado também pelo gerente da Caixa.',
  registro_cartorio: 'Contrato no cartório de registro de imóveis.',
  conformidade_final: 'A CCA lança a documentação no SIOPI.',
  credito_liberado: 'Crédito liberado na conta do vendedor.',
  entrevista_reprovada: 'Entrevista reprovada pelo gerente da Caixa. O processo foi encerrado e a Caixa só aceita nova tentativa depois de 180 dias.',
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
    case 'assinaturas': return { quem: 'cliente', acao: 'Compradores e vendedores assinarem os formulários no gov.br' };
    case 'conformidade': return { quem: 'caixa', acao: 'Conferir o dossiê (aprovado, a CCA anexa minuta, planilha e carta)' };
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

// Cada etapa tem duas mensagens para o cliente (aparecem ao tocar no ícone do fluxograma):
// ANTES (ainda vai acontecer ou está acontecendo): do que se trata a etapa.
// CONCLUIDA: o que foi feito, com a orientação e o encaminhamento para a próxima etapa.
export const ANTES_CLIENTE = {
  cadastro_recebido: 'Nesta etapa a CCA recebe o seu cadastro e confere cada documento antes de levar o pedido à Caixa.',
  documentacao_pendente: 'Se faltar algum documento, ou se algum precisar ser enviado de novo, o processo passa por aqui. Os seus documentos você mesmo pode enviar pelo app.',
  cadastro_ok: 'Com todos os documentos conferidos, a CCA monta a sua proposta de financiamento para a Caixa.',
  em_analise: 'A Caixa Econômica Federal analisa o seu crédito. Você recebe um aviso assim que houver resposta.',
  cliente_aprovado: 'É a primeira aprovação: o sistema da Caixa analisa e aprova o seu crédito imobiliário. Em seguida, a CCA agenda a sua entrevista com o gerente, que é a segunda aprovação.',
  entrevista: 'É a segunda aprovação, agora feita pelo gerente da Caixa (a primeira foi a do sistema). Ele conversa com você para confirmar os seus dados, a sua renda e o imóvel. A data, a hora e o endereço chegam para você por e-mail, WhatsApp e aqui no app.',
  assinaturas: 'A CCA monta o seu processo e prepara os formulários da Caixa. Eles são enviados para você e para o vendedor assinarem pelo gov.br. Assine assim que receber: o processo só segue com todas as assinaturas.',
  conformidade: 'Com tudo assinado, a CCA monta o dossiê do seu processo e envia ao setor de Conformidade da Caixa, que confere tudo antes do contrato.',
  minuta_em_maos: 'O contrato fica pronto para assinatura. O(a) seu(sua) corretor(a) combina com você como assinar (gov.br ou presencial).',
  contrato_assinado: 'Depois que você e o vendedor assinam, o gerente da Caixa também assina o contrato.',
  registro_cartorio: 'O contrato é registrado no cartório de registro de imóveis. Depois do registro, o imóvel passa para o seu nome.',
  conformidade_final: 'A CCA lança os documentos do registro na Caixa para a conferência final.',
  credito_liberado: 'A Caixa libera o crédito para o vendedor e o seu financiamento é concluído.',
};
export const CONCLUIDA_CLIENTE = {
  cadastro_recebido: 'A CCA recebeu o seu cadastro e conferiu os documentos enviados.',
  documentacao_pendente: 'Os documentos que faltavam foram enviados e conferidos pela CCA.',
  cadastro_ok: 'Documentos aprovados pela CCA. A sua proposta de financiamento foi montada e enviada à Caixa.',
  em_analise: 'A Caixa concluiu a análise de crédito da sua proposta.',
  cliente_aprovado: 'Parabéns! O seu crédito imobiliário foi aprovado pelo sistema da Caixa Econômica Federal. Esta é a primeira aprovação. Falta a segunda: a entrevista com o gerente.',
  entrevista: 'Parabéns! O gerente da Caixa aprovou a sua entrevista. Era a segunda e última aprovação: o seu financiamento está aprovado. Agora vêm as assinaturas dos formulários.',
  assinaturas: 'Todos os formulários foram assinados por você e pelo vendedor no gov.br. A CCA montou o dossiê do seu processo.',
  conformidade: 'A Conformidade da Caixa aprovou o dossiê. A CCA preparou o seu contrato (a minuta e a planilha de prestações) e a carta de crédito, que informa ao vendedor quanto vai receber da Caixa.',
  minuta_em_maos: 'O contrato foi assinado por você e pelo vendedor e voltou para a CCA.',
  contrato_assinado: 'O gerente da Caixa também assinou. O seu contrato está completo.',
  registro_cartorio: 'O contrato foi registrado no cartório. O imóvel já está no seu nome.',
  conformidade_final: 'A CCA lançou o registro na Caixa e a conferência final foi aprovada.',
  credito_liberado: 'A Caixa liberou o crédito para o vendedor. O seu financiamento foi concluído. Parabéns pelo seu imóvel!',
};
// Compatibilidade: texto de cada etapa (antes) usado em outras telas
export const EXPLICA_CLIENTE = { ...ANTES_CLIENTE, entrevista_reprovada: 'Infelizmente o gerente da Caixa não aprovou a entrevista e o processo foi encerrado. A entrevista fica registrada no sistema da Caixa, e uma nova tentativa só é possível depois de 180 dias. Fale com o(a) seu(sua) corretor(a) ou com a CCA para entender os próximos passos.' };

// Entrevista reprovada: a Caixa só aceita nova tentativa 180 dias depois
export const DIAS_NOVA_TENTATIVA = 180;
export function novaTentativaEm(reprovadaEm) {
  if (!reprovadaEm) return null;
  const d = new Date(reprovadaEm); d.setDate(d.getDate() + DIAS_NOVA_TENTATIVA);
  return d;
}
export function textoReprovada({ doCliente = false, em = null } = {}) {
  const nova = novaTentativaEm(em);
  const base = doCliente ? EXPLICA_CLIENTE.entrevista_reprovada : O_QUE_E.entrevista_reprovada;
  if (!nova) return base;
  return base.replace('depois de 180 dias', `depois de 180 dias (a partir de ${nova.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })})`);
}

// Próxima etapa depois de uma etapa (para o "encaminhamento" da mensagem de concluída)
export function proximaEtapa(codigo) {
  const ordem = R.STATUS.map((s) => s.codigo);
  const i = ordem.indexOf(codigo);
  return i >= 0 && i < ordem.length - 1 ? R.STATUS[i + 1] : null;
}

// Dados da entrevista agendada (vêm do cadastro do cliente)
export function dadosEntrevista(cliente) {
  if (!cliente?.entrevista_em) return null;
  const d = new Date(cliente.entrevista_em);
  const tz = { timeZone: 'America/Sao_Paulo' };
  return {
    data: d.toLocaleDateString('pt-BR', { ...tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    hora: d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' }),
    modalidade: cliente.entrevista_modalidade === 'video' ? 'Por videoconferência' : 'Presencial, na agência',
    agencia: cliente.entrevista_agencia || null,
    gerente: cliente.entrevista_gerente || null,
    endereco: cliente.entrevista_endereco || cliente.entrevista_local || null,
    passou: d.getTime() < Date.now(),
  };
}
