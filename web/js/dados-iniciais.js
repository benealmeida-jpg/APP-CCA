// Configuração inicial (igual à migração do banco). Usada pelo modo demonstração.

export const TIPOS_DOCUMENTO = [
  { codigo: 'RG_CNH', nome: 'RG ou CNH', grupo: 'Do cliente', regra: '**', condicao: [], ordem: 1 },
  { codigo: 'PIS', nome: 'Número do PIS', grupo: 'Do cliente', regra: '*', condicao: [], ordem: 2 },
  { codigo: 'COMPROVANTE_RESIDENCIA', nome: 'Comprovante de residência', grupo: 'Do cliente', regra: '', condicao: [], ordem: 3 },
  { codigo: 'CERTIDAO_ESTADO_CIVIL', nome: 'Certidão de estado civil', grupo: 'Do cliente', regra: '', condicao: [], ordem: 4 },
  { codigo: 'CONTRACHEQUES', nome: '3 últimos contracheques', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Formal' }, { tipo_renda: 'Mista' }], ordem: 10 },
  { codigo: 'CARTEIRA_TRABALHO', nome: 'Carteira de trabalho', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Formal' }, { tipo_renda: 'Mista' }], ordem: 11 },
  { codigo: 'COMPROVANTE_RENDA_INF', nome: 'Comprovante de renda informal', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Informal' }, { tipo_renda: 'Mista' }], ordem: 12 },
  { codigo: 'EXTRATO_FGTS', nome: 'Extrato do FGTS', grupo: 'FGTS', regra: '', condicao: [{ usa_fgts: true }], ordem: 20 },
  { codigo: 'MATRICULA', nome: 'Matrícula atualizada', grupo: 'Imóvel e vendedor', regra: '', condicao: [], ordem: 30 },
  { codigo: 'DOCS_VENDEDOR', nome: 'RG e CPF do vendedor', grupo: 'Imóvel e vendedor', regra: '', condicao: [{ vendedor: 'Pessoa física' }], ordem: 31 },
];

export const OPCOES = {
  modalidade: ['Aquisição de Terreno e Construção'],
  programa: ['MCMV', 'SBPE', 'Pró-Cotista'],
  imovel: ['Novo', 'Usado', 'Na planta', 'Leilão'],
  vendedor: ['Pessoa física', 'Construtora / PJ'],
  tipo_renda: ['Formal', 'Informal', 'Mista'],
  estado_civil: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'],
};
