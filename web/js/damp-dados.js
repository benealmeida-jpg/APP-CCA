// DAMP (Modelo 2): qual modelo da Caixa vale para o cliente, pela linha de crédito, faixa de renda e FGTS. Regras puras.

// Modelos de exemplo até a CCA enviar os modelos reais (código, nome e regra editáveis na tela Modelos de DAMP)
export const MODELOS_EXEMPLO = [
  { id: 'damp-ex-1', codigo: 'EXEMPLO-01', nome: 'MCMV com FGTS (até a faixa 2)', programa: 'MCMV', renda_min: 0, renda_max: 5000, fgts: 'sim', exemplo: true, ativo: true },
  { id: 'damp-ex-2', codigo: 'EXEMPLO-02', nome: 'MCMV sem FGTS', programa: 'MCMV', renda_min: 0, renda_max: 13000, fgts: 'nao', exemplo: true, ativo: true },
  { id: 'damp-ex-3', codigo: 'EXEMPLO-03', nome: 'MCMV com FGTS (faixas 3 e 4)', programa: 'MCMV', renda_min: 5000.01, renda_max: 13000, fgts: 'sim', exemplo: true, ativo: true },
  { id: 'damp-ex-4', codigo: 'EXEMPLO-04', nome: 'SBPE e Pró-Cotista', programa: '*', renda_min: 0, renda_max: null, fgts: 'qualquer', exemplo: true, ativo: true },
];
export const PROGRAMAS_DAMP = [['*', 'Qualquer linha'], ['MCMV', 'MCMV'], ['SBPE', 'SBPE'], ['Pró-Cotista', 'Pró-Cotista']];
export const FGTS_DAMP = [['qualquer', 'Com ou sem FGTS'], ['sim', 'Com FGTS'], ['nao', 'Sem FGTS']];

// Renda considerada: a do cliente somada à dos outros compradores que compõem renda
export function rendaDoCaso(cliente, participantes = []) {
  const base = Number(cliente?.renda_bruta) || 0;
  return base + participantes.filter((p) => p.compoe_renda !== false).reduce((s, p) => s + (Number(p.renda_bruta) || 0), 0);
}

// O modelo mais específico que atende ao caso (uma linha exata vence "qualquer linha"; FGTS exato vence "qualquer")
export function escolherDamp(cliente, modelos = [], participantes = []) {
  const renda = rendaDoCaso(cliente, participantes);
  const fgts = cliente?.usa_fgts ? 'sim' : 'nao';
  const servem = modelos.filter((m) => m.ativo !== false
    && (m.programa === '*' || m.programa === cliente?.programa)
    && (m.fgts === 'qualquer' || m.fgts === fgts)
    && renda >= (Number(m.renda_min) || 0)
    && (m.renda_max == null || m.renda_max === '' || renda <= Number(m.renda_max)));
  const peso = (m) => (m.programa === '*' ? 0 : 2) + (m.fgts === 'qualquer' ? 0 : 1);
  return servem.sort((a, b) => peso(b) - peso(a))[0] || null;
}

export const descreverRegra = (m) => [
  m.programa === '*' ? 'Qualquer linha' : m.programa,
  m.renda_max == null || m.renda_max === '' ? `renda a partir de ${reais(m.renda_min)}` : `renda de ${reais(m.renda_min)} a ${reais(m.renda_max)}`,
  m.fgts === 'qualquer' ? 'com ou sem FGTS' : m.fgts === 'sim' ? 'com FGTS' : 'sem FGTS',
].join(' · ');
const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// Situação da DAMP de um cliente: sem_modelo | para_assinar | assinada | lancada
export function situacaoDamp(registro) {
  if (!registro) return 'sem_modelo';
  if (registro.lancada_em) return 'lancada';
  if (registro.assinada) return 'assinada';
  return 'para_assinar';
}
