// MODO DEMONSTRAÇÃO: mesma interface do api-supabase.js, com dados guardados no próprio aparelho.
import * as R from './regras.js';
import { tetoDoArquivo } from './tetos.js';
import { TIPOS_DOCUMENTO, OPCOES, PARAMETROS } from './dados-iniciais.js';

const CHAVE = 'appcca-demo-v5';
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
    { id: 'u-equipe', email: 'equipe@demo', senha: 'demo', nome: 'Ebenézer', whatsapp: null, papel: 'admin', imobiliaria_id: null, permissoes: {} },
    { id: 'u-doc', email: 'doc@demo', senha: 'demo', nome: 'Luciana Prado', whatsapp: '+5521900000005', papel: 'gestor_imobiliaria', imobiliaria_id: imob.id },
    { id: 'u-gabriel', email: 'gabriel@demo', senha: 'demo', nome: 'Gabriel', whatsapp: null, papel: 'equipe_cca', imobiliaria_id: null, permissoes: {} },
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
    { id: id(), cliente_id: mariana.id, destino_id: 'u-corretor', tipo: 'confirmacao', texto: 'Bom dia, João! Recebemos o cadastro de *Mariana Costa*.\n\n⚠️ Sem RG ou CNH, o processo não tem como ir para análise neste momento. Anexe pelo Portal do Corretor.\n— Andrade Almeida CCA', situacao: 'enviada', criada_em: agora() },
  ];
  // Vendedores: Rafael e Carlos compram da mesma construtora (documentos guardados uma vez só)
  const vendedores = [
    { id: 'v-pf-1', tipo: 'PF', cpf_cnpj: '98765432100', nome: 'Antônio Ferreira', estado_civil: 'Solteiro(a)', banco: '104 - Caixa Econômica Federal', agencia: '0182', operacao: '1288', conta: '12345', conta_digito: '6' },
    { id: 'v-pj-1', tipo: 'PJ', pj_tipo: 'Avulso', natureza_juridica: 'LTDA/Cia', cpf_cnpj: '11222333000181', nome: 'Construtora Exemplo Ltda', banco: '104 - Caixa Econômica Federal', agencia: '0182', operacao: '003', conta: '998', conta_digito: '7' },
  ];
  mariana.vendedor_id = 'v-pf-1';
  rafael.vendedor = 'Construtora / PJ'; rafael.empreendimento_caixa = false; rafael.vendedor_id = 'v-pj-1';
  carlos.vendedor = 'Construtora / PJ'; carlos.empreendimento_caixa = false; carlos.vendedor_id = 'v-pj-1';
  for (const x of clientes) x.modalidade = 'Aquisição de Imóvel';
  juliana.vendedor_id = null;
  const dv = (vid, tipo, situacao, por) => ({ id: id(), vendedor_id: vid, tipo_codigo: tipo, versao: 1, situacao, nome_original: `${tipo.toLowerCase()}.pdf`, enviado_por: por, enviado_em: agora() });
  const documentos_vendedor = [
    dv('v-pf-1', 'VEND_PF_IDENTIDADE', 'aceito', 'u-corretor'),
    ...['VEND_PJ_CONTRATO_SOCIAL', 'VEND_PJ_ALTERACOES', 'VEND_PJ_DOCS_SOCIOS'].map((t) => dv('v-pj-1', t, 'aceito', 'u-corretora')),
  ];
  return { imobiliarias: [imob], usuarios, clientes, participantes: [], documentos, historico, mensagens, acessos: [], vendedores, documentos_vendedor, sessao: null };
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
const CAMPOS_IMOB = ['nome', 'cnpj', 'whatsapp', 'razao_social', 'nome_fantasia', 'situacao_cadastral', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'telefone', 'email', 'cnpj_consultado_em'];
function linhaImobiliaria(campos) {
  const linha = {};
  for (const k of CAMPOS_IMOB) {
    if (campos[k] === undefined) continue;
    let v = typeof campos[k] === 'string' ? campos[k].trim() : campos[k];
    if (k === 'cnpj' || k === 'cep' || k === 'telefone') v = R.soDigitos(v || '');
    if (k === 'whatsapp') v = v ? R.celularInternacional(v) : null;
    if (k === 'uf') v = String(v || '').toUpperCase();
    linha[k] = v === '' ? null : v;
  }
  return linha;
}
function possoEditar(p, cli) {
  return cli.corretor_id === p.id || souEquipe(p) || (p.papel === 'gestor_imobiliaria' && cli.imobiliaria_id && cli.imobiliaria_id === p.imobiliaria_id);
}
function participantesDe(cli) {
  return (db().participantes ||= []).filter((p) => p.cliente_id === cli.id).sort((a, b) => a.ordem - b.ordem);
}
function vendedorDe(cli) {
  return cli.vendedor_id ? (db().vendedores ||= []).find((v) => v.id === cli.vendedor_id) || null : null;
}
// Situação dos documentos do vendedor; o corretor não recebe o arquivo nem o nome de arquivos de outros
function documentosVendedorDe(cli, p = perfilAtual()) {
  const v = vendedorDe(cli);
  if (!v) return [];
  const atuais = {};
  for (const d of (db().documentos_vendedor ||= []).filter((x) => x.vendedor_id === v.id && x.situacao !== 'substituido')) {
    if (!atuais[d.tipo_codigo] || atuais[d.tipo_codigo].versao < d.versao) atuais[d.tipo_codigo] = d;
  }
  return Object.values(atuais).map((d) => ({ ...d, nome_original: p && (souEquipe(p) || d.enviado_por === p.id) ? d.nome_original : null, arquivo_path: p && (souEquipe(p) || d.enviado_por === p.id) ? `vendedores/${d.id}` : null }));
}
function necessariosDe(cli) {
  return R.documentosNecessarios(TIPOS_DOCUMENTO, cli, db().documentos.filter((x) => x.cliente_id === cli.id), participantesDe(cli),
    { vendedor: vendedorDe(cli), documentosVendedor: documentosVendedorDe(cli) });
}
function buscarVendedorPorDoc(doc) {
  const v = (db().vendedores ||= []).find((x) => x.cpf_cnpj === R.soDigitos(doc));
  if (!v) return null;
  const naCca = new Set((db().documentos_vendedor || []).filter((d) => d.vendedor_id === v.id && ['em_conferencia', 'aceito'].includes(d.situacao)).map((d) => d.tipo_codigo));
  return { ...v, documentos_na_cca: naCca.size };
}
function registrar(acao, cliente_id, detalhes = {}) {
  const p = perfilAtual();
  db().acessos.unshift({ id: id(), usuario_id: p?.id, usuario_nome: p?.nome, acao, cliente_id, detalhes, em: agora() });
  db().acessos = db().acessos.slice(0, 300);
}
function enfileirarMensagem(cli, tipo, texto) {
  const d = db();
  const corretor = d.usuarios.find((u) => u.id === cli.corretor_id);
  const imob = cli.imobiliaria_id ? d.imobiliarias.find((i) => i.id === cli.imobiliaria_id) : null;
  const modo = imob?.avisos_para || 'corretor';
  const canal = (d.parametros || []).find((x) => x.chave === 'canal_avisos')?.valor || 'push';
  const base = { cliente_id: cli.id, tipo, situacao: 'enviada', canal, criada_em: agora() };
  if (!imob || modo !== 'imobiliaria') d.mensagens.unshift({ ...base, id: id(), destino_id: corretor.id, telefone: corretor.whatsapp, texto });
  if (imob && modo !== 'corretor') d.mensagens.unshift({ ...base, id: id(), destino_id: null, telefone: imob.whatsapp, texto: `[${imob.nome}] ${texto}` });
}

