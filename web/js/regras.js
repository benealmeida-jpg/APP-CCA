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

export function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((t, p, i) => t + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatarCnpj(v) {
  const d = soDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export const BANCOS = ['104 - Caixa Econômica Federal', '001 - Banco do Brasil', '237 - Bradesco', '341 - Itaú', '033 - Santander',
  '260 - Nubank', '077 - Inter', '336 - C6 Bank', '748 - Sicredi', '756 - Sicoob', '041 - Banrisul', '212 - Banco Original', '208 - BTG Pactual'];
export const ehCaixa = (banco) => /^104\b|caixa/i.test(banco || '');

// Em que página da tela de documentos cada tipo aparece
export const SECOES_DOCS = [
  ['compradores', 'Compradores'], ['vendedor', 'Vendedor'], ['imovel', 'Imóvel'], ['outros', 'Simulação e outros'],
];
export function secaoDoTipo(t) {
  const alvo = t.alvo || 'comprador';
  if (alvo.startsWith('vendedor')) return 'vendedor';
  if (alvo === 'imovel') return 'imovel';
  if (alvo === 'processo') return 'outros';
  return 'compradores';
}
// Quais documentos o vendedor envia: PF; PJ (avulso ou empreendimento sem recurso da Caixa);
// empreendimento Caixa não envia nada (dados da SPE já estão no SIOPI)
export function alvoDoVendedor(vendedor, cliente = {}) {
  if (!vendedor) return null;
  if (vendedor.tipo === 'PF') return 'vendedor_pf';
  if (vendedor.tipo === 'PJ') return vendedor.pj_tipo === 'Empreendimento' && cliente.empreendimento_caixa === true ? null : 'vendedor_pj';
  return null;
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
  // MCMV – Portaria MCID nº 333/2026 (renda) e tetos de imóvel vigentes em 2026
  mcmv_faixa1_urbana: 3200, mcmv_faixa2_urbana: 5000, mcmv_faixa3_urbana: 9600, mcmv_faixa4_urbana: 13000,
  mcmv_faixa1_rural_anual: 50000, mcmv_faixa2_rural_anual: 70900, mcmv_faixa3_rural_anual: 134000, mcmv_faixa4_rural_anual: 165000,
  mcmv_teto_imovel_faixa12: 275000, mcmv_teto_imovel_faixa3: 400000, mcmv_teto_imovel_faixa4: 600000,
  // Caixa: idade do comprador mais velho + prazo não pode passar de 85 anos; prazo máximo 420 meses
  idade_maxima_final: 85, prazo_maximo_meses: 420,
  // Avisos aos corretores: 'whatsapp' (API Meta, com custo) ou 'push' (notificação do app, sem custo)
  canal_avisos: 'push',
};

export const ESCOLARIDADE = ['Não alfabetizado', 'Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação'];
export const REGIME_BENS = ['Comunhão parcial', 'Comunhão universal', 'Separação total (convencional)', 'Separação obrigatória', 'Participação final nos aquestos'];
export const NATUREZA_JURIDICA = ['LTDA/Cia', 'S/A', 'Firma individual'];

// Documentos de imóvel novo (curso Caixa): 'FGTS' (MCMV ou Pró-Cotista) ou 'SBPE'. Não se aplica a empreendimento com recurso da Caixa.
export function docsImovelNovo(cliente, vendedor = null) {
  if (cliente.modalidade !== 'Aquisição de Imóvel' || cliente.imovel !== 'Novo') return null;
  if (cliente.vendedor === 'Construtora / PJ' && cliente.empreendimento_caixa === true && (!vendedor || vendedor.pj_tipo === 'Empreendimento')) return null;
  if (!cliente.programa) return null;
  return cliente.programa === 'SBPE' ? 'SBPE' : 'FGTS';
}

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

// Enquadramento no MCMV pela renda (considerada pela Caixa) e pelo valor do imóvel.
// A faixa final é a maior entre a faixa da renda e a faixa do valor do imóvel.
// tetoF12: teto das Faixas 1 e 2 do município (tabela oficial da Caixa). Sem ele, usa o maior teto do país (parâmetro).
export function enquadrarMcmv({ rendaMensal, zona = 'Urbana', valorImovel = null, tetoF12 = null }, parametros = PARAMETROS_PADRAO) {
  const p = { ...PARAMETROS_PADRAO, ...parametros };
  const rural = zona === 'Rural';
  const renda = rural ? (Number(rendaMensal) || 0) * 12 : Number(rendaMensal) || 0;
  const limites = rural
    ? [p.mcmv_faixa1_rural_anual, p.mcmv_faixa2_rural_anual, p.mcmv_faixa3_rural_anual, p.mcmv_faixa4_rural_anual].map(Number)
    : [p.mcmv_faixa1_urbana, p.mcmv_faixa2_urbana, p.mcmv_faixa3_urbana, p.mcmv_faixa4_urbana].map(Number);
  const tetoMunicipio = Number(tetoF12) || null;
  const t12 = tetoMunicipio || Number(p.mcmv_teto_imovel_faixa12);
  const tetos = [t12, t12, p.mcmv_teto_imovel_faixa3, p.mcmv_teto_imovel_faixa4].map(Number);
  const res = { rural, renda, limites, tetos, tetoDoMunicipio: !!tetoMunicipio, faixa: null, faixaRenda: null, faixaValor: null, foraPorRenda: false, foraPorValor: false };
  const i = limites.findIndex((l) => renda <= l);
  if (i === -1) res.foraPorRenda = true; else res.faixaRenda = i + 1;
  const v = Number(valorImovel) || 0;
  if (v) {
    const j = tetos.findIndex((t) => v <= t);
    if (j === -1) res.foraPorValor = true; else res.faixaValor = j + 1;
  }
  if (!res.foraPorRenda && !res.foraPorValor) res.faixa = Math.max(res.faixaRenda, res.faixaValor || 1);
  res.limiteRenda = limites[3];
  res.tetoImovel = tetos[3];
  return res;
}

export function idadeEmMeses(dataNascimento, hoje = new Date()) {
  if (!dataNascimento) return null;
  const [a, m, d] = String(dataNascimento).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  let meses = (hoje.getFullYear() - a) * 12 + (hoje.getMonth() + 1 - m);
  if (hoje.getDate() < d) meses -= 1;
  return meses;
}

// Prazo máximo: idade do comprador mais velho + prazo <= 85 anos, e no máximo 420 meses.
export function prazoMaximo(pessoas, parametros = PARAMETROS_PADRAO, hoje = new Date()) {
  const p = { ...PARAMETROS_PADRAO, ...parametros };
  const comIdade = pessoas.map((pe) => ({ nome: pe.nome, meses: idadeEmMeses(pe.data_nascimento, hoje) })).filter((x) => x.meses !== null);
  const semData = pessoas.filter((pe) => !pe.data_nascimento).map((pe) => pe.nome);
  if (!comIdade.length) return { prazo: null, semData };
  const maisVelho = comIdade.reduce((a, b) => (b.meses > a.meses ? b : a));
  const pelaIdade = Number(p.idade_maxima_final) * 12 - maisVelho.meses;
  const prazo = Math.max(0, Math.min(Number(p.prazo_maximo_meses), pelaIdade));
  return {
    prazo, semData, maisVelho: { nome: maisVelho.nome, anos: Math.floor(maisVelho.meses / 12) },
    limitadoPelaIdade: pelaIdade < Number(p.prazo_maximo_meses),
    idadeMaxima: Number(p.idade_maxima_final), prazoMaximoMeses: Number(p.prazo_maximo_meses),
  };
}

// Junta tudo: faixa MCMV + prazo, para o cadastro inteiro
export function enquadramentoDoProcesso(cliente, participantes = [], parametros = PARAMETROS_PADRAO, hoje = new Date()) {
  const renda = rendaDoProcesso(cliente, participantes, parametros);
  const mcmv = enquadrarMcmv({ rendaMensal: renda.considerada, zona: cliente.imovel_zona || 'Urbana', valorImovel: cliente.valor_imovel, tetoF12: cliente.imovel_teto_f12 }, parametros);
  const compradores = [cliente, ...(participantes || []).filter((x) => x.papel === 'comprador')];
  const prazo = prazoMaximo(compradores, parametros, hoje);
  return { renda, mcmv, prazo };
}

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

// Soma a renda de todos que compõem renda (titular + compradores; cônjuge sem renda fica fora).
export function rendaDoProcesso(cliente, participantes = [], parametros = PARAMETROS_PADRAO) {
  const pessoas = [cliente, ...(participantes || []).filter((p) => p.papel === 'comprador')];
  let bruta = 0; let considerada = 0;
  const porPessoa = pessoas.map((pe) => {
    const a = analisarRenda(pe, parametros);
    const b = pe.tipo_renda === 'Mista' ? a.total : (Number(pe.renda_bruta) || 0);
    const c = pe.declara_ir === false || pe.declara_ir === true ? a.considerada : b;
    bruta += b; considerada += c;
    return { nome: pe.nome, bruta: b, considerada: c };
  });
  return { pessoas: pessoas.length, bruta, considerada, porPessoa };
}

// Permissões da equipe: ADM pode tudo; Usuário pode o que o ADM não desligou
export const PERMISSOES = [
  ['mudar_status', 'Mudar status dos clientes'],
  ['conferir_documentos', 'Aceitar e recusar documentos'],
  ['ver_mensagens', 'Ver mensagens enviadas'],
  ['ver_imobiliarias_corretores', 'Ver imobiliárias e corretores (e convidar corretores)'],
  ['ver_vendedores', 'Ver e editar a base de vendedores'],
  ['ver_acessos', 'Ver registro de acessos'],
];
export function pode(perfil, chave) {
  if (!perfil) return false;
  if (perfil.papel === 'admin') return true;
  if (perfil.papel === 'equipe_cca') return (perfil.permissoes || {})[chave] !== false;
  return false;
}

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
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

// Versão atual de cada tipo, por pessoa (ignora substituídos). participanteId nulo = titular.
export function versaoAtual(documentos, tipoCodigo, participanteId = null, dependenteOrdem = null) {
  return documentos
    .filter((d) => d.tipo_codigo === tipoCodigo && (d.participante_id ?? null) === participanteId
      && (d.dependente_ordem ?? null) === dependenteOrdem && d.situacao !== 'substituido')
    .sort((a, b) => b.versao - a.versao)[0] || null;
}

export const PAPEL_NOME = { titular: 'Titular', comprador: 'Comprador', conjuge: 'Cônjuge' };

// Pessoas do processo: titular (na própria ficha) + participantes
export function pessoasDoProcesso(cliente, participantes = []) {
  const campos = (p) => {
    const { id, cliente_id, ordem, criado_em, atualizado_em, ...resto } = p;
    return resto;
  };
  return [
    { participante_id: null, ordem: 1, papel: 'titular', nome: cliente.nome, dados: cliente },
    ...[...participantes].sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({ participante_id: p.id, ordem: p.ordem, papel: p.papel, nome: p.nome, dados: { ...cliente, ...campos(p) } })),
  ];
}

export function documentosNecessarios(tipos, cliente, documentos = [], participantes = [], extras = {}) {
  const ativos = tipos.filter((t) => t.ativo !== false).sort((a, b) => a.ordem - b.ordem);
  const pessoas = pessoasDoProcesso(cliente, participantes);
  const varias = pessoas.length > 1;
  const lista = [];
  for (const pe of pessoas) {
    for (const t of ativos) {
      if (t.por_dependente || t.multiplo || (t.alvo || '').startsWith('vendedor')) continue;
      if (!(t.por_pessoa || pe.participante_id === null)) continue;
      if (!documentoSeAplica(t, pe.dados)) continue;
      const atual = versaoAtual(documentos, t.codigo, pe.participante_id);
      lista.push({
        tipo_codigo: t.codigo,
        nome: t.nome,
        grupo: t.grupo,
        regra: t.regra || '',
        por_pessoa: !!t.por_pessoa,
        participante_id: pe.participante_id,
        pessoa_nome: pe.nome,
        pessoa_papel: pe.papel,
        pessoa_ordem: pe.ordem,
        rotulo: varias && t.por_pessoa ? `${t.nome} – ${primeiroNome(pe.nome)}` : t.nome,
        secao: secaoDoTipo(t),
        documento: atual,
        situacao: atual ? atual.situacao : 'pendente',
      });
    }
  }
  // Fator social: documentos de cada dependente
  dependentesDoProcesso(cliente).forEach((dep) => {
    for (const t of ativos.filter((x) => x.por_dependente)) {
      if (!documentoSeAplica(t, dep)) continue;
      const atual = versaoAtual(documentos, t.codigo, null, dep.ordem);
      lista.push({
        tipo_codigo: t.codigo,
        nome: t.nome,
        grupo: `Fator social · ${dep.titulo}`,
        regra: t.regra || '',
        por_pessoa: false,
        participante_id: null,
        dependente_ordem: dep.ordem,
        pessoa_nome: dep.titulo,
        pessoa_papel: 'dependente',
        pessoa_ordem: 1,
        rotulo: `${t.nome} – ${dep.titulo}`,
        secao: 'compradores',
        documento: atual,
        situacao: atual ? atual.situacao : 'pendente',
      });
    }
  });
  // Vendedor: documentos do cadastro do vendedor (compartilhados entre processos)
  const alvoVend = /^Aquisição/.test(cliente.modalidade || '') ? alvoDoVendedor(extras.vendedor, cliente) : null;
  if (alvoVend) {
    for (const t of ativos.filter((x) => x.alvo === alvoVend)) {
      if (!documentoSeAplica(t, extras.vendedor)) continue;
      const atual = (extras.documentosVendedor || []).find((d) => d.tipo_codigo === t.codigo) || null;
      lista.push({
        tipo_codigo: t.codigo, nome: t.nome, grupo: `Vendedor · ${extras.vendedor.nome}`, regra: t.regra || '',
        por_pessoa: false, participante_id: null, pessoa_ordem: 1, rotulo: `${t.nome} – vendedor`,
        secao: 'vendedor', do_vendedor: true, documento: atual ? { ...atual, do_vendedor: true } : null,
        situacao: atual ? atual.situacao : 'pendente',
      });
    }
  }
  // Tipos que aceitam vários arquivos (ex.: Outros documentos): um item por arquivo + um para anexar mais
  for (const t of ativos.filter((x) => x.multiplo)) {
    const enviados = documentos.filter((d) => d.tipo_codigo === t.codigo && d.situacao !== 'substituido').sort((a, b) => a.versao - b.versao);
    const base = { tipo_codigo: t.codigo, grupo: t.grupo, regra: '', por_pessoa: false, participante_id: null, pessoa_ordem: 1, secao: secaoDoTipo(t), multiplo: true };
    enviados.forEach((d, i) => lista.push({ ...base, nome: `${t.nome} ${i + 1}`, rotulo: `${t.nome} ${i + 1}`, documento: d, situacao: d.situacao }));
    lista.push({ ...base, nome: enviados.length ? `Anexar mais um (${t.nome.toLowerCase()})` : t.nome, rotulo: t.nome, documento: null, situacao: 'pendente', opcional: true });
  }
  return lista;
}

// Dependentes com as respostas (filho? menor de idade?)
export function dependentesDoProcesso(cliente) {
  const info = Array.isArray(cliente.dependentes_info) ? cliente.dependentes_info : [];
  const n = Number(cliente.dependentes) || 0;
  return info.slice(0, n).map((d, i) => {
    const ordem = i + 1;
    const tipo = d.filho === true ? 'filho(a)' : d.filho === false ? (d.menor === true ? 'menor de idade' : d.menor === false ? 'maior de idade' : '') : '';
    return { ...d, ordem, titulo: `Dependente ${ordem}${d.nome ? ` (${d.nome})` : tipo ? ` (${tipo})` : ''}` };
  }).filter((d) => d.filho === true || (d.filho === false && (d.menor === true || d.menor === false)));
}

// Para a Caixa, união estável é estado civil solteiro(a)
export function estadoCivilCaixa(estadoCivil) {
  return estadoCivil === 'União estável' ? 'Solteiro(a)' : (estadoCivil ?? null);
}

export function podeIrParaAnalise(necessarios) {
  return !necessarios.some((n) => n.regra === '**' && ['pendente', 'recusado'].includes(n.situacao));
}

export function resumoDocumentos(todos) {
  const necessarios = todos.filter((n) => !n.opcional);
  const r = { total: necessarios.length, enviados: 0, pendente: 0, em_conferencia: 0, aceito: 0, recusado: 0 };
  for (const n of necessarios) {
    r[n.situacao] = (r[n.situacao] || 0) + 1;
    if (n.situacao !== 'pendente') r.enviados++;
  }
  r.faltando_obrigatorio = necessarios.filter((n) => n.regra === '**' && ['pendente', 'recusado'].includes(n.situacao));
  return r;
}

export function agruparPorGrupo(necessarios) {
  const varias = new Set(necessarios.map((n) => n.participante_id ?? null)).size > 1;
  const grupos = [];
  for (const n of necessarios) {
    const titulo = varias && n.por_pessoa
      ? `${n.pessoa_nome} · ${PAPEL_NOME[n.pessoa_papel] || ''}${n.grupo === 'Do cliente' ? '' : ` · ${n.grupo}`}`
      : (varias && n.grupo === 'Do cliente' ? 'Do processo' : n.grupo);
    let g = grupos.find((x) => x.titulo === titulo);
    if (!g) grupos.push((g = { titulo, itens: [] }));
    g.itens.push(n);
  }
  return grupos;
}

// Nome fixo do arquivo na pasta documentos/ do Drive
export function nomeArquivoDrive(tipoCodigo, nomeOriginal, pessoaOrdem = 1, dependenteOrdem = null) {
  const ext = (String(nomeOriginal || '').match(/\.([a-z0-9]+)$/i) || [, 'pdf'])[1].toLowerCase();
  if (dependenteOrdem) return `${tipoCodigo}__dependente${dependenteOrdem}.${ext}`;
  return pessoaOrdem > 1 ? `${tipoCodigo}__pessoa${pessoaOrdem}.${ext}` : `${tipoCodigo}.${ext}`;
}

export function nomePastaCliente(cliente) {
  return `${cliente.nome} - ${soDigitos(cliente.cpf)}`;
}

// ---------- Arquivo para o Cowork ----------

export function montarCadastroJson({ cliente, corretor, imobiliaria, necessarios, participantes = [], vendedor = null, agora = new Date() }) {
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
      estado_civil: estadoCivilCaixa(cliente.estado_civil),
      uniao_estavel: cliente.estado_civil === 'União estável',
      pis: cliente.pis ?? null,
      email: cliente.email ?? null,
      telefone: celularInternacional(cliente.celular),
      escolaridade: cliente.escolaridade ?? null,
    },
    operacao: {
      modalidade: cliente.modalidade ?? null,
      programa: cliente.programa ?? null,
      imovel: cliente.imovel ?? null,
      vendedor: cliente.vendedor ?? null,
      empreendimento_financiado_caixa: cliente.empreendimento_caixa ?? null,
      usa_fgts: cliente.usa_fgts ?? null,
      cotista_fgts_3_anos: cliente.cotista_fgts ?? null,
    },
    vendedor: vendedor ? {
      tipo: vendedor.tipo,
      cpf_cnpj: vendedor.tipo === 'PF' ? formatarCpf(vendedor.cpf_cnpj) : formatarCnpj(vendedor.cpf_cnpj),
      nome: vendedor.nome,
      tipo_venda: vendedor.tipo === 'PJ' ? (vendedor.pj_tipo ?? null) : null,
      empreendimento: vendedor.empreendimento ?? null,
      construtora: vendedor.construtora_cnpj ? { cnpj: formatarCnpj(vendedor.construtora_cnpj), nome: vendedor.construtora_nome ?? null } : null,
      empreendimento_financiado_caixa: vendedor.tipo === 'PJ' ? (cliente.empreendimento_caixa ?? null) : null,
      estado_civil: vendedor.tipo === 'PF' ? estadoCivilCaixa(vendedor.estado_civil) : null,
      uniao_estavel: vendedor.estado_civil === 'União estável',
      conjuge_tambem_vendedor: vendedor.tipo === 'PF' && vendedor.estado_civil === 'Casado(a)' ? { nome: vendedor.conjuge_nome ?? null, cpf: formatarCpf(vendedor.conjuge_cpf || '') } : null,
      regime_bens: vendedor.tipo === 'PF' && vendedor.estado_civil === 'Casado(a)' ? (vendedor.regime_bens ?? null) : null,
      natureza_juridica: vendedor.tipo === 'PJ' ? (vendedor.natureza_juridica ?? null) : null,
      telefone: celularInternacional(vendedor.telefone),
      email: vendedor.email ?? null,
      conta_recebimento: { banco: vendedor.banco ?? null, agencia: vendedor.agencia ?? null, operacao: vendedor.operacao ?? null, conta: vendedor.conta ?? null, digito: vendedor.conta_digito ?? null,
        conta_caixa: ehCaixa(vendedor.banco) },
    } : null,
    imovel_localizacao: {
      uf: cliente.imovel_uf ?? null,
      municipio: cliente.imovel_municipio ?? null,
      zona: cliente.imovel_zona ?? null,
      regiao_metropolitana: cliente.imovel_regiao_metropolitana ?? null,
      valor_imovel: cliente.valor_imovel ? Number(cliente.valor_imovel) : null,
      teto_mcmv_faixas_1_2: cliente.imovel_teto_f12 ? Number(cliente.imovel_teto_f12) : null,
      documentos_de_imovel_novo: cliente.docs_imovel_novo ?? null,
    },
    enquadramento: (() => {
      const e = enquadramentoDoProcesso(cliente, participantes);
      return {
        faixa_mcmv: cliente.programa === 'MCMV' ? e.mcmv.faixa : null,
        fora_do_mcmv_por_renda: e.mcmv.foraPorRenda,
        fora_do_mcmv_por_valor: e.mcmv.foraPorValor,
        prazo_maximo_meses: e.prazo.prazo,
        comprador_mais_velho: e.prazo.maisVelho ?? null,
        prazo_limitado_pela_idade: !!e.prazo.limitadoPelaIdade,
      };
    })(),
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
      dependentes_detalhe: dependentesDoProcesso(cliente).map((d) => ({ ordem: d.ordem, filho: d.filho, menor_de_idade: d.filho ? null : d.menor })),
    },
    renda_total_compradores: (() => {
      const t = rendaDoProcesso(cliente, participantes);
      return { pessoas: t.pessoas, bruta_mensal: t.bruta, considerada_mensal: t.considerada };
    })(),
    compradores: pessoasDoProcesso(cliente, participantes).map((pe) => ({
      ordem: pe.ordem,
      papel: pe.papel,
      nome: pe.dados.nome,
      cpf: formatarCpf(pe.dados.cpf),
      data_nascimento: pe.dados.data_nascimento ?? null,
      estado_civil: estadoCivilCaixa(pe.dados.estado_civil),
      uniao_estavel: pe.dados.estado_civil === 'União estável',
      telefone: celularInternacional(pe.dados.celular),
      email: pe.dados.email ?? null,
      escolaridade: pe.dados.escolaridade ?? null,
      renda: pe.papel === 'conjuge' ? null : {
        tipo: pe.dados.tipo_renda ?? null,
        bruta_mensal: pe.dados.renda_bruta ? Number(pe.dados.renda_bruta) : null,
        formal_mensal: pe.dados.renda_formal ? Number(pe.dados.renda_formal) : null,
        informal_mensal: pe.dados.renda_informal ? Number(pe.dados.renda_informal) : null,
        considerada_mensal: pe.dados.renda_considerada ? Number(pe.dados.renda_considerada) : null,
        declara_ir: pe.dados.declara_ir ?? null,
        ir_retificado: pe.dados.ir_retificado ?? null,
      },
    })),
    extras: cliente.extras && Object.keys(cliente.extras).length ? cliente.extras : undefined,
    documentos: necessarios.map((n) => {
      const d = n.documento;
      const item = {
        tipo: n.tipo_codigo,
        nome: n.nome,
        regra: n.regra,
        situacao: n.situacao,
        arquivo: d ? (n.do_vendedor ? `documentos/vendedor/${nomeArquivoDrive(n.tipo_codigo, d.nome_original || 'x.pdf')}` : `documentos/${nomeArquivoDrive(n.tipo_codigo, d.nome_original, n.pessoa_ordem, n.dependente_ordem)}`) : null,
        secao: n.secao,
      };
      if (n.dependente_ordem) item.dependente = n.dependente_ordem;
      else if (n.pessoa_ordem) { item.pessoa = n.pessoa_nome; item.pessoa_ordem = n.pessoa_ordem; }
      if (d) item.versao = d.versao_pessoa ?? d.versao;
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
    '## Compradores',
    ...(json.compradores || []).map((c) => `- ${c.ordem}. ${c.nome} – ${PAPEL_NOME[c.papel]} – CPF ${c.cpf}${c.renda?.bruta_mensal ? ` – renda ${formatarMoeda(c.renda.bruta_mensal)}` : ''}`),
    '',
    ...(json.renda_total_compradores && json.renda_total_compradores.pessoas > 1 ? [
      `- **Renda total considerada pela Caixa: ${formatarMoeda(json.renda_total_compradores.considerada_mensal)}**`,
      ...(json.renda_total_compradores.considerada_mensal !== json.renda_total_compradores.bruta_mensal ? [`- Renda informada (antes do corte da renda informal sem IR): ${formatarMoeda(json.renda_total_compradores.bruta_mensal)}`] : []),
    ] : []),
    '',
    '## Titular',
    `- Nome: ${s(json.cliente.nome)}`,
    `- CPF: ${s(json.cliente.cpf)}`,
    `- Data de nascimento: ${s(json.cliente.data_nascimento)}`,
    `- Estado civil (Caixa): ${s(json.cliente.estado_civil)}${json.cliente.uniao_estavel ? ' – vive em união estável (a Caixa considera solteiro)' : ''}`,
    `- PIS: ${s(json.cliente.pis)}`,
    `- E-mail: ${s(json.cliente.email)}`,
    `- Telefone: ${s(json.cliente.telefone)}`,
    '',
    '## Operação',
    `- Modalidade: ${s(json.operacao.modalidade)}`,
    `- Programa: ${s(json.operacao.programa)}`,
    `- Imóvel: ${s(json.operacao.imovel)}`,
    `- Vendedor: ${s(json.operacao.vendedor)}`,
    ...(json.operacao.empreendimento_financiado_caixa === null || json.operacao.empreendimento_financiado_caixa === undefined ? [] : [`- Empreendimento com recurso da Caixa: ${s(json.operacao.empreendimento_financiado_caixa)}`]),
    `- Usa FGTS: ${s(json.operacao.usa_fgts)}`,
    `- Cotista do FGTS (3 anos ou mais): ${s(json.operacao.cotista_fgts_3_anos)}`,
    '',
    ...(json.vendedor ? [
      '## Vendedor',
      `- ${json.vendedor.tipo === 'PF' ? 'CPF' : 'CNPJ'}: ${s(json.vendedor.cpf_cnpj)}`,
      `- Nome: ${s(json.vendedor.nome)}`,
      ...(json.vendedor.estado_civil ? [`- Estado civil (Caixa): ${json.vendedor.estado_civil}${json.vendedor.uniao_estavel ? ' – vive em união estável' : ''}`] : []),
      ...(json.vendedor.conjuge_tambem_vendedor ? [`- Cônjuge (também vendedor no contrato): ${s(json.vendedor.conjuge_tambem_vendedor.nome)} – CPF ${json.vendedor.conjuge_tambem_vendedor.cpf}`] : []),
      ...(json.vendedor.regime_bens ? [`- Regime de bens: ${json.vendedor.regime_bens}`] : []),
      ...(json.vendedor.natureza_juridica ? [`- Tipo de empresa: ${json.vendedor.natureza_juridica}`] : []),
      `- Telefone: ${s(json.vendedor.telefone)} · E-mail: ${s(json.vendedor.email)}`,
      ...(json.vendedor.tipo_venda ? [`- Tipo de venda: ${json.vendedor.tipo_venda === 'Empreendimento' ? `Empreendimento (SPE) ${s(json.vendedor.empreendimento)}` : 'Imóvel avulso'}`] : []),
      ...(json.vendedor.construtora ? [`- Construtora: ${s(json.vendedor.construtora.nome)} – CNPJ ${json.vendedor.construtora.cnpj}`] : []),
      `- Conta para recebimento: ${json.vendedor.conta_recebimento.banco ? `${json.vendedor.conta_recebimento.banco}, agência ${s(json.vendedor.conta_recebimento.agencia)}${json.vendedor.conta_recebimento.operacao ? `, operação ${json.vendedor.conta_recebimento.operacao}` : ''}, conta ${s(json.vendedor.conta_recebimento.conta)}${json.vendedor.conta_recebimento.digito ? `-${json.vendedor.conta_recebimento.digito}` : ' (sem dígito)'}` : 'não informada'}`,
      '',
    ] : []),
    '## Localização do imóvel',
    `- Município/UF: ${s([json.imovel_localizacao?.municipio, json.imovel_localizacao?.uf].filter(Boolean).join(' / '))}`,
    `- Zona: ${s(json.imovel_localizacao?.zona)}`,
    `- Região metropolitana: ${s(json.imovel_localizacao?.regiao_metropolitana)}`,
    `- Valor do imóvel: ${json.imovel_localizacao?.valor_imovel ? formatarMoeda(json.imovel_localizacao.valor_imovel) : '—'}`,
    '',
    '## Enquadramento',
    ...(json.operacao.programa === 'MCMV' ? [`- Faixa MCMV: ${json.enquadramento?.faixa_mcmv ? `Faixa ${json.enquadramento.faixa_mcmv}` : 'fora do MCMV'}`] : []),
    `- Prazo máximo: ${json.enquadramento?.prazo_maximo_meses ? `${json.enquadramento.prazo_maximo_meses} meses` : '—'}${json.enquadramento?.prazo_limitado_pela_idade ? ` (limitado pela idade de ${json.enquadramento.comprador_mais_velho.nome}, ${json.enquadramento.comprador_mais_velho.anos} anos)` : ''}`,
    '',
    '## Renda e dependentes',
    `- Tipo de renda: ${s(json.renda.tipo)}`,
    `- Renda bruta mensal: ${json.renda.bruta_mensal === null ? '—' : formatarMoeda(json.renda.bruta_mensal)}`,
    ...(json.renda.formal_mensal ? [`- Renda formal: ${formatarMoeda(json.renda.formal_mensal)}`, `- Renda informal: ${formatarMoeda(json.renda.informal_mensal)}`] : []),
    ...(json.renda.considerada_mensal && json.renda.considerada_mensal !== json.renda.bruta_mensal ? [`- Renda considerada pela Caixa: ${formatarMoeda(json.renda.considerada_mensal)} (renda informal limitada: sem IR)`] : []),
    `- Compõe renda: ${s(json.renda.compoe_renda)}`,
    `- Declara IR: ${s(json.renda.declara_ir)}${json.renda.ir_retificado ? ' (com retificação)' : ''}`,
    `- Dependentes: ${s(json.renda.dependentes)}`,
    ...(json.renda.dependentes_detalhe || []).map((d) => `  - Dependente ${d.ordem}: ${d.filho ? 'filho(a)' : `não é filho(a), ${d.menor_de_idade ? 'menor' : 'maior'} de idade`}`),
    '',
    '## Documentos',
    '| Documento | Regra | Situação | Arquivo |',
    '|---|---|---|---|',
    ...json.documentos.map((d) =>
      `| ${d.nome}${d.pessoa_ordem > 1 ? ` (${d.pessoa})` : ''} | ${d.regra || ''} | ${SITUACAO_NOME[d.situacao] || d.situacao}${d.motivo_recusa ? ` (${d.motivo_recusa})` : ''} | ${d.arquivo || '—'} |`),
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
  const nomes = itens.map((i) => i.rotulo || i.nome);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
