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

// Lista de municípios publicada com o app (reserva, caso a tabela não responda)
let cacheMunicipios = null;
export async function municipiosDoArquivo(uf) {
  cacheMunicipios ||= await (await fetch('data/municipios.json')).json();
  return (cacheMunicipios[uf] || []).map((m) => m[1]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}


// Bancos: "104 - Caixa Econômica Federal"
let cacheBancos = null;
export async function bancosDoArquivo() {
  if (cacheBancos) return cacheBancos;
  const d = await (await fetch('data/bancos.json')).json();
  const rot = Object.fromEntries(d.bancos.map(([c, n]) => [c, `${c} - ${n}`]));
  cacheBancos = { principais: d.principais.map((c) => rot[c]).filter(Boolean), todos: d.bancos.map(([c]) => rot[c]) };
  return cacheBancos;
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
    const perfil = await this.sessao();
    sb.rpc('registrar_login').then(() => {});
    return perfil;
  },

  async sair() { cachePerfil = null; await sb.auth.signOut(); },

  // Link de convite / novo acesso (gerado pela equipe e enviado por WhatsApp)
  async entrarComLink(tokenHash, tipo) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo === 'recovery' ? 'recovery' : 'invite' });
    if (error) throw new Error('Este link expirou ou já foi usado. Peça um novo link à CCA.');
    cachePerfil = null;
    return this.sessao();
  },

  async definirSenha(senha) {
    ok(await sb.auth.updateUser({ password: senha }));
    sb.rpc('registrar_login').then(() => {});
  },

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
    const [{ tipos }, cli, docs, hist, msgs, parts, docsVend] = await Promise.all([
      this.configuracao(),
      sb.from('clientes').select('*, corretor:perfis!clientes_corretor_id_fkey(id, nome, whatsapp), imobiliaria:imobiliarias(id, nome)').eq('id', id).single(),
      sb.from('documentos').select('*').eq('cliente_id', id),
      sb.from('historico_status').select('*').eq('cliente_id', id).order('em'),
      sb.from('mensagens').select('*').eq('cliente_id', id).order('criada_em', { ascending: false }),
      sb.from('participantes').select('*').eq('cliente_id', id).order('ordem'),
      sb.rpc('documentos_do_vendedor', { p_cliente: id }),
    ]);
    const c = ok(cli);
    const vendedor = c.vendedor_id ? (await sb.from('vendedores').select('*').eq('id', c.vendedor_id).maybeSingle()).data : null;
    const documentosVendedor = docsVend.error ? [] : docsVend.data;
    sb.rpc('registrar_acesso', { p_acao: 'ver_cliente', p_cliente: id }).then(() => {});
    const { corretor, imobiliaria, ...cliente } = c;
    return {
      cliente,
      participantes: ok(parts),
      vendedor,
      necessarios: R.documentosNecessarios(tipos, cliente, ok(docs), ok(parts), { vendedor, documentosVendedor }),
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
    const { id, status, corretor_id, imobiliaria_id, criado_em, atualizado_em, rascunho, enviado_em, pasta_drive_id, vendedor_id, ...campos } = dados; // vendedor só muda pela função vincular_vendedor
    campos.cpf = R.soDigitos(campos.cpf);
    for (const k of Object.keys(campos)) if (k.startsWith('_')) delete campos[k];
    const p = await this.sessao();
    // Documentação da imobiliária (gestor) escolhe o corretor responsável
    if (p.papel === 'gestor_imobiliaria' && dados._corretor_responsavel) campos.corretor_id = dados._corretor_responsavel;
    if (id) return ok(await sb.from('clientes').update(campos).eq('id', id).select().single());
    return ok(await sb.from('clientes').insert({ corretor_id: p.id, ...campos }).select().single());
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
    if (doc.do_vendedor && !doc.arquivo_path) throw new Error('Documento enviado por outro corretor: só a equipe da CCA abre o arquivo.');
    if (doc.cliente_id) sb.rpc('registrar_acesso', { p_acao: baixar ? 'baixar_documento' : 'ver_documento', p_cliente: doc.cliente_id, p_detalhes: { documento: doc.id } }).then(() => {});
    const r = ok(await sb.storage.from(doc.do_vendedor ? 'vendedores' : 'documentos').createSignedUrl(doc.arquivo_path, 300, baixar ? { download: doc.nome_original || true } : undefined));
    return r.signedUrl;
  },

  async enviarDocumentoVendedor(clienteId, vendedorId, tipoCodigo, arquivo) {
    if (!vendedorId) throw new Error('Salve os dados do vendedor antes de anexar os documentos dele.');
    const caminho = `${vendedorId}/${tipoCodigo}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
    ok(await sb.storage.from('vendedores').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    return ok(await sb.rpc('registrar_documento_vendedor', { p_cliente: clienteId, p_tipo: tipoCodigo, p_path: caminho,
      p_nome: arquivo.name, p_mime: arquivo.type || null, p_tamanho: arquivo.size }));
  },

  async buscarVendedor(cpfCnpj) {
    const { data } = await sb.rpc('buscar_vendedor', { p_cpf_cnpj: R.soDigitos(cpfCnpj) });
    return data || null;
  },

  async vincularVendedor(clienteId, dados) {
    return ok(await sb.rpc('vincular_vendedor', { p_cliente: clienteId, p_dados: { ...dados, cpf_cnpj: R.soDigitos(dados.cpf_cnpj) } }));
  },

  async bancos() {
    const { data, error } = await sb.from('bancos').select('codigo, nome, principal').order('codigo').limit(2000);
    if (error || !data?.length) return bancosDoArquivo();
    const rot = (b) => `${b.codigo} - ${b.nome}`;
    const ordemPrincipais = ['104', '001', '237', '341', '033', '260', '077', '336', '748', '756'];
    const principais = data.filter((b) => b.principal).sort((a, b) => ((ordemPrincipais.indexOf(a.codigo) + 1) || 99) - ((ordemPrincipais.indexOf(b.codigo) + 1) || 99));
    return { principais: principais.map(rot), todos: data.map(rot) };
  },

  async municipios(uf) {
    if (!uf) return [];
    const r = ok(await sb.from('municipios').select('nome').eq('uf', uf).order('nome').limit(2000));
    if (r.length) return r.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return municipiosDoArquivo(uf);
  },

  async mudarStatus(id, status) { ok(await sb.rpc('mudar_status', { p_cliente: id, p_status: status })); },

  async conferirDocumento(docId, aceito, motivo, observacao, doVendedor = false) {
    ok(await sb.rpc(doVendedor ? 'conferir_documento_vendedor' : 'conferir_documento', { p_documento: docId, p_aceito: aceito, p_motivo: motivo || null, p_observacao: observacao || null }));
  },

  async listarDocsParaConferir() {
    const { tipos } = await this.configuracao();
    const docs = ok(await sb.from('documentos').select('*, cliente:clientes(id, nome), participante:participantes(nome)').eq('situacao', 'em_conferencia').order('enviado_em'));
    return docs.map(({ cliente, participante, ...documento }) => {
      const t = tipos.find((x) => x.codigo === documento.tipo_codigo);
      return { documento, cliente_id: cliente.id, cliente_nome: cliente.nome, tipo_nome: participante ? `${t?.nome} – ${R.primeiroNome(participante.nome)}` : t?.nome, regra: t?.regra || '' };
    }).concat((ok(await sb.from('documentos_vendedor').select('*, vendedor:vendedores(nome), cliente:clientes(id, nome)').eq('situacao', 'em_conferencia').order('enviado_em')))
      .map(({ vendedor, cliente, ...documento }) => {
        const t = tipos.find((x) => x.codigo === documento.tipo_codigo);
        return { documento: { ...documento, do_vendedor: true }, cliente_id: cliente?.id, cliente_nome: cliente?.nome || '—',
          tipo_nome: `${t?.nome} – vendedor ${vendedor?.nome || ''}`, regra: t?.regra || '' };
      }));
  },

  async listarMensagens() {
    const msgs = ok(await sb.from('mensagens').select('*, cliente:clientes(nome), destino:perfis(nome)').order('criada_em', { ascending: false }).limit(200));
    return msgs.map((m) => ({ ...m, cliente_nome: m.cliente?.nome, destino_nome: m.destino?.nome }));
  },

  async listarImobiliarias() {
    return ok(await sb.from('imobiliarias').select('*').order('nome'));
  },

  async listarCorretores() {
    const ps = ok(await sb.from('perfis').select('*, imobiliaria:imobiliarias(nome)').in('papel', ['corretor', 'gestor_imobiliaria']).order('nome'));
    return ps.map((p) => ({ ...p, imobiliaria_nome: p.imobiliaria?.nome || 'Autônomo' }));
  },

  async listarAcessos() {
    return ok(await sb.rpc('listar_acessos', { p_limite: 300 }));
  },

  // ---------- Avisos ----------
  async corretoresDaImobiliaria() {
    const p = await this.sessao();
    if (!p.imobiliaria_id) return [];
    return ok(await sb.from('perfis').select('id, nome, papel').eq('imobiliaria_id', p.imobiliaria_id).eq('ativo', true).in('papel', ['corretor', 'gestor_imobiliaria']).order('nome'));
  },

  async inscreverPush(inscricao) {
    const p = await this.sessao();
    const j = inscricao.toJSON();
    ok(await sb.from('push_inscricoes').upsert({ usuario_id: p.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      aparelho: navigator.userAgent.slice(0, 120) }, { onConflict: 'endpoint' }));
  },

  async aceitarWhatsapp(aceita) {
    const p = await this.sessao();
    ok(await sb.from('perfis').update({ aceita_whatsapp: !!aceita }).eq('id', p.id));
  },

  async avisosAdmin(acao, extra = {}) {
    const { data, error } = await sb.functions.invoke('avisos', { body: { acao, ...extra } });
    if (data?.erro) throw new Error(data.erro);
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return data;
  },

  async integracoes() { return ok(await sb.rpc('integracoes_configuradas')); },

  async salvarIntegracao(chave, valor) { ok(await sb.rpc('admin_salvar_integracao', { p_chave: chave, p_valor: valor })); },

  async atualizarImobiliaria(id, campos) {
    const linha = {};
    if (campos.avisos_para) linha.avisos_para = campos.avisos_para;
    if (campos.whatsapp !== undefined) linha.whatsapp = campos.whatsapp ? R.celularInternacional(campos.whatsapp) : null;
    return ok(await sb.from('imobiliarias').update(linha).eq('id', id).select().single());
  },

  // ---------- Convites e usuários ----------
  async convidar(dados) {
    const { data, error } = await sb.functions.invoke('convidar', { body: { ...dados, app_url: location.origin + location.pathname } });
    if (data?.erro) throw new Error(data.erro);
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return data;
  },

  async novoLink(email) { return this.convidar({ acao: 'novo_link', email }); },

  async ativarUsuario(id, ativo) { ok(await sb.rpc('equipe_ativar_usuario', { p_usuario: id, p_ativo: ativo })); },

  async criarImobiliaria({ nome, cnpj, whatsapp }) {
    return ok(await sb.from('imobiliarias').insert({ nome, cnpj: R.soDigitos(cnpj || '') || null, whatsapp: whatsapp ? R.celularInternacional(whatsapp) : null }).select().single());
  },

  // ---------- Base de vendedores (equipe) ----------
  async listarVendedores() { return ok(await sb.rpc('listar_vendedores')); },

  async obterVendedor(id) {
    const [v, docs, clis] = await Promise.all([
      sb.from('vendedores').select('*').eq('id', id).single(),
      sb.from('documentos_vendedor').select('*').eq('vendedor_id', id).neq('situacao', 'substituido').order('tipo_codigo'),
      sb.from('clientes').select('id, nome, cpf, status, corretor:perfis!clientes_corretor_id_fkey(nome)').eq('vendedor_id', id),
    ]);
    return { vendedor: ok(v), documentos: ok(docs).map((d) => ({ ...d, do_vendedor: true })), clientes: ok(clis) };
  },

  async salvarVendedor(id, campos) {
    const permitidos = ['nome', 'pj_tipo', 'empreendimento', 'construtora_cnpj', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'conta_digito', 'estado_civil', 'conjuge_nome', 'conjuge_cpf', 'teve_alteracao_contratual'];
    const linha = Object.fromEntries(Object.entries(campos).filter(([k]) => permitidos.includes(k)).map(([k, v]) => [k, v === '' ? null : v]));
    linha.atualizado_em = new Date().toISOString();
    return ok(await sb.from('vendedores').update(linha).eq('id', id).select().single());
  },

  // ---------- Administração (só perfil ADM) ----------
  async listarEquipe() {
    return ok(await sb.from('perfis').select('id, nome, email, papel, ativo, permissoes').in('papel', ['equipe_cca', 'admin']).order('nome'));
  },

  async atualizarUsuario(id, { papel, ativo, permissoes }) {
    ok(await sb.rpc('admin_atualizar_usuario', { p_usuario: id, p_papel: papel, p_ativo: ativo, p_permissoes: permissoes || {} }));
    if (id === cachePerfil?.id) cachePerfil = null;
  },

  async listarParametros() {
    return ok(await sb.from('parametros').select('*').order('chave'));
  },

  async salvarParametro(chave, valor) {
    ok(await sb.rpc('admin_salvar_parametro', { p_chave: chave, p_valor: String(valor) }));
    cacheConfig = null;
  },
};
