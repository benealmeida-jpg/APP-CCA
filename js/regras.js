// Regras de negócio do APP CCA, sem dependências.
// Usado pelo app (navegador) e pelas funções de servidor (Deno).

export const STATUS = [
  { codigo: 'cadastro_recebido', nome: 'Cadastro recebido' },
  { codigo: 'documentacao_pendente', nome: 'Documentação pendente' },
  { codigo: 'cadastro_ok', nome: 'Cadastro OK' },
  { codigo: 'em_analise', nome: 'Em análise' },
  { codigo: 'cliente_aprovado', nome: 'Cliente Aprovado' },
  { codigo: 'conformidade', nome: 'Conformidade' },
  { codigo: 'minuta_em_maos', nome: 'Minuta em mãos' },
  { codigo: 'contrato_assinado', nome: 'Contrato assinado' },
];

export const MOTIVOS_RECUSA = [
  'Ilegível', 'Foto com baixa qualidade', 'Documento cortado',
  'Documento vencido', 'Documento errado', 'Outro',
];

export const SITUACAO_NOME = {
  pendente: 'Pendente',
  em_conferencia: 'Em conferência',
  aceito: 'Aceito',
  recusado: 'Recusado',
  substituido: 'Substituído',
};

export function nomeStatus(codigo) {
  return (STATUS.find((s) => s.codigo === codigo) || { nome: codigo }).nome;
}

// ---------- Formatação e validação ----------

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

export function formatarCpf(v) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function formatarCelular(v) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

// Para a API do WhatsApp: +55DDDNUMERO
export function celularInternacional(v) {
  const d = soDigitos(v);
  if (!d) return null;
  return d.startsWith('55') && d.length >= 12 ? `+${d}` : `+55${d}`;
}

export function formatarMoeda(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function lerMoeda(v) {
  const d = soDigitos(v);
  return d ? Number(d) / 100 : null;
}

// ---------- Renda e Imposto de Renda ----------

export const PARAMETROS_PADRAO = {
  limite_isencao_irpf_anual: 35584,      // IRPF 2026 (ano-base 2025)
  prazo_entrega_irpf: '2026-05-29',
  teto_renda_informal_sem_ir: 2550,
};

// Separa formal/informal, aplica a regra da Caixa:
// renda informal acima do limite de isenção + cliente sem IR => considera no máximo o teto (R$ 2.550,00).
export function analisarRenda(cli, parametros = PARAMETROS_PADRAO) {
  const p = { ...PARAMETROS_PADRAO, ...parametros };
  const limiteMensal = Number(p.limite_isencao_irpf_anual) / 12;
  const teto = Number(p.teto_renda_informal_sem_ir);
  const n = (v) => Number(v) || 0;
  let formal = 0; let informal = 0;
  if (cli.tipo_renda === 'Mista') { formal = n(cli.renda_formal); informal = n(cli.renda_informal); }
  else if (cli.tipo_renda === 'Informal') informal = n(cli.renda_bruta);
  else formal = n(cli.renda_bruta);
  const total = formal + informal;
  const acimaLimite = total > limiteMensal;
  const semIr = cli.declara_ir === false;
  let informalConsiderada = informal;
  if (semIr && informal > limiteMensal) informalConsiderada = Math.min(informal, teto);
  const corte = informalConsiderada < informal;
  return {
    limiteMensal, teto, prazo: p.prazo_entrega_irpf, formal, informal, total,
    acimaLimite, corte, informalConsiderada,
    considerada: formal + informalConsiderada,
    irObrigatorioSemIr: acimaLimite && semIr,
  };
}

export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ---------- Documentos ----------

// Um tipo de documento é exigido se a condição estiver vazia
// ou se o cliente "contiver" algum dos objetos da lista.
export function documentoSeAplica(tipo, cliente) {
  const cond = tipo.condicao || [];
  if (!cond.length) return true;
  return cond.some((obj) => Object.entries(obj).every(([k, v]) => cliente[k] === v));
}

// Versão atual de cada tipo (ignora substituídos)
export function versaoAtual(documentos, tipoCodigo) {
  return documentos
    .filter((d) => d.tipo_codigo === tipoCodigo && d.situacao !== 'substituido')
    .sort((a, b) => b.versao - a.versao)[0] || null;
}

export function documentosNecessarios(tipos, cliente, documentos = []) {
  return tipos
    .filter((t) => t.ativo !== false && documentoSeAplica(t, cliente))
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => {
      const atual = versaoAtual(documentos, t.codigo);
      return {
        tipo_codigo: t.codigo,
        nome: t.nome,
        grupo: t.grupo,
        regra: t.regra || '',
        documento: atual,
        situacao: atual ? atual.situacao : 'pendente',
      };
    });
}

