// Conferência do contrato antes da liberação (regras puras, testáveis).
// A CCA confere o contrato assinado contra o cadastro, confere as assinaturas (app + ITI) e a procuração do gerente.
import * as R from './regras.js';
import { conferirAssinantes, mesmaPessoa } from './assinatura-pdf.js';

export const TIPOS_CONTRATO_CAIXA = [
  { codigo: 'digital', nome: 'NATO Digital', ajuda: 'Todos assinam digitalmente (gov.br ou certificado ICP-Brasil).' },
  { codigo: 'misto', nome: 'Misto', ajuda: 'Permite assinatura manual de alguma parte. Confira essas no papel.' },
];

// Itens que a CCA marca (os mesmos códigos que o banco exige para liberar)
export const ITENS_CONFERENCIA = [
  { codigo: 'comprador', titulo: 'Dados do(s) comprador(es)', dica: 'Nome, CPF, estado civil e regime de bens iguais ao cadastro.' },
  { codigo: 'vendedor', titulo: 'Dados do vendedor', dica: 'Nome/razão social, CPF/CNPJ, cônjuge e quem assina pela empresa.' },
  { codigo: 'imovel', titulo: 'Dados do imóvel', dica: 'Endereço, matrícula e cartório de registro.' },
  { codigo: 'gerente', titulo: 'Dados do gerente da CAIXA', dica: 'Nome e CPF do gerente iguais aos da procuração.' },
  { codigo: 'campos_assinatura', titulo: 'Campos de assinatura de todos', dica: 'Cada envolvido tem o seu campo de assinatura no contrato (respeitando as dispensas do vendedor).' },
  { codigo: 'assinaturas', titulo: 'Assinaturas validadas no ITI', dica: 'Relatório do validar.iti.gov.br anexado e todas as assinaturas aprovadas.' },
];

export const URL_ITI = 'https://validar.iti.gov.br/';

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);

// Procuração mais nova do gerente (a que vale para os contratos)
export const procuracaoVigente = (gerente) => (gerente?.procuracoes || []).filter((p) => !p.excluida_em)
  .sort((a, b) => String(b.enviado_em || '').localeCompare(String(a.enviado_em || '')))[0] || null;

