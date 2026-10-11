// Conexão real com o Supabase (login, banco e arquivos).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as R from './regras.js';

const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

let cacheConfig = null;
let cachePerfil = null;

function ok({ data, error }) {
  if (error) throw new Error(traduzirErro(error.message));
  return data;
}

function traduzirErro(m = '') {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos';
  if (/duplicate key.*cpf/i.test(m)) return 'Você já cadastrou um cliente com este CPF';
  if (/JWT|session/i.test(m)) return 'Sua sessão expirou. Faça login novamente';
  if (/row-level security|permission denied/i.test(m)) return 'O app não tem permissão para esta ação. Avise a CCA para verificarmos.';
  return m;
}

function nomeSeguro(nome) {
  return String(nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
}

export const api = {
  demo: false,

  async sessao() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { cachePerfil = null; return null; }
    if (cachePerfil?.id === data.session.user.id) return cachePerfil;
    cachePerfil = ok(await sb.from('perfis').select('*').eq('id', data.session.user.id).single());
    if (!cachePerfil.ativo) { await sb.auth.signOut(); throw new Error('Seu acesso está desativado. Fale com a CCA.'); }
    return cachePerfil;
  },

  async entrar(email, senha) {
    ok(await sb.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password: senha }));
    cachePerfil = null;
    return this.sessao();
  },

  async sair() { cachePerfil = null; await sb.auth.signOut(); },

  async recuperarSenha(email) {
    ok(await sb.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo: location.origin + location.pathname }));
  },

  async configuracao() {
    if (cacheConfig) return cacheConfig;
    const [tipos, opcoes, status, params] = await Promise.all([
      sb.from('tipos_documento').select('*').eq('ativo', true).order('ordem'),
      sb.from('opcoes_cadastro').select('*').eq('ativo', true).order('ordem'),
      sb.from('status_etapas').select('*').eq('ativo', true).order('ordem'),
      sb.from('parametros').select('*'),
    ]);
    const parametros = { ...R.PARAMETROS_PADRAO };
    for (const x of params.data || []) parametros[x.chave] = isNaN(Number(x.valor)) ? x.valor : Number(x.valor);
    const op = {};
    for (const o of ok(opcoes)) (op[o.campo] ||= []).push(o.valor);
    cacheConfig = { tipos: ok(tipos), opcoes: op, status: ok(status), parametros };
    return cacheConfig;
  },

  async listarClientes() {
    return ok(await sb.from('clientes_resumo').select('*').order('atualizado_em', { ascending: false }));
  },

  async obterCliente(id) {
    const [{ tipos }, cli, docs, hist, msgs, parts] = await Promise.all([
      this.configuracao(),
      sb.from('clientes').select('*, corretor:perfis!clientes_corretor_id_fkey(id, nome, whatsapp), imobiliaria:imobiliarias(id, nome)').eq('id', id).single(),
      sb.from('documentos').select('*').eq('cliente_id', id),
      sb.from('historico_status').select('*').eq('cliente_id', id).order('em'),
      sb.from('mensagens').select('*').eq('cliente_id', id).order('criada_em', { ascending: false }),
      sb.from('participantes').select('*').eq('cliente_id', id).order('ordem'),
    ]);
    const c = ok(cli);
    sb.rpc('registrar_acesso', { p_acao: 'ver_cliente', p_cliente: id }).then(() => {});
    const { corretor, imobiliaria, ...cliente } = c;
    return {
      cliente,
      participantes: ok(parts),
      necessarios: R.documentosNecessarios(tipos, cliente, ok(docs), ok(parts)),
      historico: ok(hist),
      mensagens: msgs.error ? [] : msgs.data,
      corretor,
      imobiliaria,
    };
  },

  async buscarPorCpf(cpf) {
    const p = await this.sessao();
    const { data } = await sb.from('clientes').select('*').eq('corretor_id', p.id).eq('cpf', R.soDigitos(cpf)).maybeSingle();
    return data || null;
  },

  async salvarCliente(dados) {
    const { id, status, corretor_id, imobiliaria_id, criado_em, atualizado_em, rascunho, enviado_em, pasta_drive_id, ...campos } = dados;
    campos.cpf = R.soDigitos(campos.cpf);
    for (const k of Object.keys(campos)) if (k.startsWith('_')) delete campos[k];
    if (id) return ok(await sb.from('clientes').update(campos).eq('id', id).select().single());
    const p = await this.sessao();
    return ok(await sb.from('clientes').insert({ ...campos, corretor_id: p.id }).select().single());
  },

  async salvarParticipantes(clienteId, lista) {
    const atuais = ok(await sb.from('participantes').select('id').eq('cliente_id', clienteId));
    const manter = new Set(lista.filter((p) => p.id).map((p) => p.id));
    const remover = atuais.filter((p) => !manter.has(p.id)).map((p) => p.id);
    if (remover.length) ok(await sb.from('participantes').delete().in('id', remover));
    const campos = ['ordem', 'papel', 'conjuge_do_titular', 'nome', 'cpf', 'data_nascimento', 'celular', 'email', 'estado_civil', 'pis',
      'tipo_renda', 'renda_bruta', 'renda_formal', 'renda_informal', 'renda_considerada', 'declara_ir', 'ir_retificado', 'extras'];
    const linhas = lista.map((p) => {
      const l = { cliente_id: clienteId };
      for (const c of campos) if (p[c] !== undefined) l[c] = c === 'cpf' ? R.soDigitos(p[c]) : (p[c] === '' ? null : p[c]);
      if (p.id) l.id = p.id;
      return l;
    });
    if (!linhas.length) return [];
    return ok(await sb.from('participantes').upsert(linhas).select('*').order('ordem'));
  },

  async enviarCadastro(id) { ok(await sb.rpc('enviar_cadastro', { p_cliente: id })); },

  async enviarDocumento(clienteId, tipoCodigo, arquivo, participanteId = null, dependenteOrdem = null) {
    const caminho = `${clienteId}/${tipoCodigo}/${dependenteOrdem ? `dependente${dependenteOrdem}` : (participanteId || 'titular')}-${Date.now()}-${nomeSeguro(arquivo.name)}`;
    ok(await sb.storage.from('documentos').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    return ok(await sb.from('documentos').insert({
      cliente_id: clienteId, participante_id: participanteId, dependente_ordem: dependenteOrdem, tipo_codigo: tipoCodigo, arquivo_path: caminho,
      nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size,
    }).select().single());
  },

  async abrirDocumento(doc, { baixar = false } = {}) {
    sb.rpc('registrar_acesso', { p_acao: baixar ? 'baixar_documento' : 'ver_documento', p_cliente: doc.cliente_id, p_detalhes: { documento: doc.id } }).then(() => {});
    const r = ok(await sb.storage.from('documentos').createSignedUrl(doc.arquivo_path, 300, baixar ? { download: doc.nome_original || true } : undefined));
    return r.signedUrl;
  },

  async mudarStatus(id, status) { ok(await sb.rpc('mudar_status', { p_cliente: id, p_status: status })); },

  async conferirDocumento(docId, aceito, motivo, observacao) {
    ok(await sb.rpc('conferir_documento', { p_documento: docId, p_aceito: aceito, p_motivo: motivo || null, p_observacao: observacao || null }));
  },

  async listarDocsParaConferir() {
    const { tipos } = await this.configuracao();
    const docs = ok(await sb.from('documentos').select('*, cliente:clientes(id, nome), participante:participantes(nome)').eq('situacao', 'em_conferencia').order('enviado_em'));
    return docs.map(({ cliente, participante, ...documento }) => {
      const t = tipos.find((x) => x.codigo === documento.tipo_codigo);
      return { documento, cliente_id: cliente.id, cliente_nome: cliente.nome, tipo_nome: participante ? `${t?.nome} – ${R.primeiroNome(participante.nome)}` : t?.nome, regra: t?.regra || '' };
    });
  },

  async listarMensagens() {
    const msgs = ok(await sb.from('mensagens').select('*, cliente:clientes(nome), destino:perfis(nome)').order('criada_em', { ascending: false }).limit(200));
    return msgs.map((m) => ({ ...m, cliente_nome: m.cliente?.nome, destino_nome: m.destino?.nome }));
  },

  async listarImobiliarias() {
    return ok(await sb.from('imobiliarias').select('*').order('nome'));
  },

  async listarCorretores() {
    const ps = ok(await sb.from('perfis').select('*, imobiliaria:imobiliarias(nome)').eq('papel', 'corretor').order('nome'));
    return ps.map((p) => ({ ...p, imobiliaria_nome: p.imobiliaria?.nome || 'Autônomo' }));
  },

  async listarAcessos() {
    const a = ok(await sb.from('acessos_log').select('*').order('em', { ascending: false }).limit(300));
    return a;
  },
};
