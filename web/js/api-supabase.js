// Conexão real com o Supabase (login, banco e arquivos).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as R from './regras.js';
import { consultarCnpj } from './cnpj.js';

// Campos editáveis da imobiliária (só os que vieram em `campos`)
const CAMPOS_IMOB = ['nome', 'cnpj', 'whatsapp', 'razao_social', 'nome_fantasia', 'situacao_cadastral', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'telefone', 'email', 'cnpj_consultado_em', 'proprietario_nome', 'responsavel_nome', 'creci_juridico'];
function linhaImobiliaria(campos) {
  const linha = {};
  for (const k of CAMPOS_IMOB) {
    if (campos[k] === undefined) continue;
    let v = typeof campos[k] === 'string' ? campos[k].trim() : campos[k];
    if (k === 'cnpj' || k === 'cep') v = R.soDigitos(v || '');
    if (k === 'whatsapp') v = v ? R.celularInternacional(v) : null;
    if (k === 'telefone') v = R.soDigitos(v || '');
    if (k === 'uf') v = String(v || '').toUpperCase();
    linha[k] = v === '' ? null : v;
  }
  return linha;
}
import { tetoDoArquivo } from './tetos.js';

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

// Cópia reduzida da foto só para a pré-conferência por IA (o original continua guardado como veio)
async function previaIa(arquivo) {
  try {
    if (!/^image\//.test(arquivo.type || '') || typeof createImageBitmap !== 'function') return null;
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const w = Math.round(img.width * escala); const hgt = Math.round(img.height * escala);
    const tela = document.createElement('canvas');
    tela.width = w; tela.height = hgt;
    tela.getContext('2d').drawImage(img, 0, 0, w, hgt);
    img.close?.();
    return await new Promise((ok) => tela.toBlob((b) => ok(b), 'image/jpeg', 0.85));
  } catch { return null; }
}
async function enviarPreviaIa(bucket, caminho, arquivo) {
  const previa = await previaIa(arquivo);
  if (previa) await sb.storage.from(bucket).upload(`${caminho}.ia.jpg`, previa, { contentType: 'image/jpeg', upsert: true }).catch(() => {});
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

  async salvarMinhaFoto(dataUrl) {
    ok(await sb.rpc('salvar_minha_foto', { p_foto: dataUrl || null }));
    if (cachePerfil) cachePerfil = { ...cachePerfil, foto: dataUrl || null };
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
      sb.from('clientes').select('*, corretor:perfis!clientes_corretor_id_fkey(id, nome, whatsapp, consumidor), imobiliaria:imobiliarias(id, nome)').eq('id', id).single(),
      sb.from('documentos').select('*').eq('cliente_id', id),
      sb.from('historico_status').select('*').eq('cliente_id', id).order('em'),
      sb.from('mensagens').select('*').eq('cliente_id', id).or('canal.is.null,canal.neq.email').order('criada_em', { ascending: false }),
      sb.from('participantes').select('*').eq('cliente_id', id).order('ordem'),
      sb.rpc('documentos_do_vendedor_v2', { p_cliente: id }),
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
    const { id, status, corretor_id, imobiliaria_id, criado_em, atualizado_em, rascunho, enviado_em, pasta_drive_id, vendedor_id, grerj_numero, grerj_valor, grerj_pago_em, requerimento_enviado_em, ...campos } = dados; // vendedor só muda pela função vincular_vendedor
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
      'tipo_renda', 'renda_bruta', 'renda_formal', 'renda_informal', 'renda_considerada', 'declara_ir', 'ir_retificado', 'escolaridade', 'regime_bens', 'extras'];
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

  async enviarDocumento(clienteId, tipoCodigo, arquivo, participanteId = null, dependenteOrdem = null, emitidoEm = null) {
    const caminho = `${clienteId}/${tipoCodigo}/${dependenteOrdem ? `dependente${dependenteOrdem}` : (participanteId || 'titular')}-${Date.now()}-${nomeSeguro(arquivo.name)}`;
    ok(await sb.storage.from('documentos').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    await enviarPreviaIa('documentos', caminho, arquivo);
    return ok(await sb.from('documentos').insert({
      cliente_id: clienteId, participante_id: participanteId, dependente_ordem: dependenteOrdem, tipo_codigo: tipoCodigo, arquivo_path: caminho,
      nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, ...(emitidoEm ? { emitido_em: emitidoEm } : {}),
    }).select().single());
  },

  async abrirDocumento(doc, { baixar = false, silencioso = false } = {}) {
    if (doc.do_vendedor && !doc.arquivo_path) throw new Error('Documento enviado por outro corretor: só a equipe da CCA abre o arquivo.');
    if (doc.cliente_id && !silencioso) sb.rpc('registrar_acesso', { p_acao: baixar ? 'baixar_documento' : 'ver_documento', p_cliente: doc.cliente_id, p_detalhes: { documento: doc.id } }).then(() => {});
    const r = ok(await sb.storage.from(doc.do_vendedor ? 'vendedores' : 'documentos').createSignedUrl(doc.arquivo_path, 300, baixar ? { download: doc.nome_original || true } : undefined));
    return r.signedUrl;
  },

  async enviarDocumentoVendedor(clienteId, vendedorId, tipoCodigo, arquivo, emitidoEm = null) {
    if (!vendedorId) throw new Error('Salve os dados do vendedor antes de anexar os documentos dele.');
    const caminho = `${vendedorId}/${tipoCodigo}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
    ok(await sb.storage.from('vendedores').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    await enviarPreviaIa('vendedores', caminho, arquivo);
    const idDoc = ok(await sb.rpc('registrar_documento_vendedor', { p_cliente: clienteId, p_tipo: tipoCodigo, p_path: caminho,
      p_nome: arquivo.name, p_mime: arquivo.type || null, p_tamanho: arquivo.size }));
    if (emitidoEm) ok(await sb.rpc('definir_emissao_documento', { p_doc: idDoc, p_vendedor: true, p_data: emitidoEm }));
    return idDoc;
  },

  async definirEmissao(docId, doVendedor, data) {
    ok(await sb.rpc('definir_emissao_documento', { p_doc: docId, p_vendedor: !!doVendedor, p_data: data }));
  },

  // Documentos com data de emissão (para os alertas de validade do painel inicial)
  async listarEmissoes() {
    const [a, b] = await Promise.all([
      sb.from('documentos').select('id, cliente_id, tipo_codigo, emitido_em').not('emitido_em', 'is', null).neq('situacao', 'substituido'),
      sb.from('documentos_vendedor').select('id, cliente_id, tipo_codigo, emitido_em').not('emitido_em', 'is', null).neq('situacao', 'substituido'),
    ]);
    return [...(a.data || []).map((x) => ({ ...x, do_vendedor: false })), ...(b.data || []).map((x) => ({ ...x, do_vendedor: true }))];
  },

  async minhaPosicao() {
    const { data } = await sb.rpc('minha_posicao');
    return data || null;
  },

  // Documentos recusados (motivo e data), para o painel de motivos de recusa
  async listarMotivosRecusa() {
    const [a, b] = await Promise.all([
      sb.from('documentos').select('motivo_recusa, conferido_em').not('motivo_recusa', 'is', null),
      sb.from('documentos_vendedor').select('motivo_recusa, conferido_em').not('motivo_recusa', 'is', null)]);
    return [...(a.data || []), ...(b.data || [])];
  },

  async registrarGrerj(clienteId, { numero, valor, pagoEm, requerimentoEm }) {
    ok(await sb.rpc('registrar_grerj', { p_cliente: clienteId, p_numero: numero || null, p_valor: valor ?? null, p_pago_em: pagoEm || null, p_requerimento_em: requerimentoEm || null }));
  },

  async buscarVendedor(cpfCnpj) {
    const { data } = await sb.rpc('buscar_vendedor', { p_cpf_cnpj: R.soDigitos(cpfCnpj) });
    if (!data) return null;
    const { data: c } = await sb.rpc('vendedor_contato', { p_id: data.id });
    return { ...data, telefone: c?.telefone || null, email: c?.email || null, responsavel_nome: c?.responsavel_nome || null };
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

  async tetoMunicipio(uf, nome) {
    if (!uf || !nome) return null;
    const { data } = await sb.from('municipios').select('teto_mcmv_f12, recorte_mcmv, populacao_mcmv, teto_vigencia, regiao_metropolitana, nome_rm, hierarquia_regic').eq('uf', uf).eq('nome', nome).maybeSingle();
    if (data?.teto_mcmv_f12) return { teto: Number(data.teto_mcmv_f12), recorte: data.recorte_mcmv, hierarquia: data.hierarquia_regic, populacao: data.populacao_mcmv,
      regiaoMetropolitana: data.regiao_metropolitana === true, nomeRm: data.nome_rm, vigencia: data.teto_vigencia };
    return tetoDoArquivo(uf, nome);
  },

  async municipios(uf) {
    if (!uf) return [];
    const r = ok(await sb.from('municipios').select('nome').eq('uf', uf).order('nome').limit(2000));
    if (r.length) return r.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return municipiosDoArquivo(uf);
  },

  async mudarStatus(id, status, mensagem = null) {
    if (mensagem) ok(await sb.rpc('mudar_status_mensagem', { p_cliente: id, p_status: status, p_mensagem: mensagem }));
    else ok(await sb.rpc('mudar_status', { p_cliente: id, p_status: status }));
  },

  async agendarEntrevista(id, { em, modalidade, local, mensagem, agencia, gerente, endereco }) {
    ok(await sb.rpc('agendar_entrevista', { p_cliente: id, p_em: em || null, p_modalidade: modalidade || null, p_local: local || null, p_mensagem: mensagem || null, p_agencia: agencia || null, p_gerente: gerente || null, p_endereco: endereco || null }));
  },

  async listarEntrevistas() {
    const r = ok(await sb.from('clientes').select('id, nome, status, entrevista_em, entrevista_modalidade, entrevista_local, entrevista_agencia, entrevista_gerente, entrevista_endereco, corretor:perfis!clientes_corretor_id_fkey(nome, apelido), imobiliaria:imobiliarias(nome)')
      .not('entrevista_em', 'is', null).order('entrevista_em'));
    return r.map(({ corretor, imobiliaria, ...c }) => ({ ...c, corretor_nome: corretor?.nome || '', corretor_apelido: corretor?.apelido || '', imobiliaria_nome: imobiliaria?.nome || 'Autônomo' }));
  },

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

  // ---------- Conversa por cliente (corretor/imobiliária <-> equipe CCA) ----------
  async listarConversa(clienteId) { return ok(await sb.rpc('listar_conversa', { p_cliente: clienteId })); },

  async enviarConversa(clienteId, texto) {
    const t = String(texto || '').trim();
    if (!t) throw new Error('Escreva a mensagem antes de enviar.');
    if (t.length > 2000) throw new Error('Mensagem muito longa (até 2.000 letras).');
    ok(await sb.from('conversa').insert({ cliente_id: clienteId, texto: t }));
    sb.rpc('marcar_conversa_lida', { p_cliente: clienteId }).then(() => {});
  },

  async marcarConversaLida(clienteId) { ok(await sb.rpc('marcar_conversa_lida', { p_cliente: clienteId })); },

  // Relatórios: histórico de status de todos os clientes que a pessoa vê
  async historicoStatus() { return ok(await sb.rpc('historico_status_visivel')); },

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

  // ---------- Pré-conferência por IA ----------
  async iaAdmin(acao, extra = {}) {
    const { data, error } = await sb.functions.invoke('conferir-ia', { body: { acao, ...extra } });
    if (data?.erro) throw new Error(data.erro);
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return data;
  },

  async iaConferir(tabela, id) { return (await this.iaAdmin('conferir', { tabela, id })).ia; },

  async iaUsoMes() { const r = ok(await sb.rpc('ia_uso_mes')); return r?.[0] || null; },

  async salvarIntegracao(chave, valor) { ok(await sb.rpc('admin_salvar_integracao', { p_chave: chave, p_valor: valor })); },

  async atualizarImobiliaria(id, campos) {
    const linha = linhaImobiliaria(campos);
    if (campos.avisos_para) linha.avisos_para = campos.avisos_para;
    if ('premio_para' in campos) linha.premio_para = String(campos.premio_para || '').trim() || null;
    return ok(await sb.from('imobiliarias').update(linha).eq('id', id).select().single());
  },

  async buscarCnpj(cnpj) { return consultarCnpj(cnpj); },

  async atualizarCorretor(id, { nome, whatsapp, imobiliaria_id, apelido, creci }) {
    ok(await sb.from('perfis').update({ nome, apelido: (apelido || '').trim() || null, creci: (creci || '').trim() || null, whatsapp: whatsapp ? R.celularInternacional(whatsapp) : null, imobiliaria_id: imobiliaria_id || null }).eq('id', id));
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

  // ---------- Convite por link (forma principal) ----------
  async gerarConvite(dados) { return this.convidar({ acao: 'gerar_convite', ...dados }); },

  async listarConvites() {
    const r = ok(await sb.from('convites_link').select('id, tipo, consumidor, nome, whatsapp, criado_em, expira_em, usado_em, cancelado_em, imobiliaria:imobiliarias(nome), criado:perfis!convites_link_criado_por_fkey(nome), usado:perfis!convites_link_usado_por_fkey(nome)')
      .order('criado_em', { ascending: false }).limit(50));
    return r.map((c) => ({ ...c, tipo: c.consumidor ? 'consumidor' : c.tipo, imobiliaria_nome: c.imobiliaria?.nome || null, criado_por_nome: c.criado?.nome || null, usado_nome: c.usado?.nome || null }));
  },

  async cancelarConvite(id) { ok(await sb.rpc('cancelar_convite_link', { p_id: id })); },

  async verConvite(token) { return this.convidar({ acao: 'ver_convite', token }); },

  async aceitarConvite(token, dados) { return this.convidar({ acao: 'aceitar_convite', token, ...dados }); },

  async novoLink(email) { return this.convidar({ acao: 'novo_link', email }); },

  async ativarUsuario(id, ativo) { ok(await sb.rpc('equipe_ativar_usuario', { p_usuario: id, p_ativo: ativo })); },

  async criarImobiliaria(campos) {
    if (!R.cnpjValido(campos.cnpj || '')) throw new Error('CNPJ obrigatório e válido');
    return ok(await sb.from('imobiliarias').insert(linhaImobiliaria(campos)).select().single());
  },

  // ---------- Engenharia (avaliação do imóvel pela Caixa) ----------
  async listarEngenharias() { return ok(await sb.rpc('listar_engenharias')) || []; },

  async cadastrarVendedorBasico({ cpf_cnpj, nome, responsavel_nome, telefone, email }) {
    return ok(await sb.rpc('cadastrar_vendedor_contato', { p_cpf_cnpj: cpf_cnpj, p_nome: nome || '', p_responsavel: responsavel_nome || null, p_telefone: telefone || '', p_email: email || '' }));
  },

  async criarEngenharia(d) {
    return ok(await sb.rpc('criar_engenharia_v2', { p_vendedor: d.vendedor_id, p_tipo: d.tipo, p_endereco: d.imovel_endereco || null, p_cidade: d.imovel_cidade || null,
      p_uf: d.imovel_uf || null, p_matricula: d.matricula || null, p_cartorio: d.cartorio_rgi || null, p_quem_paga: d.quem_paga || null }));
  },

  async editarEngenharia(id, d) {
    ok(await sb.rpc('editar_engenharia', { p_id: id, p_tipo: d.tipo, p_endereco: d.imovel_endereco || null, p_cidade: d.imovel_cidade || null, p_uf: d.imovel_uf || null,
      p_matricula: d.matricula || null, p_cartorio: d.cartorio_rgi || null, p_quem_paga: d.quem_paga || null, p_telefone: d.telefone || null, p_email: d.email || null }));
  },

  async excluirEngenharia(id) { ok(await sb.rpc('excluir_engenharia', { p_id: id })); },
  async equipeEditarVendedor(id, d) { ok(await sb.rpc('equipe_editar_vendedor', { p_id: id, p_nome: d.nome, p_cpf_cnpj: R.soDigitos(d.cpf_cnpj), p_responsavel: d.responsavel_nome || null })); },
  async verEngenharia(id) { await sb.rpc('equipe_ver_engenharia', { p_id: id }); },

  async reenviarEngenharia(id) { ok(await sb.rpc('engenharia_reenviar', { p_id: id })); },

  async enviarEngenharia(id) { ok(await sb.rpc('enviar_engenharia', { p_id: id })); },

  // ---------- Consumidor final: verificação de identidade por vídeo ----------
  async enviarVerificacao(arquivo) {
    const { data: u } = await sb.auth.getUser();
    const ext = (String(arquivo.name || '').split('.').pop() || 'mp4').replace(/[^\w]+/g, '').slice(0, 5) || 'mp4';
    const caminho = `${u.user.id}/video-${Date.now()}.${ext}`;
    ok(await sb.storage.from('identidade').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    ok(await sb.rpc('enviar_verificacao', { p_path: caminho, p_nome: arquivo.name || null }));
  },
  async minhaVerificacao() { return ok(await sb.rpc('minha_verificacao')); },
  async listarVerificacoes() { return ok(await sb.rpc('listar_verificacoes')); },
  async analisarVerificacao(id, aprovada, motivo) { ok(await sb.rpc('analisar_verificacao', { p_id: id, p_aprovada: aprovada, p_motivo: motivo || null })); },
  async abrirVerificacao(v) { return ok(await sb.storage.from('identidade').createSignedUrl(v.video_path, 300)).signedUrl; },

  async enviarDocEngenharia(id, tipo, arquivo, peptId = null) {
    const nome = String(arquivo.name || 'arquivo').replace(/[^\w.\-]+/g, '_');
    const caminho = `${id}/${Date.now()}_${nome}`;
    ok(await sb.storage.from('engenharia').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false }));
    const { data: u } = await sb.auth.getUser();
    ok(await sb.from('engenharia_docs').insert({ engenharia_id: id, tipo, pept_id: peptId, nome_original: arquivo.name, arquivo_path: caminho, enviado_por: u.user.id }));
  },

  async abrirDocEngenharia(doc, { baixar = false } = {}) {
    const r = ok(await sb.storage.from('engenharia').createSignedUrl(doc.arquivo_path, 300, baixar ? { download: doc.nome_original || true } : undefined));
    return r.signedUrl;
  },

  async engenhariaAvancar(id, { etapa, os_numero, os_data }) {
    ok(await sb.rpc('engenharia_equipe_avancar', { p_id: id, p_etapa: etapa, p_os_numero: os_numero || null, p_os_data: os_data || null }));
  },

  async engenhariaInformarPagamento(id) { ok(await sb.rpc('engenharia_informar_pagamento', { p_id: id })); },

  async engenhariaLancarLaudo(id, { aprovado, valor, data, motivos }) {
    ok(await sb.rpc('engenharia_lancar_laudo', { p_id: id, p_aprovado: aprovado, p_valor: aprovado ? valor : null, p_data: aprovado ? data : null, p_motivos: aprovado ? [] : motivos }));
  },

  async engenhariaResolverPept(peptId, resolvida) { ok(await sb.rpc('engenharia_resolver_pept', { p_pept: peptId, p_resolvida: resolvida })); },

  async engenhariaContestar(id, { tipo, links }) { ok(await sb.rpc('engenharia_contestar', { p_id: id, p_tipo: tipo, p_links: links || null })); },

  // ---------- Base de vendedores (equipe) ----------
  async listarVendedores() { return ok(await sb.rpc('listar_vendedores_v2')); },

  async obterVendedor(id) {
    const [v, docs, clis] = await Promise.all([
      sb.from('vendedores').select('*').eq('id', id).single(),
      sb.from('documentos_vendedor').select('*').eq('vendedor_id', id).neq('situacao', 'substituido').order('tipo_codigo'),
      sb.from('clientes').select('id, nome, cpf, status, corretor:perfis!clientes_corretor_id_fkey(nome)').eq('vendedor_id', id),
    ]);
    return { vendedor: ok(v), documentos: ok(docs).map((d) => ({ ...d, do_vendedor: true })), clientes: ok(clis) };
  },

  async salvarVendedor(id, campos) {
    const permitidos = ['nome', 'pj_tipo', 'empreendimento', 'construtora_cnpj', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'conta_digito', 'responsavel_nome', 'estado_civil', 'conjuge_nome', 'conjuge_cpf', 'teve_alteracao_contratual'];
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

  async definirRegraDocumento(codigo, regra) {
    ok(await sb.rpc('admin_definir_regra_documento', { p_codigo: codigo, p_regra: regra }));
    cacheConfig = null;
  },

  async salvarParametro(chave, valor) {
    ok(await sb.rpc('admin_salvar_parametro', { p_chave: chave, p_valor: String(valor) }));
    cacheConfig = null;
  },

  // ---------- Campanhas e metas por mês ----------
  async listarCampanhas() {
    const [c, p] = await Promise.all([sb.from('campanhas').select('*').order('inicio', { ascending: false }), sb.from('campanha_premios').select('*').order('categoria').order('posicao')]);
    const premios = ok(p);
    return ok(c).map((x) => ({ ...x, premios: premios.filter((y) => y.campanha_id === x.id) }));
  },

  async rankingCampanha(campanhaId) {
    return ok(await sb.rpc('campanha_placar', { p_campanha: campanhaId }));
  },

  async salvarCampanha(dados) {
    const id = ok(await sb.rpc('admin_salvar_campanha', { p: { id: dados.id || null, nome: dados.nome, descricao: dados.descricao || '', regulamento: dados.regulamento || '', metrica: dados.metrica || 'assinados',
      inicio: dados.inicio, fim: dados.fim, mostrar_nomes: dados.mostrar_nomes !== false, ativa: dados.ativa !== false,
      pontos_avulso: Number.isFinite(Number(dados.pontos_avulso)) ? Number(dados.pontos_avulso) : 2, pontos_empreendimento: Number.isFinite(Number(dados.pontos_empreendimento)) ? Number(dados.pontos_empreendimento) : 1 } }));
    for (const x of dados.premios || []) {
      if (!String(x.descricao || '').trim()) continue;
      ok(await sb.rpc('admin_salvar_premio', { p_campanha: id, p_id: x.id || null, p_categoria: x.categoria, p_posicao: Number(x.posicao) || 1, p_descricao: x.descricao }));
    }
    for (const rid of dados.premiosRemovidos || []) ok(await sb.rpc('admin_remover_premio', { p_id: rid }));
    return id;
  },

  async arquivarCampanha(campanhaId, arquivada = true) { ok(await sb.rpc('admin_arquivar_campanha', { p_id: campanhaId, p_arquivada: !!arquivada })); },
  async apurarCampanha(campanhaId) { ok(await sb.rpc('admin_apurar_campanha', { p_id: campanhaId })); },
  async entregarPremio(_campanhaId, premioId, data) { ok(await sb.rpc('admin_entregar_premio', { p_premio: premioId, p_data: data || null })); },

  async definirEntregaPara(_campanhaId, premioId, texto) { ok(await sb.rpc('admin_definir_entrega_para', { p_premio: premioId, p_texto: String(texto || '') })); },

  async listarMetasMensais() {
    const r = await sb.from('metas_mensais').select('mes, metrica, valor');
    return r.error ? [] : r.data;
  },

  async salvarMetaMensal(mes, metrica, valor) {
    ok(await sb.rpc('admin_salvar_meta_mensal', { p_mes: `${String(mes).slice(0, 7)}-01`, p_metrica: metrica, p_valor: valor === '' || valor === null || valor === undefined ? null : Number(valor) }));
  },
};
