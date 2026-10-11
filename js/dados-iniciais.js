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
  { codigo: 'MATRICULA', alvo: 'imovel', nome: 'Certidão de ônus reais atualizada (matrícula)', grupo: 'Imóvel', regra: '', condicao: [], ordem: 30 },
  { codigo: 'ESPELHO_IPTU', alvo: 'imovel', nome: 'Espelho do IPTU', grupo: 'Imóvel', regra: '', condicao: [], ordem: 31 },
  { codigo: 'SIMULACAO', alvo: 'processo', nome: 'Simulação', grupo: 'Simulação e outros', regra: '*', condicao: [], ordem: 60 },
  { codigo: 'OUTROS', alvo: 'processo', multiplo: true, nome: 'Outros documentos', grupo: 'Simulação e outros', regra: '', condicao: [], ordem: 61 },
  { codigo: 'VEND_PF_IDENTIDADE', alvo: 'vendedor_pf', nome: 'Identidade: CNH (na falta, RG, CTPS ou passaporte)', grupo: 'Vendedor', regra: '', condicao: [], ordem: 70 },
  { codigo: 'VEND_PF_RESIDENCIA', alvo: 'vendedor_pf', nome: 'Comprovante de residência', grupo: 'Vendedor', regra: '', condicao: [], ordem: 71 },
  { codigo: 'VEND_PF_CERT_NASCIMENTO', alvo: 'vendedor_pf', nome: 'Certidão de nascimento', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Solteiro(a)' }, { estado_civil: 'União estável' }], ordem: 72 },
  { codigo: 'VEND_PF_CERT_CASAMENTO', alvo: 'vendedor_pf', nome: 'Certidão de casamento', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Casado(a)' }], ordem: 73 },
  { codigo: 'VEND_PF_CERT_DIVORCIO', alvo: 'vendedor_pf', nome: 'Certidão de casamento com averbação do divórcio', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Divorciado(a)' }], ordem: 74 },
  { codigo: 'VEND_PF_CERT_OBITO', alvo: 'vendedor_pf', nome: 'Certidão de casamento e certidão de óbito do cônjuge', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Viúvo(a)' }], ordem: 75 },
  { codigo: 'VEND_CONJ_IDENTIDADE', alvo: 'vendedor_pf', nome: 'Cônjuge do vendedor: identidade (CNH, RG, CTPS ou passaporte)', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Casado(a)' }], ordem: 76 },
  { codigo: 'VEND_CONJ_RESIDENCIA', alvo: 'vendedor_pf', nome: 'Cônjuge do vendedor: comprovante de residência', grupo: 'Vendedor', regra: '', condicao: [{ estado_civil: 'Casado(a)' }], ordem: 77 },
  { codigo: 'VEND_PJ_CONTRATO_SOCIAL', alvo: 'vendedor_pj', nome: 'Contrato social consolidado', grupo: 'Vendedor', regra: '', condicao: [], ordem: 80 },
  { codigo: 'VEND_PJ_ALTERACOES', alvo: 'vendedor_pj', nome: 'Últimas alterações contratuais (se houver)', grupo: 'Vendedor', regra: '*', condicao: [], ordem: 81 },
  { codigo: 'VEND_PJ_CARTAO_CNPJ', alvo: 'vendedor_pj', nome: 'Cartão CNPJ', grupo: 'Vendedor', regra: '', condicao: [], ordem: 82 },
  { codigo: 'VEND_PJ_DOCS_SOCIOS', alvo: 'vendedor_pj', nome: 'Identidade dos sócios (CNH, RG, CTPS ou passaporte)', grupo: 'Vendedor', regra: '', condicao: [], ordem: 83 },
  { codigo: 'VEND_PJ_CERTIDAO_JUNTA', alvo: 'vendedor_pj', nome: 'Certidão simplificada da Junta Comercial (JUCERJA no RJ)', grupo: 'Vendedor', regra: '', condicao: [], ordem: 84 },
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