export function podeIrParaAnalise(necessarios) {
  return !necessarios.some((n) => n.regra === '**' && ['pendente', 'recusado'].includes(n.situacao));
}

export function resumoDocumentos(necessarios) {
  const r = { total: necessarios.length, enviados: 0, pendente: 0, em_conferencia: 0, aceito: 0, recusado: 0 };
  for (const n of necessarios) {
    r[n.situacao] = (r[n.situacao] || 0) + 1;
    if (n.situacao !== 'pendente') r.enviados++;
  }
  r.faltando_obrigatorio = necessarios.filter((n) => n.regra === '**' && ['pendente', 'recusado'].includes(n.situacao));
  return r;
}

export function agruparPorGrupo(necessarios) {
  const grupos = [];
  for (const n of necessarios) {
    let g = grupos.find((x) => x.titulo === n.grupo);
    if (!g) grupos.push((g = { titulo: n.grupo, itens: [] }));
    g.itens.push(n);
  }
  return grupos;
}

// Nome fixo do arquivo na pasta documentos/ do Drive
export function nomeArquivoDrive(tipoCodigo, nomeOriginal) {
  const ext = (String(nomeOriginal || '').match(/\.([a-z0-9]+)$/i) || [, 'pdf'])[1].toLowerCase();
  return `${tipoCodigo}.${ext}`;
}

export function nomePastaCliente(cliente) {
  return `${cliente.nome} - ${soDigitos(cliente.cpf)}`;
}

// ---------- Arquivo para o Cowork ----------

export function montarCadastroJson({ cliente, corretor, imobiliaria, necessarios, agora = new Date() }) {
  return {
    versao_formato: 1,
    atualizado_em: agora.toISOString(),
    status: nomeStatus(cliente.status),
    pode_ir_para_analise: podeIrParaAnalise(necessarios),
    corretor: {
      nome: corretor?.nome ?? null,
      imobiliaria: imobiliaria?.nome ?? 'Autônomo',
      whatsapp: corretor?.whatsapp ?? null,
    },
    cliente: {
      nome: cliente.nome,
      cpf: formatarCpf(cliente.cpf),
      data_nascimento: cliente.data_nascimento ?? null,
      estado_civil: cliente.estado_civil ?? null,
      pis: cliente.pis ?? null,
      email: cliente.email ?? null,
      telefone: celularInternacional(cliente.celular),
    },
    operacao: {
      modalidade: cliente.modalidade ?? null,
      programa: cliente.programa ?? null,
      imovel: cliente.imovel ?? null,
      vendedor: cliente.vendedor ?? null,
      usa_fgts: cliente.usa_fgts ?? null,
    },
    renda: {
      tipo: cliente.tipo_renda ?? null,
      bruta_mensal: cliente.renda_bruta === null || cliente.renda_bruta === undefined ? null : Number(cliente.renda_bruta),
      formal_mensal: cliente.renda_formal ? Number(cliente.renda_formal) : null,
      considerada_mensal: cliente.renda_considerada ? Number(cliente.renda_considerada) : null,
      informal_mensal: cliente.renda_informal ? Number(cliente.renda_informal) : null,
      compoe_renda: cliente.compoe_renda ?? null,
      declara_ir: cliente.declara_ir ?? null,
      ir_retificado: cliente.ir_retificado ?? null,
      dependentes: cliente.dependentes ?? 0,
    },
    extras: cliente.extras && Object.keys(cliente.extras).length ? cliente.extras : undefined,
    documentos: necessarios.map((n) => {
      const d = n.documento;
      const item = {
        tipo: n.tipo_codigo,
        nome: n.nome,
        regra: n.regra,
        situacao: n.situacao,
        arquivo: d ? `documentos/${nomeArquivoDrive(n.tipo_codigo, d.nome_original)}` : null,
      };
      if (d) item.versao = d.versao;
      if (n.situacao === 'recusado') {
        item.motivo_recusa = d.motivo_recusa ?? null;
        if (d.observacao_recusa) item.observacao_recusa = d.observacao_recusa;
      }
      return item;
    }),
  };
}