export const api = {
  demo: true,

  async sessao() { return perfilAtual(); },

  async entrar(email, senha) {
    await atraso();
    const d = db();
    const u = d.usuarios.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.senha && x.senha === senha);
    if (!u) throw new Error('E-mail ou senha incorretos');
    if (u.ativo === false) throw new Error('Seu acesso está desativado. Fale com a CCA.');
    d.sessao = u.id;
    registrar('login', null, {});
    gravar();
    return perfilAtual();
  },

  async sair() { db().sessao = null; gravar(); },

  // Link de convite / novo acesso (na demonstração, o "token" é o próprio id do usuário)
  async entrarComLink(token) {
    await atraso();
    const d = db();
    const u = d.usuarios.find((x) => x.id === token && x.link_pendente);
    if (!u) throw new Error('Este link expirou ou já foi usado. Peça um novo link à CCA.');
    u.link_pendente = false;
    d.sessao = u.id; gravar();
    return perfilAtual();
  },

  async definirSenha(senha) {
    const p = exigirLogin();
    db().usuarios.find((x) => x.id === p.id).senha = senha;
    registrar('login', null, {});
    gravar();
  },

  async convidar(dados) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const email = String(dados.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido');
    let u = d.usuarios.find((x) => x.email.toLowerCase() === email);
    if (dados.acao === 'novo_link') {
      if (!u) throw new Error('Não há usuário com este e-mail');
      if (['equipe_cca', 'admin'].includes(u.papel) && p.papel !== 'admin') throw new Error('Somente ADM gera link para a equipe');
    } else {
      const papel = dados.papel || 'corretor';
      if (['equipe_cca', 'admin'].includes(papel) && p.papel !== 'admin') throw new Error('Somente ADM convida pessoas da equipe');
      if (String(dados.nome || '').trim().split(/\s+/).length < 2) throw new Error('Digite o nome completo');
      if (!u) { u = { id: id(), email, senha: null }; d.usuarios.push(u); }
      Object.assign(u, { nome: dados.nome.trim(), whatsapp: dados.whatsapp ? R.celularInternacional(dados.whatsapp) : null, papel,
        imobiliaria_id: ['equipe_cca', 'admin'].includes(papel) ? null : (dados.imobiliaria_id || null), ativo: true, permissoes: u.permissoes || {} });
    }
    u.link_pendente = true;
    registrar(dados.acao === 'novo_link' ? 'novo_link' : 'convidar', null, { email, papel: u.papel });
    gravar();
    return { link: `${location.origin}${location.pathname}?demo#/acesso?token_hash=${u.id}&tipo=${u.senha ? 'recovery' : 'invite'}`, usuario_id: u.id };
  },

  async novoLink(email) { return this.convidar({ acao: 'novo_link', email }); },

  async corretoresDaImobiliaria() {
    const p = exigirLogin();
    return db().usuarios.filter((u) => u.imobiliaria_id && u.imobiliaria_id === p.imobiliaria_id && u.ativo !== false && ['corretor', 'gestor_imobiliaria'].includes(u.papel))
      .map((u) => ({ id: u.id, nome: u.nome, papel: u.papel }));
  },

  async inscreverPush() { const p = exigirLogin(); db().usuarios.find((u) => u.id === p.id).push = true; gravar(); },

  async aceitarWhatsapp(aceita) { const p = exigirLogin(); db().usuarios.find((u) => u.id === p.id).aceita_whatsapp = !!aceita; gravar(); },

  async avisosAdmin(acao) {
    await atraso();
    if (acao === 'testar') return { ok: true, detalhe: 'Demonstração: nada é enviado de verdade.' };
    if (acao === 'criar_modelos' || acao === 'modelos') throw new Error('Demonstração: configure o WhatsApp no app real.');
    return {};
  },

  async integracoes() { return (db().integracoes ||= [['meta_phone_id'], ['meta_waba_id'], ['meta_token']].map(([chave]) => ({ chave, configurado: false, final: null }))); },

  async salvarIntegracao(chave, valor) {
    const lista = await this.integracoes();
    const i = lista.find((x) => x.chave === chave);
    Object.assign(i, { configurado: !!valor, final: chave === 'meta_token' ? (valor ? `…${valor.slice(-4)}` : null) : (valor || null), atualizado_em: agora() });
    gravar();
  },

  async atualizarImobiliaria(idImob, campos) {
    const i = db().imobiliarias.find((x) => x.id === idImob);
    Object.assign(i, linhaImobiliaria(campos));
    if (campos.avisos_para) i.avisos_para = campos.avisos_para;
    gravar(); return { ...i };
  },

  // Demonstração: não consulta a Receita; devolve dados de exemplo
  async buscarCnpj(cnpj) {
    await atraso();
    if (!R.cnpjValido(cnpj)) throw new Error('CNPJ inválido.');
    return { cnpj: R.soDigitos(cnpj), razao_social: 'IMOBILIARIA EXEMPLO LTDA', nome_fantasia: 'Imobiliária Exemplo', situacao_cadastral: 'ATIVA',
      cep: '24020005', logradouro: 'RUA DA CONCEICAO', numero: '100', complemento: 'SALA 501', bairro: 'CENTRO', municipio: 'NITEROI', uf: 'RJ',
      telefone: '2126200000', email: 'contato@imobiliariaexemplo.com.br' };
  },

  async atualizarCorretor(idUsuario, { nome, whatsapp, imobiliaria_id }) {
    const p = exigirLogin();
    if (!souEquipe(p)) throw new Error('Sem permissão');
    const u = db().usuarios.find((x) => x.id === idUsuario);
    Object.assign(u, { nome, whatsapp: whatsapp ? R.celularInternacional(whatsapp) : null, imobiliaria_id: imobiliaria_id || null });
    gravar();
  },

  async ativarUsuario(idUsuario, ativo) {
    const p = exigirLogin();
    const u = db().usuarios.find((x) => x.id === idUsuario);
    if (['equipe_cca', 'admin'].includes(u.papel) && p.papel !== 'admin') throw new Error('Somente administradores');
    if (idUsuario === p.id) throw new Error('Você não pode desativar o seu próprio acesso');
    u.ativo = ativo;
    registrar(ativo ? 'ativar_usuario' : 'desativar_usuario', null, { usuario: idUsuario });
    gravar();
  },

  async criarImobiliaria(campos) {
    exigirLogin();
    if (!String(campos.nome || '').trim()) throw new Error('Informe o nome da imobiliária');
    if (!R.cnpjValido(campos.cnpj || '')) throw new Error('CNPJ obrigatório e válido');
    const i = { id: id(), ...linhaImobiliaria(campos), ativo: true };
    db().imobiliarias.push(i); gravar();
    return i;
  },

  async listarVendedores() {
    const d = db();
    return (d.vendedores || []).map((v) => {
      const docs = (d.documentos_vendedor || []).filter((x) => x.vendedor_id === v.id);
      return { ...v, processos: d.clientes.filter((c) => c.vendedor_id === v.id).length,
        docs_aceitos: docs.filter((x) => x.situacao === 'aceito').length, docs_conferencia: docs.filter((x) => x.situacao === 'em_conferencia').length,
        docs_recusados: docs.filter((x) => x.situacao === 'recusado').length };
    });
  },

  async obterVendedor(idVend) {
    const d = db();
    const v = (d.vendedores || []).find((x) => x.id === idVend);
    return { vendedor: { ...v },
      documentos: (d.documentos_vendedor || []).filter((x) => x.vendedor_id === idVend && x.situacao !== 'substituido').map((x) => ({ ...x, do_vendedor: true, arquivo_path: `vendedores/${x.id}` })),
      clientes: d.clientes.filter((c) => c.vendedor_id === idVend).map((c) => ({ id: c.id, nome: c.nome, cpf: c.cpf, status: c.status, corretor: { nome: d.usuarios.find((u) => u.id === c.corretor_id)?.nome } })) };
  },

  async salvarVendedor(idVend, campos) {
    const v = (db().vendedores || []).find((x) => x.id === idVend);
    Object.assign(v, campos, { atualizado_em: agora() }); gravar();
    return { ...v };
  },

  async recuperarSenha() { await atraso(); },

  async configuracao() {
    const parametros = { ...PARAMETROS };
    for (const x of db().parametros || []) parametros[x.chave] = isNaN(Number(x.valor)) ? x.valor : Number(x.valor);
    return { tipos: TIPOS_DOCUMENTO, opcoes: OPCOES, status: R.STATUS, parametros };
  },

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
      participantes: participantesDe(cliente).map((p) => ({ ...p })),
      vendedor: vendedorDe(cliente) ? { ...vendedorDe(cliente) } : null,
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
      if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
      const { status, corretor_id, vendedor_id, ...resto } = limpo; // status só muda pela equipe; vendedor pela vinculação
      if (p.papel === 'gestor_imobiliaria' && dados._corretor_responsavel) resto.corretor_id = dados._corretor_responsavel;
      Object.assign(c, resto, { atualizado_em: agora() });
      gravar();
      return { ...c };
    }
    if (d.clientes.some((x) => x.corretor_id === p.id && x.cpf === limpo.cpf)) throw new Error('Você já cadastrou um cliente com este CPF');
    const resp = p.papel === 'gestor_imobiliaria' && dados._corretor_responsavel
      ? d.usuarios.find((u) => u.id === dados._corretor_responsavel && u.imobiliaria_id === p.imobiliaria_id) : null;
    const novo = { extras: {}, dependentes: 0, ...limpo, id: id(), corretor_id: resp ? resp.id : p.id, imobiliaria_id: p.imobiliaria_id, status: 'cadastro_recebido', rascunho: true, criado_em: agora(), atualizado_em: agora() };
    d.clientes.push(novo);
    gravar();
    return { ...novo };
  },

  async salvarParticipantes(clienteId, lista) {
    await atraso(60);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    d.participantes = (d.participantes || []).filter((x) => x.cliente_id !== clienteId);
    const gravados = lista.map((x) => ({ ...x, id: x.id || id(), cliente_id: clienteId, cpf: R.soDigitos(x.cpf) }));
    d.participantes.push(...gravados);
    gravar();
    return gravados.map((x) => ({ ...x }));
  },

  async enviarCadastro(clienteId) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Cliente não encontrado');
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

  async enviarDocumento(clienteId, tipoCodigo, arquivo, participanteId = null, dependenteOrdem = null) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    const doTipo = d.documentos.filter((x) => x.cliente_id === clienteId && x.tipo_codigo === tipoCodigo);
    const anteriores = doTipo.filter((x) => (x.participante_id ?? null) === participanteId && (x.dependente_ordem ?? null) === dependenteOrdem);
    const versao = doTipo.reduce((m, x) => Math.max(m, x.versao), 0) + 1;
    const multiplo = TIPOS_DOCUMENTO.find((t) => t.codigo === tipoCodigo)?.multiplo;
    if (!multiplo) anteriores.forEach((x) => { if (x.situacao !== 'substituido') x.situacao = 'substituido'; });
    const novo = { id: id(), cliente_id: clienteId, participante_id: participanteId, dependente_ordem: dependenteOrdem, versao_pessoa: multiplo ? 1 : anteriores.length + 1, tipo_codigo: tipoCodigo, versao, situacao: 'em_conferencia', nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, enviado_por: p.id, enviado_em: agora() };
    d.documentos.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    c.atualizado_em = agora();
    gravar();
    return novo;
  },

  async buscarVendedor(doc) { await atraso(); exigirLogin(); return buscarVendedorPorDoc(doc); },

  async vincularVendedor(clienteId, dados) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    const doc = R.soDigitos(dados.cpf_cnpj);
    if (![11, 14].includes(doc.length)) throw new Error('CPF ou CNPJ do vendedor inválido');
    if (!String(dados.nome || '').trim()) throw new Error('Informe o nome do vendedor');
    let v = (d.vendedores ||= []).find((x) => x.cpf_cnpj === doc);
    if (!v) { v = { id: id(), tipo: doc.length === 11 ? 'PF' : 'PJ', cpf_cnpj: doc, criado_por: p.id, criado_em: agora() }; d.vendedores.push(v); }
    v.nome = dados.nome.trim();
    for (const k of ['pj_tipo', 'empreendimento', 'construtora_cnpj', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'estado_civil', 'conjuge_nome', 'conjuge_cpf', 'regime_bens', 'natureza_juridica', 'telefone', 'email']) {
      const val = ['construtora_cnpj', 'conjuge_cpf'].includes(k) ? R.soDigitos(dados[k] || '') : String(dados[k] ?? '').trim();
      if (val) v[k] = val;
    }
    if (String(dados.conta ?? '').trim()) v.conta_digito = String(dados.conta_digito ?? '').trim() || null;
    if (v.estado_civil !== 'Casado(a)') { v.conjuge_nome = null; v.conjuge_cpf = null; }
    if (typeof dados.teve_alteracao_contratual === 'boolean') v.teve_alteracao_contratual = dados.teve_alteracao_contratual;
    c.vendedor_id = v.id;
    gravar();
    return buscarVendedorPorDoc(doc);
  },

  async enviarDocumentoVendedor(clienteId, vendedorId, tipoCodigo, arquivo) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    if (!c.vendedor_id) throw new Error('Salve os dados do vendedor antes de anexar os documentos dele.');
    const lista = (d.documentos_vendedor ||= []);
    const anteriores = lista.filter((x) => x.vendedor_id === c.vendedor_id && x.tipo_codigo === tipoCodigo);
    anteriores.forEach((x) => { if (x.situacao !== 'substituido') x.situacao = 'substituido'; });
    const novo = { id: id(), vendedor_id: c.vendedor_id, tipo_codigo: tipoCodigo, versao: anteriores.reduce((m, x) => Math.max(m, x.versao), 0) + 1,
      situacao: 'em_conferencia', nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, cliente_id: clienteId, enviado_por: p.id, enviado_em: agora() };
    lista.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    c.atualizado_em = agora();
    gravar();
    return novo.id;
  },

  async bancos() {
    const d = await (await fetch('data/bancos.json')).json();
    const rot = Object.fromEntries(d.bancos.map(([c, n]) => [c, `${c} - ${n}`]));
    return { principais: d.principais.map((c) => rot[c]).filter(Boolean), todos: d.bancos.map(([c]) => rot[c]) };
  },

  async tetoMunicipio(uf, nome) {
    return tetoDoArquivo(uf, nome);
  },

  async municipios(uf) {
    if (!uf) return [];
    const dados = await (await fetch('data/municipios.json')).json();
    return (dados[uf] || []).map((m) => m[1]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  async abrirDocumento(doc) {
    if (doc.do_vendedor && !doc.arquivo_path) throw new Error('Documento enviado por outro corretor: só a equipe da CCA abre o arquivo.');
    registrar('baixar_documento', doc.cliente_id, { documento: doc.id });
    gravar();
    if (arquivosNaMemoria.has(doc.id)) return arquivosNaMemoria.get(doc.id);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#EFE8DA"/><text x="50%" y="46%" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#26323A">Arquivo de exemplo</text><text x="50%" y="52%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#5A646B">${doc.nome_original || ''} · versão ${doc.versao}</text></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  },

  // ---------- Equipe ----------

  async mudarStatus(clienteId, status, mensagem = null) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p) || !R.pode(p, 'mudar_status')) throw new Error('Sem permissão para mudar status');
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    const de = c.status;
    c.status = status; c.atualizado_em = agora();
    d.historico.push({ cliente_id: c.id, de, para: status, por: p.id, em: agora() });
    registrar('mudar_status', c.id, { de, para: status });
    const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
    enfileirarMensagem(c, 'status', mensagem || R.msgStatus({ corretor, cliente: c, novoStatus: status }));
    gravar();
  },

  async conferirDocumento(documentoId, aceito, motivo, observacao, doVendedor = false) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p) || !R.pode(p, 'conferir_documentos')) throw new Error('Sem permissão para conferir documentos');
    if (!aceito && !motivo) throw new Error('Escolha o motivo da recusa');
    const d = db();
    const doc = (doVendedor ? (d.documentos_vendedor || []) : d.documentos).find((x) => x.id === documentoId);
    if (!doc || doc.situacao !== 'em_conferencia') throw new Error('Documento não está em conferência');
    Object.assign(doc, { situacao: aceito ? 'aceito' : 'recusado', motivo_recusa: aceito ? null : motivo, observacao_recusa: aceito ? null : (observacao || null), conferido_por: p.id, conferido_em: agora() });
    const c = d.clientes.find((x) => x.id === doc.cliente_id);
    if (!c) { gravar(); return; }
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
      const pe = doc.participante_id ? (d.participantes || []).find((x) => x.id === doc.participante_id) : null;
      return { documento: doc, cliente_id: c.id, cliente_nome: c.nome, tipo_nome: pe ? `${t?.nome} – ${R.primeiroNome(pe.nome)}` : t?.nome, regra: t?.regra || '' };
    }).concat((d.documentos_vendedor || []).filter((x) => x.situacao === 'em_conferencia').map((doc) => {
      const c = d.clientes.find((x) => x.id === doc.cliente_id);
      const v = (d.vendedores || []).find((x) => x.id === doc.vendedor_id);
      const t = TIPOS_DOCUMENTO.find((x) => x.codigo === doc.tipo_codigo);
      return { documento: { ...doc, do_vendedor: true }, cliente_id: c?.id, cliente_nome: c?.nome || '—', tipo_nome: `${t?.nome} – vendedor ${v?.nome || ''}`, regra: t?.regra || '' };
    }));
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
    return d.usuarios.filter((u) => ['corretor', 'gestor_imobiliaria'].includes(u.papel)).map(({ senha, ...u }) => ({
      ...u, ativo: u.ativo !== false, imobiliaria_nome: d.imobiliarias.find((i) => i.id === u.imobiliaria_id)?.nome || 'Autônomo', clientes: d.clientes.filter((c) => c.corretor_id === u.id).length,
    }));
  },

  async listarAcessos() {
    const d = db();
    return d.acessos.map((a) => {
      const u = d.usuarios.find((x) => x.id === a.usuario_id);
      const imob = u?.imobiliaria_id ? d.imobiliarias.find((i) => i.id === u.imobiliaria_id) : null;
      return { ...a, usuario_nome: u?.nome || a.usuario_nome, usuario_papel: u?.papel,
        imobiliaria_nome: ['equipe_cca', 'admin'].includes(u?.papel) ? 'Equipe CCA' : (imob?.nome || 'Autônomo'),
        cliente_nome: d.clientes.find((c) => c.id === a.cliente_id)?.nome || null };
    });
  },

  async listarEquipe() {
    return db().usuarios.filter((u) => ['equipe_cca', 'admin'].includes(u.papel)).map(({ senha, ...u }) => ({ ...u, ativo: u.ativo !== false, permissoes: u.permissoes || {} }));
  },

  async atualizarUsuario(idUsuario, { papel, ativo, permissoes }) {
    const p = exigirLogin();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    if (idUsuario === p.id && (papel !== 'admin' || !ativo)) throw new Error('Você não pode tirar o seu próprio acesso de administrador');
    const u = db().usuarios.find((x) => x.id === idUsuario);
    Object.assign(u, { papel, ativo, permissoes: permissoes || {} });
    registrar('alterar_usuario', null, { usuario: idUsuario, papel, ativo });
    gravar();
  },

  async listarParametros() {
    const d = db();
    d.parametros ||= Object.entries(PARAMETROS).map(([chave, valor]) => ({ chave, valor: String(valor), descricao: null }));
    return d.parametros;
  },

  async salvarParametro(chave, valor) {
    const p = exigirLogin();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    const lista = await this.listarParametros();
    const item = lista.find((x) => x.chave === chave);
    if (!item) throw new Error('Parâmetro não encontrado');
    item.valor = String(valor);
    registrar('alterar_parametro', null, { chave, valor });
    gravar();
  },

  async reiniciarDemo() { memoria = semente(); gravar(); },
};
