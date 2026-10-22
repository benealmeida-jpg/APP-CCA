// Contrato: arquivos de cada passo, quem anexa, em que etapa o processo está e o que acontece ao anexar.
// Regras puras (sem tela): o demo usa este módulo e o banco (contrato_registrar_arquivo) faz o mesmo.
import * as R from './regras.js';

// quem: 'cca' (equipe anexa) ou 'corretor' (corretor/imobiliária anexa)
export const TIPOS_CONTRATO = [
  { codigo: 'minuta', nome: 'Minuta', quem: 'cca', grupo: 'assinatura', dica: 'O corretor baixa a minuta, colhe as assinaturas dos vendedores e compradores e em seguida anexa no portal.' },
  { codigo: 'minuta_assinada', nome: 'Minuta assinada pelas partes', quem: 'corretor', grupo: 'assinatura', dica: 'Corretor anexa a minuta assinada aqui.' },
  { codigo: 'contrato_assinado', nome: 'Minuta assinada pelo gerente', quem: 'cca', grupo: 'entregas', dica: 'Assinada pelo gerente da Caixa depois de receber a minuta assinada pelas partes.' },
  { codigo: 'procuracao_gerente', nome: 'Procuração', quem: 'cca', grupo: 'entregas', dica: 'Poderes do gerente para representar a CEF.' },
  { codigo: 'validador_assinatura', nome: 'Validador das assinaturas', quem: 'cca', grupo: 'entregas', dica: 'Comprova as assinaturas digitais.' },
  { codigo: 'planilha_progressao', nome: 'Planilha de evolução', quem: 'cca', grupo: 'entregas', dica: 'Entregue ao comprador.' },
  { codigo: 'carta_credito', nome: 'Carta de crédito', quem: 'cca', grupo: 'entregas', dica: 'Carta da Caixa ao vendedor: valor do crédito, número do contrato, conta a ser creditada e dados do vendedor (ou da empresa dele).' },
  { codigo: 'contrato_registrado', nome: 'Contrato registrado', quem: 'corretor', grupo: 'registro', dica: 'Devolvido pelo cartório com o registro.' },
  { codigo: 'talao_rgi', nome: 'Talão do RGI', quem: 'corretor', grupo: 'registro', dica: 'Comprovante do registro de imóveis.' },
  { codigo: 'onus_reais', nome: 'Certidão de ônus reais', quem: 'corretor', grupo: 'registro', dica: 'Pós-registro, constando o registro do contrato.' },
];
export const GRUPOS_CONTRATO = [
  { codigo: 'assinatura', titulo: 'Minuta para assinatura', ajuda: '' },
  { codigo: 'entregas', titulo: 'Entregas', ajuda: '' },
  { codigo: 'registro', titulo: 'Registro em cartório', ajuda: '' },
];
export const nomeTipoContrato = (c) => TIPOS_CONTRATO.find((t) => t.codigo === c)?.nome || c;
export const tiposDoGrupo = (g) => TIPOS_CONTRATO.filter((t) => t.grupo === g);

const PREPARO = ['minuta', 'planilha_progressao', 'carta_credito'];
const CAIXA = ['contrato_assinado', 'procuracao_gerente', 'validador_assinatura'];
export const TIPOS_CAIXA = CAIXA;
const REGISTRO = ['contrato_registrado', 'talao_rgi', 'onus_reais'];
const tem = (ativos, cods) => cods.every((c) => ativos.has(c));

// Arquivos atuais (o mais novo de cada tipo; os substituídos ficam de fora)
export function arquivosAtuais(lista = []) {
  const m = new Map();
  for (const a of lista.filter((x) => !x.substituido).sort((x, y) => String(x.enviado_em).localeCompare(String(y.enviado_em)))) m.set(a.tipo, a);
  return m;
}

const ordem = R.STATUS.map((s) => s.codigo);
export const idx = (s) => ordem.indexOf(s);
// O bloco Contrato aparece para a equipe a partir da Conformidade e para o corretor a partir da etapa Contrato
export const mostraContrato = (status, equipe) => idx(status) >= idx(equipe ? 'conformidade' : 'minuta_em_maos') && !R.STATUS_ENCERRADOS.includes(status) && idx(status) >= 0;