// Situação da procuração: sem | sem_validade | vencida | vence_logo (até 30 dias) | ok
export function situacaoProcuracao(p, agora = new Date()) {
  if (!p) return { estado: 'sem', tom: 'alerta', texto: 'Sem procuração anexada' };
  if (!p.validade) return { estado: 'sem_validade', tom: 'atencao', texto: 'Validade não informada' };
  const dias = diasEntre(R.hojeIso(agora), p.validade);
  const data = R.formatarData(p.validade);
  if (dias < 0) return { estado: 'vencida', tom: 'alerta', dias, texto: `Vencida em ${data}` };
  if (dias <= 30) return { estado: 'vence_logo', tom: 'atencao', dias, texto: `Vence em ${data} (${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`})` };
  return { estado: 'ok', tom: 'ok', dias, texto: `Válida até ${data}` };
}

// Quem precisa assinar o contrato
export function assinantesEsperados({ cliente, participantes = [], vendedor = null, gerente = null }) {
  const lista = [];
  const add = (nome, papel) => { if (nome && !lista.some((x) => mesmaPessoa(x.nome, nome))) lista.push({ nome: String(nome).trim(), papel }); };
  if (cliente) add(cliente.nome, 'Comprador(a)');
  for (const p of participantes) {
    if (p.papel === 'comprador') add(p.nome, 'Comprador(a)');
    else if (p.papel === 'conjuge') add(p.nome, 'Cônjuge do(a) comprador(a)');
  }
  if (vendedor) {
    if (vendedor.tipo === 'PJ') {
      const pelaEmpresa = (Array.isArray(vendedor.assinantes) ? vendedor.assinantes : []).filter(Boolean);
      if (pelaEmpresa.length) pelaEmpresa.forEach((n) => add(n, `Assina pelo vendedor (${vendedor.nome})`));
      else if (vendedor.responsavel_nome) add(vendedor.responsavel_nome, `Assina pelo vendedor (${vendedor.nome})`);
      else lista.push({ nome: '', papel: `Quem assina pelo vendedor (${vendedor.nome})`, indefinido: true });
    } else {
      add(vendedor.nome, 'Vendedor(a)');
      if (vendedor.conjuge_nome) add(vendedor.conjuge_nome, 'Cônjuge do(a) vendedor(a)');
    }
  }
  if (gerente) add(gerente.nome, 'Gerente da CAIXA (procurador)');
  return lista;
}

// Compara quem precisa assinar com as assinaturas digitais lidas do PDF
export function conferirAssinaturasContrato(esperados, nomesLidos, tipo = 'digital') {
  const definidos = esperados.filter((p) => !p.indefinido);
  const r = conferirAssinantes(definidos, nomesLidos);
  const indefinidos = esperados.filter((p) => p.indefinido);
  const completo = !r.faltam.length && !indefinidos.length;
  let resumo;
  if (!nomesLidos.length) resumo = tipo === 'misto' ? 'Nenhuma assinatura digital encontrada. Em contrato misto, confira as assinaturas manuais no papel.' : 'Nenhuma assinatura digital encontrada no PDF. Confira se anexou o arquivo assinado (não a cópia impressa).';
  else if (completo) resumo = `Todas as ${r.assinaram.length} assinaturas esperadas estão no PDF.`;
  else if (tipo === 'misto') resumo = `Faltam ${r.faltam.length} assinatura(s) digital(is). Em contrato misto, confira se essas pessoas assinaram à mão.`;
  else resumo = `Faltam ${r.faltam.length + indefinidos.length} assinatura(s). Contrato NATO Digital: todos precisam assinar digitalmente.`;
  return { ...r, indefinidos, completo, resumo };
}

// Pendências para liberar (espelho da função contrato_pendencias_liberacao do banco, para mostrar na tela)
export function pendenciasLiberacao({ cliente, arquivos, gerente, agora = new Date() }) {
  const a = arquivos instanceof Map ? new Set(arquivos.keys()) : new Set(arquivos || []);
  const falta = [];
  if (cliente.status !== 'minuta_em_maos') falta.push('o processo não está na etapa Contrato');
  if (!cliente.contrato_tipo) falta.push('tipo de contrato (NATO Digital ou Misto)');
  if (!cliente.contrato_gerente_id) falta.push('gerente responsável');
  if (!a.has('contrato_assinado')) falta.push('contrato assinado por todos');
  if (!a.has('validador_assinatura')) falta.push('relatório de validação do ITI');
  if (!a.has('procuracao_gerente')) falta.push('procuração do gerente vinculada');
  if (cliente.contrato_gerente_id) {
    const s = situacaoProcuracao(procuracaoVigente(gerente), agora);
    if (s.estado === 'sem_validade') falta.push('validade da procuração');
    if (s.estado === 'vencida') falta.push('procuração vencida: anexe a nova no cadastro do gerente');
    if (s.estado === 'sem') falta.push('procuração do gerente no cadastro');
  }
  const itens = cliente.contrato_conferencia?.itens || {};
  for (const it of ITENS_CONFERENCIA) if (itens[it.codigo] !== true) falta.push(`conferir ${it.titulo.charAt(0).toLowerCase()}${it.titulo.slice(1)}`);
  return falta;
}

// Dados do cadastro que a CCA compara com o texto do contrato
export function dadosParaConferir({ cliente, participantes = [], vendedor = null, imovel = null, gerente = null }) {
  const cpf = (v) => (v ? (String(v).replace(/\D/g, '').length === 14 ? R.formatarCnpj(v) : R.formatarCpf(v)) : '—');
  const pessoa = (p, papel) => [`${papel}: ${p.nome || '—'}`, `CPF ${cpf(p.cpf)}`, p.estado_civil ? `${p.estado_civil}${p.regime_bens ? ` · ${p.regime_bens}` : ''}` : null].filter(Boolean).join(' · ');
  const compradores = [pessoa(cliente, 'Titular'), ...participantes.filter((p) => ['comprador', 'conjuge'].includes(p.papel)).map((p) => pessoa(p, R.PAPEL_NOME[p.papel] || 'Comprador'))];
  const vend = !vendedor ? ['Vendedor ainda não vinculado ao processo'] : [
    `${vendedor.tipo === 'PJ' ? 'Empresa' : 'Vendedor(a)'}: ${vendedor.nome} · ${vendedor.tipo === 'PJ' ? 'CNPJ' : 'CPF'} ${cpf(vendedor.cpf_cnpj)}`,
    vendedor.tipo === 'PF' && vendedor.estado_civil ? `${vendedor.estado_civil}${vendedor.conjuge_nome ? ` · cônjuge ${vendedor.conjuge_nome}` : ''}` : null,
    vendedor.tipo === 'PJ' ? `Assina pela empresa: ${(vendedor.assinantes || []).join(', ') || vendedor.responsavel_nome || 'não informado'}` : null,
    vendedor.regra_assinatura ? `Regra de assinatura: ${vendedor.regra_assinatura}` : null].filter(Boolean);
  const imv = !imovel ? ['Imóvel ainda não cadastrado no processo'] : [
    [imovel.endereco, imovel.cidade && imovel.uf ? `${imovel.cidade}/${imovel.uf}` : imovel.cidade].filter(Boolean).join(' · '),
    imovel.matricula ? `Matrícula ${imovel.matricula}` : 'Matrícula não informada',
    imovel.cartorio_rgi ? `Cartório: ${imovel.cartorio_rgi}` : null].filter(Boolean);
  const ger = !gerente ? ['Escolha o gerente responsável'] : [`${gerente.nome}${gerente.cpf ? ` · CPF ${cpf(gerente.cpf)}` : ''}${gerente.agencia ? ` · agência ${gerente.agencia}` : ''}`];
  return { comprador: compradores, vendedor: vend, imovel: imv, gerente: ger };
}

// Lista de nomes (um por linha ou separados por vírgula) → array limpo
export const listaDeNomes = (txt) => String(txt || '').split(/[\n,;]+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
