// Configuração inicial (igual à migração do banco). Usada pelo modo demonstração.

export const TIPOS_DOCUMENTO = [
  { codigo: 'RG_CNH', por_pessoa: true, nome: 'Identidade: CNH (na falta, RG, CTPS ou passaporte)', grupo: 'Do cliente', regra: '**', condicao: [], ordem: 1 },
  { codigo: 'PIS', por_pessoa: true, nome: 'Número do PIS', grupo: 'Do cliente', regra: '*', condicao: [], ordem: 2 },
  { codigo: 'COMPROVANTE_RESIDENCIA', por_pessoa: true, nome: 'Comprovante de residência', grupo: 'Do cliente', regra: '', condicao: [], ordem: 3 },
  { codigo: 'CERTIDAO_ESTADO_CIVIL', por_pessoa: true, nome: 'Certidão de estado civil', grupo: 'Do cliente', regra: '', condicao: [], ordem: 4 },
  { codigo: 'CONTRACHEQUES', por_pessoa: true, nome: '3 últimos contracheques', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Formal' }, { tipo_renda: 'Mista' }], ordem: 10 },
  { codigo: 'CARTEIRA_TRABALHO', por_pessoa: true, nome: 'Carteira de trabalho', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Formal' }, { tipo_renda: 'Mista' }], ordem: 11 },
  { codigo: 'COMPROVANTE_RENDA_INF', por_pessoa: true, nome: 'Extratos bancários dos últimos 12 meses (renda informal)', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Informal' }, { tipo_renda: 'Mista' }], ordem: 12 },
  { codigo: 'DECLARACAO_IR', por_pessoa: true, nome: 'Declaração do Imposto de Renda', grupo: 'Renda', regra: '', condicao: [{ declara_ir: true }], ordem: 13 },
  { codigo: 'RECIBO_IR', por_pessoa: true, nome: 'Recibo de entrega do IR', grupo: 'Renda', regra: '', condicao: [{ declara_ir: true }], ordem: 14 },
  { codigo: 'IR_RETIFICADORA', por_pessoa: true, nome: 'Declaração retificadora do IR', grupo: 'Renda', regra: '', condicao: [{ ir_retificado: true }], ordem: 15 },
  { codigo: 'RECIBO_IR_RETIFICADORA', por_pessoa: true, nome: 'Recibo de entrega da retificadora', grupo: 'Renda', regra: '', condicao: [{ ir_retificado: true }], ordem: 16 },
  { codigo: 'DEFIS_ULTIMO_ANO', por_pessoa: true, nome: 'DEFIS da empresa – último ano', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Pró-labore' }], ordem: 17 },
  { codigo: 'DEFIS_PENULTIMO_ANO', por_pessoa: true, nome: 'DEFIS da empresa – penúltimo ano', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Pró-labore' }], ordem: 18 },
  { codigo: 'EXTRATO_FGTS', nome: 'Extrato do FGTS', grupo: 'FGTS', regra: '', condicao: [{ usa_fgts: true }], ordem: 20 },
  { codigo: 'FATOR_SOCIAL_RG_CERTIDAO', por_dependente: true, nome: 'RG ou Certidão de Nascimento', grupo: 'Fator social', regra: '', condicao: [{ filho: true }, { filho: false, menor: true }], ordem: 40 },
  { codigo: 'FATOR_SOCIAL_RG_CNH', por_dependente: true, nome: 'RG ou CNH', grupo: 'Fator social', regra: '', condicao: [{ filho: false, menor: false }], ordem: 41 },
  { codigo: 'DECLARACAO_DEPENDENTE', por_dependente: true, nome: 'Declaração de dependente', grupo: 'Fator social', regra: '', condicao: [{ filho: false }], ordem: 42 },
  { codigo: 'MATRICULA', nome: 'Matrícula atualizada', grupo: 'Imóvel e vendedor', regra: '', condicao: [], ordem: 30 },
  { codigo: 'DOCS_VENDEDOR', nome: 'RG e CPF do vendedor', grupo: 'Imóvel e vendedor', regra: '', condicao: [{ vendedor: 'Pessoa física' }], ordem: 31 },
];

export const OPCOES = {
  modalidade: ['Aquisição de Imóvel', 'Aquisição de Terreno e Construção', 'Construção em Terreno Próprio', 'Término de Obra', 'Reforma e/ou Ampliação'],
  programa: ['MCMV', 'SBPE', 'Pró-Cotista'],
  imovel: ['Novo', 'Usado', 'Na planta', 'Leilão'],
  vendedor: ['Pessoa física', 'Construtora / PJ'],
  tipo_renda: ['Formal', 'Informal', 'Mista', 'Pró-labore'],
  estado_civil: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'],
};

export { PARAMETROS_PADRAO as PARAMETROS } from './regras.js';