// Em que passo o processo está e de quem é a vez
export function passoContrato(status, arquivos) {
  const a = arquivos instanceof Map ? new Set(arquivos.keys()) : new Set(arquivos);
  switch (status) {
    case 'conformidade': return { codigo: 'preparo', rotulo: 'Dossiê na Conformidade da Caixa', vez: 'cca', detalhe: 'Com a Conformidade aprovada, a CCA anexa a minuta, a planilha de evolução e a carta de crédito.' };
    case 'minuta_em_maos':
      if (!a.has('minuta')) return { codigo: 'preparo', rotulo: 'Preparando a minuta', vez: 'cca', detalhe: 'A minuta, a planilha de evolução e a carta de crédito ainda não foram anexadas pela CCA.' };
      if (!a.has('minuta_assinada')) return { codigo: 'assinatura', rotulo: 'Aguardando a assinatura das partes', vez: 'corretor', detalhe: 'Minuta disponível para o corretor. Falta o corretor anexar a minuta assinada pelas partes.' };
      return { codigo: 'gerente', rotulo: 'Assinada pelas partes: enviar ao gerente da Caixa', vez: 'cca', detalhe: 'Minuta assinada pelas partes recebida. Falta a CCA anexar a minuta assinada pelo gerente, a procuração e o validador das assinaturas.' };
    case 'contrato_assinado':
    case 'registro_cartorio': return { codigo: 'registro', rotulo: 'Aguardando o registro em cartório', vez: 'corretor', detalhe: 'Contrato assinado. Falta o corretor anexar o contrato registrado, o talão do RGI e a certidão de ônus reais.' };
    case 'conformidade_final': return { codigo: 'conformidade', rotulo: 'Na conformidade final', vez: 'cca', detalhe: 'Documentação do registro recebida. A CCA lança no SIOPI e, estando conforme, libera o crédito ao vendedor.' };
    case 'credito_liberado': return { codigo: 'fim', rotulo: 'Crédito liberado: processo finalizado', vez: null, detalhe: '' };
    default: return null;
  }
}

// O que acontece quando um arquivo é anexado. `ativos` = tipos já anexados, incluindo o novo.
// Devolve { irPara, historico: [codigos em ordem], paraAviso, mensagem, conversa } (campos nulos quando nada acontece)
export function efeitoDoArquivo({ status, tipo, ativos, nomeCliente, equipe }) {
  const a = ativos instanceof Set ? ativos : new Set(ativos);
  const nada = { irPara: null, historico: [], paraAviso: null, mensagem: null, conversa: null };
  if (PREPARO.includes(tipo)) {
    if (status === 'conformidade' && tem(a, PREPARO)) return { irPara: 'minuta_em_maos', historico: ['minuta_em_maos'], paraAviso: 'minuta_em_maos',
      mensagem: `A minuta de ${nomeCliente} está disponível para assinatura. Abra o cliente no Portal, baixe a minuta, colha as assinaturas do comprador e do vendedor e envie a minuta assinada.`, conversa: null };
    if (status === 'minuta_em_maos' && tipo === 'minuta') return { ...nada, paraAviso: status, mensagem: `A minuta de ${nomeCliente} foi atualizada. Baixe a versão nova no Portal antes de colher as assinaturas.` };
    return nada;
  }
  if (tipo === 'minuta_assinada') return equipe ? nada : { ...nada, conversa: 'Enviei a minuta assinada pelas partes (comprador e vendedor). Ela já está no sistema.' };
  if (CAIXA.includes(tipo)) {
    if (status === 'minuta_em_maos' && tem(a, CAIXA)) return { irPara: 'registro_cartorio', historico: ['contrato_assinado', 'registro_cartorio'], paraAviso: 'contrato_assinado',
      mensagem: `O contrato de ${nomeCliente} está assinado! Todos os documentos já estão no Portal, disponíveis para baixar e imprimir. Próximo passo: levar o contrato ao cartório de registro de imóveis. Depois de registrado, envie aqui o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro.`, conversa: null };
    return nada;
  }
  if (REGISTRO.includes(tipo) && status === 'registro_cartorio' && tem(a, REGISTRO))
    return { irPara: 'conformidade_final', historico: ['conformidade_final'], paraAviso: null, mensagem: null,
      conversa: equipe ? null : 'Enviei o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro. Pode seguir para a conformidade.' };
  return nada;
}

// Quem pode anexar este tipo (a equipe pode anexar qualquer um)
export const podeAnexar = (tipo, { equipe }) => equipe || TIPOS_CONTRATO.find((t) => t.codigo === tipo)?.quem === 'corretor';
// Se o botão de anexar aparece agora: o corretor só anexa na etapa certa; a equipe, sempre
export function podeAnexarAgora(tipo, status, { equipe }) {
  if (!podeAnexar(tipo, { equipe })) return false;
  if (equipe) return true;
  if (tipo === 'minuta_assinada') return status === 'minuta_em_maos';
  return status === 'registro_cartorio';
}
// Mensagem de processo finalizado (equipe libera o crédito)
export const msgCreditoLiberado = (nome) => `O crédito de ${nome} foi liberado na conta do vendedor. O processo está finalizado! Todos os documentos continuam no Portal para baixar e imprimir.`;
