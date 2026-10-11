// MODO DEMONSTRAÇÃO: mesma interface do api-supabase.js, com dados guardados no próprio aparelho.
import * as R from './regras.js';
import { TIPOS_DOCUMENTO, OPCOES } from './dados-iniciais.js';

const CHAVE = 'appcca-demo-v1';
const arquivosNaMemoria = new Map(); // documento_id -> URL do arquivo enviado nesta sessão

const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const agora = () => new Date().toISOString();
const atraso = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function semente() {
  const imob = { id: 'imob-1', nome: 'Imobiliária Exemplo' };
  const usuarios = [
    { id: 'u-corretor', email: 'corretor@demo', senha: 'demo', nome: 'João Alves', whatsapp: '+5521900000002', papel: 'corretor', imobiliaria_id: imob.id },
    { id: 'u-corretora', email: 'ana@demo', senha: 'demo', nome: 'Ana Ribeiro', whatsapp: '+5521900000003', papel: 'corretor', imobiliaria_id: imob.id },
    { id: 'u-autonomo', email: 'pedro@demo', senha: 'demo', nome: 'Pedro Sousa', whatsapp: '+5521900000004', papel: 'corretor', imobiliaria_id: null },
    { id: 'u-equipe', email: 'equipe@demo', senha: 'demo', nome: 'Equipe CCA', whatsapp: null, papel: 'equipe_cca', imobiliaria_id: null },
  ];
  const base = { modalidade: 'Aquisição de Terreno e Construção', vendedor: 'Pessoa física', compoe_renda: false, dependentes: 0, estado_civil: 'Solteiro(a)', rascunho: false, autorizacao_lgpd_em: agora(), extras: {} };
  const c = (o) => ({ ...base, id: id(), imobiliaria_id: usuarios.find((u) => u.id === o.corretor_id).imobiliaria_id, criado_em: agora(), atualizado_em: agora(), enviado_em: agora(), ...o });
  const clientes = [
    c({ corretor_id: 'u-corretor', nome: 'Mariana Costa', cpf: '12345678909', programa: 'MCMV', imovel: 'Usado', usa_fgts: true, tipo_renda: 'Formal', renda_bruta: 4200, dependentes: 1, celular: '21987650001', status: 'documentacao_pendente' }),
    c({ corretor_id: 'u-corretor', nome: 'Rafael Nunes', cpf: '23456789092', programa: 'SBPE', imovel: 'Novo', usa_fgts: false, tipo_renda: 'Formal', renda_bruta: 9800, status: 'cliente_aprovado' }),
    c({ corretor_id: 'u-corretora', nome: 'Carlos Menezes', cpf: '45678901249', programa: 'MCMV', imovel: 'Na planta', usa_fgts: true, tipo_renda: 'Mista', renda_bruta: 3900, status: 'conformidade' }),
    c({ corretor_id: 'u-autonomo', nome: 'Juliana Prado', cpf: '34567890175', programa: 'Pró-Cotista', imovel: 'Leilão', usa_fgts: true, tipo_renda: 'Formal', renda_bruta: 7300, status: 'em_analise' }),
  ];
  const doc = (cli, tipo, situacao, extra = {}) => ({ id: id(), cliente_id: cli.id, tipo_codigo: tipo, versao: 1, situacao, nome_original: `${tipo.toLowerCase()}.pdf`, enviado_em: agora(), ...extra });
  const [mariana, rafael, carlos, juliana] = clientes;
  const documentos = [
    doc(mariana, 'COMPROVANTE_RESIDENCIA', 'recusado', { nome_original: 'conta-luz.jpg', motivo_recusa: 'Foto com baixa qualidade', observacao_recusa: 'endereço cortado na parte de baixo' }),
    doc(mariana, 'CONTRACHEQUES', 'aceito'), doc(mariana, 'CARTEIRA_TRABALHO', 'em_conferencia'),
    doc(mariana, 'EXTRATO_FGTS', 'aceito'), doc(mariana, 'MATRICULA', 'aceito'), doc(mariana, 'DOCS_VENDEDOR', 'aceito'),
    ...['RG_CNH', 'PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'MATRICULA', 'DOCS_VENDEDOR'].map((t) => doc(rafael, t, 'aceito')),
    ...['PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'COMPROVANTE_RENDA_INF', 'EXTRATO_FGTS', 'DOCS_VENDEDOR'].map((t) => doc(carlos, t, 'aceito')),
    doc(carlos, 'RG_CNH', 'em_conferencia', { nome_original: 'cnh-carlos.jpg', versao: 2 }),
    ...['RG_CNH', 'PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'EXTRATO_FGTS', 'MATRICULA', 'DOCS_VENDEDOR'].map((t) => doc(juliana, t, 'aceito')),
  ];
  const historico = [];
  const ordem = R.STATUS.map((s) => s.codigo);
  for (const cli of clientes) {
    const ate = ordem.indexOf(cli.status);
    for (let i = 1; i <= ate; i++) historico.push({ cliente_id: cli.id, de: ordem[i - 1], para: ordem[i], em: agora() });
  }
  const mensagens = [
    { id: id(), cliente_id: mariana.id, destino_id: 'u-corretor', tipo: 'recusa', texto: R.msgRecusa({ corretor: usuarios[0], cliente: mariana, documentoNome: 'Comprovante de residência', motivo: 'Foto com baixa qualidade', observacao: 'endereço cortado na parte de baixo' }), situacao: 'enviada', criada_em: agora() },
    { id: id(), cliente_id: mariana.id, destino_id: 'u-corretor', tipo: 'confirmacao', texto: 'Olá, João! Recebemos o cadastro de *Mariana Costa*.\n\n⚠️ Sem RG ou CNH, o processo não tem como ir para análise neste momento. Anexe pelo Portal do Corretor.\n— Andrade Almeida CCA', situacao: 'enviada', criada_em: agora() },
  ];
  return { imobiliarias: [imob], usuarios, clientes, documentos, historico, mensagens, acessos: [], sessao: null };
}

function ler() {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) return JSON.parse(s);
  } catch { /* armazenamento indisponível */ }
  const d = semente();
  gravar(d);
  return d;
}
let memoria = null;
function db() { return (memoria ||= ler()); }
function gravar(d = memoria) {
  memoria = d;
  try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch { /* segue só na memória */ }
}

function perfilAtual() {
  const d = db();
  const u = d.usuarios.find((x) => x.id === d.sessao);
  if (!u) return null;
  const { senha, ...perfil } = u;
  return perfil;
}
function exigirLogin() {
  const p = perfilAtual();
  if (!p) throw new Error('Faça login novamente');
  return p;
}
function souEquipe(p) { return ['equipe_cca', 'admin'].includes(p.papel); }
function possoVer(p, cli) {
  return cli.corretor_id === p.id || souEquipe(p) || (p.papel === 'gestor_imobiliaria' && cli.imobiliaria_id && cli.imobiliaria_id === p.imobiliaria_id);
}
function necessariosDe(cli) {
  return R.documentosNecessarios(TIPOS_DOCUMENTO, cli, db().documentos.filter((x) => x.cliente_id === cli.id));
}
function registrar(acao, cliente_id, detalhes = {}) {
  const p = perfilAtual();
  db().acessos.unshift({ id: id(), usuario_id: p?.id, usuario_nome: p?.nome, acao, cliente_id, detalhes, em: agora() });
  db().acessos = db().acessos.slice(0, 300);
}
function enfileirarMensagem(cli, tipo, texto) {
  const d = db();
  const corretor = d.usuarios.find((u) => u.id === cli.corretor_id);
  d.mensagens.unshift({ id: id(), cliente_id: cli.id, destino_id: corretor.id, telefone: corretor.whatsapp, tipo, texto, situacao: 'enviada', criada_em: agora() });
}

export const api = {
  demo: true,

  async sessao() { return perfilAtual(); },

  async entrar(email, senha) {
    await atraso();
    const d = db();
    const u = d.usuarios.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.senha === senha);
    if (!u) throw new Error('E-mail ou senha incorretos');
    d.sessao = u.id; gravar();
    return perfilAtual();
  },

  async sair() { db().sessao = null; gravar(); },

  async recuperarSenha() { await atraso(); },

  async configuracao() { return { tipos: TIPOS_DOCUMENTO, opcoes: OPCOES, status: R.STATUS }; },

  async listarClientes() {
    await atraso();
    const p = exigirLogin();
    const d = db();
    return d.clientes.filter((c) => possoVer(p, c)).map((c) => {
      const n = necessariosDe(c);
      const r = R.resumoDocumentos(n);
      const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
      const imob = d.imobiliarias.find((i) => i.id === c.imobiliaria_id);
      return {
        id: c.id, nome: c.nome, cpf: c.cpf, programa: c.programa, modalidade: c.modalidade, imovel: c.imovel,
        status: c.status, status_nome: R.nomeStatus(c.status), rascunho: c.rascunho,
        corretor_id: c.corretor_id, corretor_nome: corretor?.nome, imobiliaria_nome: imob?.nome || 'Autônomo',
        atualizado_em: c.atualizado_em, docs_pendentes: r.pendente, docs_recusados: r.recusado,
        docs_em_conferencia: r.em_conferencia, pode_ir_para_analise: R.podeIrParaAnalise(n),
      };
    }).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  },

  async obterCliente(clienteId) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const cliente = d.clientes.find((c) => c.id === clienteId);
    if (!cliente || !possoVer(p, cliente)) throw new Error('Cliente não encontrado');
    registrar('ver_cliente', clienteId);
    gravar();
    return {
      cliente: { ...cliente },
      necessarios: necessariosDe(cliente),
      historico: d.historico.filter((x) => x.cliente_id === clienteId),
      mensagens: d.mensagens.filter((m) => m.cliente_id === clienteId),
      corretor: d.usuarios.find((u) => u.id === cliente.corretor_id),
      imobiliaria: d.imobiliarias.find((i) => i.id === cliente.imobiliaria_id) || null,
    };
  },

  async buscarPorCpf(cpf) {
    const p = exigirLogin();
    return db().clientes.find((c) => c.corretor_id === p.id && R.soDigitos(c.cpf) === R.soDigitos(cpf)) || null;
  },

  async salvarCliente(dados) {
    await atraso(80);
    const p = exigirLogin();
    const d = db();
    const limpo = { ...dados, cpf: R.soDigitos(dados.cpf) };
    for (const k of Object.keys(limpo)) if (k.startsWith('_')) delete limpo[k];
    if (limpo.id) {
      const c = d.clientes.find((x) => x.id === limpo.id);
      if (!c || (c.corretor_id !== p.id && !souEquipe(p))) throw new Error('Sem permissão');
      const { status, corretor_id, ...resto } = limpo; // status só muda pela equipe
      Object.assign(c, resto, { atualizado_em: agora() });
      gravar();
      return { ...c };
    }
    if (d.clientes.some((x) => x.corretor_id === p.id && x.cpf === limpo.cpf)) throw new Error('Você já cadastrou um cliente com este CPF');
    const novo = { extras: {}, dependentes: 0, ...limpo, id: id(), corretor_id: p.id, imobiliaria_id: p.imobiliaria_id, status: 'cadastro_recebido', rascunho: true, criado_em: agora(), atualizado_em: agora() };
    d.clientes.push(novo);
    gravar();
    return { ...novo };
  },

  async enviarCadastro(clienteId) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || c.corretor_id !== p.id) throw new Error('Cliente não encontrado');
    if (!c.autorizacao_lgpd_em) throw new Error('Falta a confirmação de autorização do cliente (LGPD)');
    const n = necessariosDe(c);
    const primeiroEnvio = c.rascunho;
    c.rascunho = false;
    c.enviado_em ||= agora();
    if (primeiroEnvio) c.status = R.podeIrParaAnalise(n) ? 'cadastro_recebido' : 'documentacao_pendente';
    c.atualizado_em = agora();
    if (primeiroEnvio) enfileirarMensagem(c, 'confirmacao', R.msgCadastroRecebido({ corretor: p, cliente: c, necessarios: n }));
    gravar();
  },

  async enviarDocumento(clienteId, tipoCodigo, arquivo) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || (c.corretor_id !== p.id && !souEquipe(p))) throw new Error('Sem permissão');
    const anteriores = d.documentos.filter((x) => x.cliente_id === clienteId && x.tipo_codigo === tipoCodigo);
    const versao = anteriores.reduce((m, x) => Math.max(m, x.versao), 0) + 1;
    anteriores.forEach((x) => { if (x.situacao !== 'substituido') x.situacao = 'substituido'; });
    const novo = { id: id(), cliente_id: clienteId, tipo_codigo: tipoCodigo, versao, situacao: 'em_conferencia', nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, enviado_por: p.id, enviado_em: agora() };
    d.documentos.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    c.atualizado_em = agora();
    gravar();
    return novo;
  },

  async abrirDocumento(doc) {
    registrar('baixar_documento', doc.cliente_id, { documento: doc.id });
    gravar();
    if (arquivosNaMemoria.has(doc.id)) return arquivosNaMemoria.get(doc.id);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#EFE8DA"/><text x="50%" y="46%" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#26323A">Arquivo de exemplo</text><text x="50%" y="52%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#5A646B">${doc.nome_original || ''} · versão ${doc.versao}</text></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  },

  // ---------- Equipe ----------

  async mudarStatus(clienteId, status) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p)) throw new Error('Sem permissão');
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    const de = c.status;
    c.status = status; c.atualizado_em = agora();
    d.historico.push({ cliente_id: c.id, de, para: status, por: p.id, em: agora() });
    registrar('mudar_status', c.id, { de, para: status });
    const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
    enfileirarMensagem(c, 'status', R.msgStatus({ corretor, cliente: c, novoStatus: status }));
    gravar();
  },

  async conferirDocumento(documentoId, aceito, motivo, observacao) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p)) throw new Error('Sem permissão');
    if (!aceito && !motivo) throw new Error('Escolha o motivo da recusa');
    const d = db();
    const doc = d.documentos.find((x) => x.id === documentoId);
    if (!doc || doc.situacao !== 'em_conferencia') throw new Error('Documento não está em conferência');
    Object.assign(doc, { situacao: aceito ? 'aceito' : 'recusado', motivo_recusa: aceito ? null : motivo, observacao_recusa: aceito ? null : (observacao || null), conferido_por: p.id, conferido_em: agora() });
    const c = d.clientes.find((x) => x.id === doc.cliente_id);
    c.atualizado_em = agora();
    registrar('conferir_documento', c.id, { documento: doc.id, aceito, motivo });
    if (!aceito) {
      const tipo = TIPOS_DOCUMENTO.find((t) => t.codigo === doc.tipo_codigo);
      const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
      enfileirarMensagem(c, 'recusa', R.msgRecusa({ corretor, cliente: c, documentoNome: tipo.nome, motivo, observacao, regra: tipo.regra }));
    }
    gravar();
  },

  async listarDocsParaConferir() {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p)) return [];
    const d = db();
    return d.documentos.filter((x) => x.situacao === 'em_conferencia').map((doc) => {
      const c = d.clientes.find((x) => x.id === doc.cliente_id);
      const t = TIPOS_DOCUMENTO.find((x) => x.codigo === doc.tipo_codigo);
      return { documento: doc, cliente_id: c.id, cliente_nome: c.nome, tipo_nome: t?.nome, regra: t?.regra || '' };
    });
  },

  async listarMensagens() {
    const p = exigirLogin();
    const d = db();
    return d.mensagens.filter((m) => souEquipe(p) || m.destino_id === p.id).map((m) => ({
      ...m, cliente_nome: d.clientes.find((c) => c.id === m.cliente_id)?.nome, destino_nome: d.usuarios.find((u) => u.id === m.destino_id)?.nome,
    }));
  },

  async listarImobiliarias() {
    const d = db();
    return d.imobiliarias.map((i) => ({ ...i, corretores: d.usuarios.filter((u) => u.imobiliaria_id === i.id).length, clientes: d.clientes.filter((c) => c.imobiliaria_id === i.id).length }));
  },

  async listarCorretores() {
    const d = db();
    return d.usuarios.filter((u) => u.papel === 'corretor').map(({ senha, ...u }) => ({
      ...u, imobiliaria_nome: d.imobiliarias.find((i) => i.id === u.imobiliaria_id)?.nome || 'Autônomo', clientes: d.clientes.filter((c) => c.corretor_id === u.id).length,
    }));
  },

  async listarAcessos() { return db().acessos; },

  async reiniciarDemo() { memoria = semente(); gravar(); },
};
