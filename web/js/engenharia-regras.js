// Regras da solicitação de engenharia (avaliação do imóvel pela Caixa).
// A engenharia é sempre em nome do VENDEDOR do imóvel e não depende de uma venda em andamento.

export const TIPOS_ENGENHARIA = [
  { codigo: 'novo_fgts', nome: 'Imóvel novo (FGTS)', servico: 'A413 - F30 - P171 - Avaliação Finan. Habitacional' },
  { codigo: 'novo_sbpe', nome: 'Imóvel novo (SBPE)', servico: 'A413 - F30 - P171 - Avaliação Finan. Habitacional' },
  { codigo: 'usado', nome: 'Imóvel usado (FGTS ou SBPE)', servico: 'A413 - F30 - P171 - Avaliação Finan. Habitacional' },
  { codigo: 'atc', nome: 'Aquisição de terreno e construção (ATC)', servico: 'B438 - F30 - P173 - Análise Aquisição Terr e Const' },
  { codigo: 'ctp', nome: 'Construção em terreno próprio (CTP)', servico: 'B437 - F30 - P172 - Análise Const Terreno Próprio' },
];

export const DOCS_ENGENHARIA = {
  ART: 'ART',
  SINTESE: 'Síntese memorial (modelo Caixa)',
  MATRICULA: 'Matrícula do imóvel',
  IPTU: 'Espelho do IPTU',
  ALVARA: 'Alvará',
  HABITESE: 'Habite-se',
  PROJETO: 'Projeto arquitetônico',
  CNO_SCPO: 'CNO e SCPO',
  CREA_CAU: 'Carteira CREA/CAU',
  PCI: 'PCI em Excel e PDF',
  BOLETO: 'Boleto da engenharia',
  COMPROVANTE: 'Comprovante de pagamento',
  PEPT_DOC: 'Documento para a pendência (PEPT)',
};

// Lista de documentos exigidos para pedir a OS, por tipo de imóvel
export const DOCS_POR_TIPO = {
  novo_fgts: ['ART', 'SINTESE', 'MATRICULA', 'ALVARA', 'HABITESE', 'PROJETO', 'CNO_SCPO'],
  novo_sbpe: ['ART', 'MATRICULA', 'ALVARA', 'HABITESE', 'PROJETO'],
  usado: ['MATRICULA', 'IPTU', 'HABITESE'],
  atc: ['ART', 'MATRICULA', 'ALVARA', 'CREA_CAU', 'PROJETO', 'PCI'],
  ctp: ['ART', 'MATRICULA', 'ALVARA', 'CREA_CAU', 'PROJETO', 'PCI'],
};

export const ETAPAS_ENGENHARIA = [
  { codigo: 'documentacao', nome: 'Enviando documentos' },
  { codigo: 'em_analise', nome: 'CCA cadastrando na Caixa' },
  { codigo: 'boleto', nome: 'Boleto para pagar' },
  { codigo: 'pago', nome: 'Pagamento informado' },
  { codigo: 'os_recebida', nome: 'Ordem de serviço recebida' },
  { codigo: 'laudo', nome: 'Resultado da vistoria' },
];

export const QUEM_PAGA = [['vendedor', 'Vendedor'], ['comprador', 'Comprador'], ['imobiliaria', 'Imobiliária'], ['corretor', 'Corretor']];

export const nomeTipoEngenharia = (cod) => TIPOS_ENGENHARIA.find((t) => t.codigo === cod)?.nome || cod;
export const servicoDoTipo = (cod) => TIPOS_ENGENHARIA.find((t) => t.codigo === cod)?.servico || '';
export const nomeEtapaEngenharia = (cod) => ETAPAS_ENGENHARIA.find((e) => e.codigo === cod)?.nome || cod;

// Validade do laudo: 180 dias depois da data da avaliação (datas "AAAA-MM-DD")
export function validadeDoLaudo(dataAvaliacao) {
  if (!dataAvaliacao) return null;
  const [a, m, d] = String(dataAvaliacao).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + 180));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Quantos dias faltam para vencer (negativo = vencido)
export function diasParaVencer(validade, hoje = new Date()) {
  if (!validade) return null;
  const [a, m, d] = validade.split('-').map(Number);
  const h0 = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((Date.UTC(a, m - 1, d) - h0) / 86400000);
}

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function moeda(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Documentos que ainda faltam (por tipo de imóvel) dado o que já foi enviado
export function docsFaltando(tipo, enviados) {
  const tem = new Set((enviados || []).map((d) => d.tipo));
  return (DOCS_POR_TIPO[tipo] || []).filter((c) => !tem.has(c));
}

// Contestação do valor: reavaliação exige de 5 a 10 links de anúncios de imóveis parecidos
export function linksDeAnuncios(texto) {
  return String(texto || '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^https?:\/\/\S+\.\S+/i.test(s));
}
export function contestacaoValida(tipo, links) {
  if (tipo === 'segunda_instancia') return { ok: true };
  if (tipo !== 'reavaliacao') return { ok: false, erro: 'Escolha reavaliação ou segunda instância.' };
  const n = new Set(links).size;
  return n >= 5 && n <= 10 ? { ok: true } : { ok: false, erro: `A reavaliação pede de 5 a 10 links de anúncios parecidos (você colocou ${n}).` };
}