export function montarFichaMd(json) {
  const s = (v) => (v === null || v === undefined || v === '' ? '—' : v === true ? 'Sim' : v === false ? 'Não' : v);
  const linhas = [
    `# Ficha do cliente – ${json.cliente.nome}`,
    '',
    `Atualizado em: ${new Date(json.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    `Status: **${json.status}**`,
    `Pode ir para análise: **${json.pode_ir_para_analise ? 'Sim' : 'Não (falta documento **)'}**`,
    '',
    '## Corretor',
    `- Nome: ${s(json.corretor.nome)}`,
    `- Imobiliária: ${s(json.corretor.imobiliaria)}`,
    `- WhatsApp: ${s(json.corretor.whatsapp)}`,
    '',
    '## Cliente',
    `- Nome: ${s(json.cliente.nome)}`,
    `- CPF: ${s(json.cliente.cpf)}`,
    `- Data de nascimento: ${s(json.cliente.data_nascimento)}`,
    `- Estado civil: ${s(json.cliente.estado_civil)}`,
    `- PIS: ${s(json.cliente.pis)}`,
    `- E-mail: ${s(json.cliente.email)}`,
    `- Telefone: ${s(json.cliente.telefone)}`,
    '',
    '## Operação',
    `- Modalidade: ${s(json.operacao.modalidade)}`,
    `- Programa: ${s(json.operacao.programa)}`,
    `- Imóvel: ${s(json.operacao.imovel)}`,
    `- Vendedor: ${s(json.operacao.vendedor)}`,
    `- Usa FGTS: ${s(json.operacao.usa_fgts)}`,
    '',
    '## Renda e dependentes',
    `- Tipo de renda: ${s(json.renda.tipo)}`,
    `- Renda bruta mensal: ${json.renda.bruta_mensal === null ? '—' : formatarMoeda(json.renda.bruta_mensal)}`,
    ...(json.renda.formal_mensal ? [`- Renda formal: ${formatarMoeda(json.renda.formal_mensal)}`, `- Renda informal: ${formatarMoeda(json.renda.informal_mensal)}`] : []),
    ...(json.renda.considerada_mensal && json.renda.considerada_mensal !== json.renda.bruta_mensal ? [`- Renda considerada pela Caixa: ${formatarMoeda(json.renda.considerada_mensal)} (renda informal limitada: sem IR)`] : []),
    `- Compõe renda: ${s(json.renda.compoe_renda)}`,
    `- Declara IR: ${s(json.renda.declara_ir)}${json.renda.ir_retificado ? ' (com retificação)' : ''}`,
    `- Dependentes: ${s(json.renda.dependentes)}`,
    '',
    '## Documentos',
    '| Documento | Regra | Situação | Arquivo |',
    '|---|---|---|---|',
    ...json.documentos.map((d) =>
      `| ${d.nome} | ${d.regra || ''} | ${SITUACAO_NOME[d.situacao] || d.situacao}${d.motivo_recusa ? ` (${d.motivo_recusa})` : ''} | ${d.arquivo || '—'} |`),
    '',
  ];
  return linhas.join('\n');
}

// ---------- Textos de WhatsApp ----------

export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

export const ASSINATURA = '— Andrade Almeida CCA';

export function msgCadastroRecebido({ corretor, cliente, necessarios }) {
  const r = resumoDocumentos(necessarios);
  let t = `Olá, ${primeiroNome(corretor.nome)}! Recebemos o cadastro de *${cliente.nome}*.`;
  if (r.faltando_obrigatorio.length) {
    t += `\n\n⚠️ Sem ${listarNomes(r.faltando_obrigatorio)}, o processo não tem como ir para análise neste momento. Anexe pelo Portal do Corretor.`;
  } else if (r.pendente) {
    t += `\n\nAinda faltam ${r.pendente} documento(s). Você pode anexar pelo Portal do Corretor.`;
  }
  return `${t}\n${ASSINATURA}`;
}

export function msgStatus({ corretor, cliente, novoStatus }) {
  return `Olá, ${primeiroNome(corretor.nome)}! O cliente *${cliente.nome}* avançou para *${nomeStatus(novoStatus)}*.\nAcompanhe no Portal do Corretor.\n${ASSINATURA}`;
}

export function msgRecusa({ corretor, cliente, documentoNome, motivo, observacao, regra }) {
  let t = `Olá, ${primeiroNome(corretor.nome)}! O documento *${documentoNome}* de *${cliente.nome}* foi recusado.\nMotivo: ${motivo}.`;
  if (observacao) t += `\nObservação: ${observacao}.`;
  t += '\nEnvie uma nova cópia pelo botão Substituir no Portal do Corretor.';
  if (regra === '**') t += '\n⚠️ Sem esse documento o processo não tem como ir para análise.';
  return `${t}\n${ASSINATURA}`;
}

function listarNomes(itens) {
  const nomes = itens.map((i) => i.nome);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
