// Avisos automáticos do APP CCA.
// Lê a fila de eventos (cadastro enviado, status, documento recusado, convite, vídeo de identidade, engenharia, documento enviado pelo cliente), decide para quem vai
// (corretor, imobiliária ou os dois — configurado por imobiliária) e envia pelo canal escolhido pelo ADM:
//   - "whatsapp": API oficial da Meta (modelos aprovados, com custo por mensagem)
//   - "push": notificação do próprio app (sem custo)
// Opcional: os mesmos avisos também por e-mail (caixa da CCA na Titan, via SMTP), ligado em Configurações.
// Também atende o ADM: enviar teste, criar os modelos na Meta e ver a situação deles.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v21.0";
const RODAPE = "Só avisos. Fale com a CCA: (21) 99639-4546";
const CABECALHO = "Andrade Almeida CCA";

// Texto dos parâmetros: a Meta não aceita quebra de linha nem muitos espaços seguidos
const limpo = (s: unknown) => String(s ?? "").replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "-";
const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";
// "Bom dia, João" (hora de Brasília). A Meta não aceita variável no começo do texto: o modelo começa com 👋.
function saudacao(agora = new Date()) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(agora)) % 24;
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}
const cumprimento = (n: string) => `${saudacao()}, ${primeiroNome(n)}`;
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const foneWhats = (s: unknown) => { const d = soDigitos(s); if (!d) return ""; return d.startsWith("55") ? d : `55${d}`; };

// ---------- Modelos da Meta ----------
function modelos(base: string) {
  const botao = (texto: string, sufixo: string, exemplo: string) => ({
    type: "BUTTONS", buttons: [{ type: "URL", text: texto, url: `${base}${sufixo}{{1}}`, example: [`${base}${sufixo}${exemplo}`] }],
  });
  const comum = (corpo: string, exemplo: string[]) => [
    { type: "HEADER", format: "TEXT", text: CABECALHO },
    { type: "BODY", text: corpo, example: { body_text: [exemplo] } },
    { type: "FOOTER", text: RODAPE },
  ];
  return [
    { name: "cca_cadastro_recebido", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! Recebemos o cadastro do cliente *{{2}}* no Portal do Corretor. {{3}}\n\nAcompanhe tudo pelo app.",
        ["Bom dia, João", "Lucas Ferreira Lima", "Ainda falta: Identidade de Paula Lima. Sem esse documento o processo não vai para análise."]),
        botao("Abrir no app", "?c=", "exemplo")] },
    { name: "cca_status_atualizado", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! O processo do cliente *{{2}}* mudou para: *{{3}}*.\n\nVeja os detalhes pelo app.",
        ["Bom dia, João", "Lucas Ferreira Lima", "Cliente Aprovado"]),
        botao("Abrir no app", "?c=", "exemplo")] },
    { name: "cca_documento_recusado", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! O documento *{{2}}* do cliente *{{3}}* foi recusado pela CCA.\nMotivo: {{4}}\n\nEnvie um novo arquivo pelo app para não atrasar a análise.",
        ["Bom dia, João", "Comprovante de residência", "Lucas Ferreira Lima", "Ilegível: foto cortada"]),
        botao("Substituir no app", "?c=", "exemplo")] },
    // Modelos específicos (texto fixo = categoria Utilidade). O antigo cca_aviso_geral, de texto livre, foi classificado como Marketing.
    { name: "cca_etapa_cliente", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! O seu financiamento imobiliário avançou para a etapa: *{{2}}*.\n\nToque no botão para ver os detalhes e o que fazer agora.",
        ["Bom dia, Mariana", "Crédito aprovado pela Caixa"]),
        botao("Ver meu financiamento", "?ir=", "meu")] },
    { name: "cca_entrevista_agendada", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! A entrevista de *{{2}}* com o gerente da Caixa foi agendada para {{3}}, às {{4}}.\nLocal: {{5}}\n\nVeja as orientações no app.",
        ["Bom dia, Mariana", "Mariana Costa", "segunda-feira, 26 de outubro", "10:30", "Agência 0182 Itaboraí, Av. 22 de Maio, 5000"]),
        botao("Ver detalhes", "?ir=", "meu")] },
    { name: "cca_documento_pendente", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! O processo de financiamento de *{{2}}* está aguardando documentos: {{3}}.\n\nSem eles o processo não segue para análise. Envie pelo app.",
        ["Bom dia, João", "Lucas Ferreira Lima", "Comprovante de residência, Carteira de trabalho"]),
        botao("Enviar documentos", "?ir=", "meu")] },
    { name: "cca_assinatura_pendente", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! Os formulários da Caixa do processo de *{{2}}* ainda aguardam assinatura no gov.br: {{3}}.\n\nO processo só segue com todas as assinaturas.",
        ["Bom dia, João", "Lucas Ferreira Lima", "MO30844, MO30825"]),
        botao("Ver quem falta assinar", "?ir=", "meu")] },
    { name: "cca_engenharia_atualizada", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! A engenharia do imóvel de *{{2}}* foi atualizada: {{3}}.\n\nVeja no app o que fazer agora.",
        ["Bom dia, João", "José Pereira", "boleto disponível para pagamento"]),
        botao("Abrir a engenharia", "?ir=", "engenharia")] },
    { name: "cca_identidade_conferida", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! A conferência do seu vídeo de identidade foi concluída: {{2}}.\n\nAbra o app para continuar o seu cadastro.",
        ["Bom dia, Mariana", "identidade confirmada"]),
        botao("Abrir o app", "?ir=", "verificacao")] },
    { name: "cca_link_acesso", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! Seu acesso ao Portal do Corretor da Andrade Almeida CCA está pronto. Toque no botão para criar sua senha. O link vale por pouco tempo e funciona uma vez só.",
        ["Bom dia, João"]),
        botao("Criar minha senha", "?acesso=", "invite.exemplo")] },
    // Código para confirmar o celular (categoria Autenticação: texto padrão da Meta + botão "Copiar código")
    { name: "cca_codigo_verificacao", language: "pt_BR", category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
      ] },
  ];
}

// Envia o código de confirmação pelo WhatsApp (modelo de autenticação)
async function enviarCodigoWhats(cfg: Config, telefone: string, codigo: string) {
  if (!cfg.token || !cfg.phoneId) throw new Error("WhatsApp da Meta não configurado (token e ID do número)");
  const to = foneWhats(telefone);
  if (to.length < 12) throw new Error("Celular inválido");
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: "cca_codigo_verificacao", language: { code: "pt_BR" }, components: [
      { type: "body", parameters: [{ type: "text", text: codigo }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] },
    ] } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Meta respondeu ${r.status}`);
}

const hashCodigo = async (perfil: string, codigo: string) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${perfil}:${codigo}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

type Config = { canal: string; base: string; token?: string; phoneId?: string; wabaId?: string; vapidPub?: string; vapidPriv?: string;
  email: boolean; smtpHost: string; smtpPorta: number; smtpUsuario?: string; smtpSenha?: string; responderPara?: string };

async function carregarConfig(db: SupabaseClient): Promise<Config> {
  const [{ data: params }, { data: segs }] = await Promise.all([
    db.from("parametros").select("chave, valor").in("chave", ["canal_avisos", "url_app", "vapid_publica", "email_avisos", "smtp_servidor", "smtp_porta", "email_responder_para"]),
    db.from("integracoes").select("chave, valor"),
  ]);
  const p = Object.fromEntries((params || []).map((x: any) => [x.chave, x.valor]));
  const s = Object.fromEntries((segs || []).map((x: any) => [x.chave, x.valor]));
  let base = String(p.url_app || "https://benealmeida-jpg.github.io/APP-CCA/");
  if (!base.endsWith("/")) base += "/";
  return { canal: p.canal_avisos === "whatsapp" ? "whatsapp" : "push", base, token: s.meta_token, phoneId: s.meta_phone_id,
    wabaId: s.meta_waba_id, vapidPub: p.vapid_publica, vapidPriv: s.vapid_privada,
    email: p.email_avisos === "sim", smtpHost: p.smtp_servidor || "smtp.titan.email", smtpPorta: Number(p.smtp_porta) || 465,
    smtpUsuario: s.smtp_usuario, smtpSenha: s.smtp_senha, responderPara: p.email_responder_para || s.smtp_usuario };
}

// ---------- Envio ----------
async function enviarWhats(cfg: Config, telefone: string, modelo: string, params: string[], botao: string) {
  if (!cfg.token || !cfg.phoneId) throw new Error("WhatsApp da Meta não configurado (token e ID do número)");
  const to = foneWhats(telefone);
  if (to.length < 12) throw new Error("Sem WhatsApp válido cadastrado");
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name: modelo, language: { code: "pt_BR" }, components: [
        { type: "body", parameters: params.map((t) => ({ type: "text", text: limpo(t) })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: botao }] },
      ] },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Meta respondeu ${r.status}`);
  return j?.messages?.[0]?.id as string | undefined;
}

async function enviarPush(db: SupabaseClient, cfg: Config, usuarios: string[], titulo: string, corpo: string, url: string) {
  if (!cfg.vapidPub || !cfg.vapidPriv) throw new Error("Notificações não configuradas");
  if (!usuarios.length) throw new Error("Ninguém para avisar");
  webpush.setVapidDetails("mailto:contato@andradealmeidacca.com.br", cfg.vapidPub, cfg.vapidPriv);
  const { data: insc } = await db.from("push_inscricoes").select("*").in("usuario_id", usuarios);
  if (!insc?.length) throw new Error("Notificações não ativadas no celular");
  let ok = 0; const erros: string[] = [];
  for (const i of insc) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify({ titulo, corpo, url }), { TTL: 86400 });
      ok++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_inscricoes").delete().eq("id", i.id);
      else erros.push(String(e?.body || e?.message || e));
    }
  }
  if (!ok) throw new Error(erros[0] || "Notificações expiradas: peça para ativar de novo");
  return `${ok} aparelho(s)`;
}

// ---------- E-mail (Titan / SMTP) ----------
const WHATS_CCA = "5521996394546"; // WhatsApp da CCA: (21) 99639-4546
const emailPronto = (cfg: Config) => !!(cfg.smtpUsuario && cfg.smtpSenha);
const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function htmlEmail(cfg: Config, titulo: string, texto: string, url: string, botao: string) {
  const corpo = esc(texto).replace(/\n/g, "<br>");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F5F3EF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EF;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;font-family:Arial,Helvetica,sans-serif;color:#1C2B36">
<tr><td style="padding:28px 28px 8px"><img src="${cfg.base}img/logo-email.png" width="180" alt="Andrade Almeida Correspondente Caixa Aqui" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:12px 28px 0;font-size:22px;line-height:28px;font-weight:bold">${esc(titulo)}</td></tr>
<tr><td style="padding:12px 28px 4px;font-size:16px;line-height:24px;color:#26323A">${corpo}</td></tr>
<tr><td style="padding:20px 28px 8px"><a href="${esc(url)}" style="display:inline-block;background:#D88934;color:#1C2B36;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 24px;border-radius:12px">${esc(botao)}</a></td></tr>
<tr><td style="padding:16px 28px 0;font-size:14px;line-height:20px;color:#5A646B;border-top:1px solid #EFECE6">Quer falar com a CCA sobre este aviso?</td></tr>
<tr><td style="padding:10px 28px 28px">
<a href="https://wa.me/${WHATS_CCA}?text=${encodeURIComponent(`Olá, CCA! Sobre o aviso "${titulo}": `)}" style="display:inline-block;margin:0 8px 8px 0;background:#25D366;color:#0B2E1A;font-weight:bold;font-size:15px;text-decoration:none;padding:12px 18px;border-radius:12px">Falar no WhatsApp</a>
${cfg.responderPara ? `<a href="mailto:${esc(cfg.responderPara)}?subject=${encodeURIComponent(`Re: ${titulo}`)}" style="display:inline-block;margin:0 8px 8px 0;background:#FFFFFF;color:#2C4B5D;font-weight:bold;font-size:15px;text-decoration:none;padding:11px 17px;border-radius:12px;border:1px solid #3D657C">Responder por e-mail</a>` : ""}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#5A646B">Aviso automático do Portal do Corretor da Andrade Almeida CCA · WhatsApp (21) 99639-4546</p>
</td></tr></table></body></html>`;
}

async function enviarEmail(cfg: Config, para: string[], titulo: string, texto: string, url: string, botao = "Abrir no Portal") {
  if (!cfg.smtpUsuario || !cfg.smtpSenha) throw new Error("E-mail de envio não configurado (endereço e senha)");
  const lista = [...new Set(para.map((x) => String(x || "").trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
  if (!lista.length) throw new Error("Sem e-mail cadastrado");
  const t = nodemailer.createTransport({ host: cfg.smtpHost, port: cfg.smtpPorta, secure: cfg.smtpPorta === 465,
    auth: { user: cfg.smtpUsuario, pass: cfg.smtpSenha } });
  const info = await t.sendMail({
    from: { name: "Andrade Almeida CCA", address: cfg.smtpUsuario }, to: lista, replyTo: cfg.responderPara,
    subject: `${titulo} · Andrade Almeida CCA`,
    text: `${texto}\n\nAbrir no Portal do Corretor: ${url}\n\nFalar com a CCA no WhatsApp: https://wa.me/${WHATS_CCA}\nOu responda este e-mail.\n\nAviso automático da Andrade Almeida CCA.`,
    html: htmlEmail(cfg, titulo, texto, url, botao),
  });
  return `${lista.join(", ")}${info?.messageId ? ` (${info.messageId})` : ""}`;
}

// ---------- Para quem vai ----------
type Destino = { tipo: "corretor" | "imobiliaria" | "pessoa"; nome: string; telefone: string; usuarios: string[]; usuarioId: string | null; aceita: boolean; emails: string[] };

async function destinosDoCliente(db: SupabaseClient, cliente: any): Promise<Destino[]> {
  const { data: corretor } = await db.from("perfis").select("id, nome, email, whatsapp, aceita_whatsapp").eq("id", cliente.corretor_id).single();
  const lista: Destino[] = [];
  let modo = "corretor";
  let imob: any = null;
  if (cliente.imobiliaria_id) {
    const r = await db.from("imobiliarias").select("id, nome, email, whatsapp, avisos_para").eq("id", cliente.imobiliaria_id).single();
    imob = r.data; modo = imob?.avisos_para || "corretor";
  }
  if (modo === "corretor" || modo === "ambos" || !imob) {
    lista.push({ tipo: "corretor", nome: corretor?.nome || "", telefone: corretor?.whatsapp || "", usuarios: corretor ? [corretor.id] : [], usuarioId: corretor?.id || null, aceita: corretor?.aceita_whatsapp !== false, emails: corretor?.email ? [corretor.email] : [] });
  }
  if (imob && (modo === "imobiliaria" || modo === "ambos")) {
    const { data: gestores } = await db.from("perfis").select("id, email").eq("imobiliaria_id", imob.id).eq("papel", "gestor_imobiliaria").eq("ativo", true);
    lista.push({ tipo: "imobiliaria", nome: imob.nome, telefone: imob.whatsapp || "", usuarios: (gestores || []).map((g: any) => g.id), usuarioId: null, aceita: true,
      emails: [imob.email, ...(gestores || []).map((g: any) => g.email)].filter(Boolean) });
  }
  return lista;
}

// ---------- Monta o aviso de cada evento ----------
type Aviso = { tipoMsg: string; modelo: string; params: (nome: string) => string[]; botao: string; titulo: string; texto: (nome: string) => string; url: string; botaoEmail?: string };

async function avisoDoEvento(db: SupabaseClient, cfg: Config, ev: any): Promise<{ cliente: any; aviso: Aviso } | null> {
  if (!ev.cliente_id) return null;
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, status").eq("id", ev.cliente_id).single();
  if (!cliente) return null;
  const url = `${cfg.base}?c=${cliente.id}`;
  const nomeCli = cliente.nome;
  // Consumidor final: o processo é dele mesmo, então o texto fala "o seu processo"
  const { data: dono } = await db.from("perfis").select("consumidor").eq("id", cliente.corretor_id).maybeSingle();
  const meu = dono?.consumidor === true;

  if (ev.tipo === "cliente_enviado") {
    const { data: nec } = await db.rpc("documentos_necessarios_v2", { p_cliente: cliente.id });
    const falta = (nec || []).filter((n: any) => n.regra === "**" && ["pendente", "recusado"].includes(n.situacao))
      .map((n: any) => (n.pessoa_nome && n.pessoa_nome !== nomeCli ? `${n.nome} de ${primeiroNome(n.pessoa_nome)}` : n.nome));
    const pend = falta.length ? `Ainda falta: ${falta.join(", ")}. Sem esse documento o processo não vai para análise.` : "Todos os documentos obrigatórios chegaram.";
    return { cliente, aviso: { tipoMsg: "confirmacao", modelo: "cca_cadastro_recebido", botao: cliente.id, url,
      params: (n) => [cumprimento(n), nomeCli, pend], titulo: "Cadastro recebido",
      texto: (n) => meu ? `${cumprimento(n)}! Recebemos o seu cadastro. ${pend}` : `${cumprimento(n)}! Recebemos o cadastro de ${nomeCli}. ${pend}` } };
  }
  if (ev.tipo === "status_mudou") {
    const { data: st } = await db.from("status_etapas").select("nome").eq("codigo", ev.dados?.para).maybeSingle();
    const para = ev.dados?.para;
    const nomeSt = para === "assinaturas" && ev.dados?.de === "entrevista" ? "Entrevista aprovada pelo gerente da Caixa. Próximo passo: assinaturas dos formulários no gov.br"
      : para === "entrevista_reprovada" ? "Entrevista reprovada pelo gerente da Caixa. Processo encerrado; nova tentativa só depois de 180 dias"
      : para === "processo_encerrado" ? "Processo encerrado na consulta inicial do CPF"
      : (st?.nome || para || "");
    // Mensagem editada pela equipe no painel: vai no lugar do texto padrão (notificação do app e histórico)
    const editada = typeof ev.dados?.mensagem === "string" && ev.dados.mensagem.trim() ? ev.dados.mensagem.replace(/\*/g, "").trim() : null;
    return { cliente, aviso: { tipoMsg: "status", modelo: "cca_status_atualizado", botao: cliente.id, url,
      params: (n) => [cumprimento(n), nomeCli, nomeSt], titulo: `${nomeCli}: ${nomeSt}`,
      texto: (n) => editada || (meu ? (MSG_CLIENTE[ev.dados?.para] ? `${cumprimento(n)}! ${MSG_CLIENTE[ev.dados.para].texto}` : `${cumprimento(n)}! O seu processo mudou para: ${nomeSt}.`) : `${cumprimento(n)}! O processo de ${nomeCli} mudou para: ${nomeSt}.`) } };
  }
  if (ev.tipo === "documento_conferido" || ev.tipo === "documento_vendedor_conferido") {
    if (ev.dados?.aceito) return null;   // aceito: sem aviso
    const tabela = ev.tipo === "documento_conferido" ? "documentos" : "documentos_vendedor";
    const docId = ev.documento_id || ev.dados?.documento;
    const { data: doc } = await db.from(tabela).select("tipo_codigo").eq("id", docId).maybeSingle();
    const { data: tipo } = await db.from("tipos_documento").select("nome").eq("codigo", doc?.tipo_codigo || "").maybeSingle();
    const nomeDoc = `${tipo?.nome || "Documento"}${ev.tipo === "documento_vendedor_conferido" ? " (vendedor)" : ""}`;
    const motivo = [ev.dados?.motivo, ev.dados?.observacao].filter(Boolean).join(": ") || "ver no app";
    return { cliente, aviso: { tipoMsg: "recusa", modelo: "cca_documento_recusado", botao: cliente.id, url, botaoEmail: "Substituir no Portal",
      params: (n) => [cumprimento(n), nomeDoc, nomeCli, motivo], titulo: `Documento recusado: ${nomeCli}`,
      texto: (n) => meu ? `${cumprimento(n)}! O documento ${nomeDoc} foi recusado. Motivo: ${motivo}. Envie outro pelo app.` : `${cumprimento(n)}! O documento ${nomeDoc} de ${nomeCli} foi recusado. Motivo: ${motivo}.` } };
  }
  return null;
}

async function registrar(db: SupabaseClient, linha: Record<string, unknown>) {
  await db.from("mensagens").insert(linha);
}

// Envia por notificação do app e por e-mail (sempre) e, só nos avisos importantes, também pelo WhatsApp.
// Importante = etapa-chave do processo ou atraso (documento ou informação que está demorando). O resto não vai ao WhatsApp
// para não ficar repetitivo: a pessoa já recebe a notificação e o e-mail.
type Whats = { modelo: string; params: string[] };
async function avisoAppEmail(db: SupabaseClient, cfg: Config, ev: any, cliente: any, dest: Destino, tipoMsg: string,
  titulo: string, texto: string, url: string, botaoEmail?: string, importante = false, whats?: Whats) {
  let n = 0;
  let ref: string | undefined; let erro: string | null = null;
  try { ref = await enviarPush(db, cfg, dest.usuarios, titulo, texto, url); n++; } catch (e) { erro = (e as Error).message; }
  await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: null, tipo: tipoMsg, canal: "push", evento_id: ev.id,
    texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto}`, situacao: erro ? "erro" : "enviada", erro, referencia: ref || null,
    enviada_em: erro ? null : new Date().toISOString() });
  if (importante && whats && cfg.canal === "whatsapp" && soDigitos(dest.telefone)) {
    const u = new URL(url); const rota = u.searchParams.get("ir") || (u.searchParams.get("c") ? `cliente/${u.searchParams.get("c")}` : "");
    let refW: string | undefined; let erroW: string | null = null;
    try {
      if (!dest.aceita) throw new Error("Não aceitou avisos no WhatsApp");
      refW = await enviarWhats(cfg, dest.telefone, whats.modelo, whats.params, encodeURIComponent(rota)); n++;
    } catch (e) { erroW = (e as Error).message; }
    await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: dest.telefone, tipo: tipoMsg, canal: "whatsapp", evento_id: ev.id,
      texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto}`, situacao: erroW ? "erro" : "enviada", erro: erroW, referencia: refW || null,
      enviada_em: erroW ? null : new Date().toISOString() });
  }
  if (cfg.email && emailPronto(cfg) && dest.emails.length) {
    let refE: string | undefined; let erroE: string | null = null;
    try { refE = await enviarEmail(cfg, dest.emails, titulo, texto, url, botaoEmail); n++; } catch (e) { erroE = (e as Error).message; }
    await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: null, tipo: tipoMsg, canal: "email", evento_id: ev.id,
      texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto}`, situacao: erroE ? "erro" : "enviada", erro: erroE, referencia: refE || null,
      enviada_em: erroE ? null : new Date().toISOString() });
  }
  return n;
}

// Conversa por cliente: mensagem da equipe avisa o corretor/imobiliária; mensagem do corretor avisa a equipe
async function processarConversa(db: SupabaseClient, cfg: Config, ev: any) {
  const d = ev.dados || {};
  const [{ data: msg }, { data: cliente }] = await Promise.all([
    db.from("conversa").select("id, texto, autor_id").eq("id", d.mensagem_id).maybeSingle(),
    db.from("clientes").select("id, nome, corretor_id, imobiliaria_id").eq("id", ev.cliente_id).maybeSingle(),
  ]);
  if (!msg || !cliente) return 0;
  const { data: autor } = await db.from("perfis").select("nome, papel").eq("id", msg.autor_id).maybeSingle();
  const url = `${cfg.base}?c=${cliente.id}`;
  const trecho = String(msg.texto).length > 400 ? `${String(msg.texto).slice(0, 400)}…` : String(msg.texto);
  let n = 0;
  if (d.da_equipe) {
    for (const dest of await destinosDoCliente(db, cliente)) {
      n += await avisoAppEmail(db, cfg, ev, cliente, dest, "conversa", `Mensagem da CCA: ${cliente.nome}`,
        `${cumprimento(dest.nome)}! ${primeiroNome(autor?.nome || "A equipe")} da CCA escreveu sobre ${cliente.nome}:\n"${trecho}"\nResponda pelo Portal do Corretor.`, url, "Responder no Portal");
    }
  } else {
    const { data: equipe } = await db.from("perfis").select("id, nome").in("papel", ["equipe_cca", "admin"]).eq("ativo", true);
    const dest: Destino = { tipo: "pessoa", nome: "Equipe CCA", telefone: "", usuarios: (equipe || []).map((x: any) => x.id), usuarioId: null, aceita: true,
      emails: cfg.responderPara ? [cfg.responderPara] : [] };
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "conversa", `${autor?.nome || "Corretor"} escreveu: ${cliente.nome}`,
      `${autor?.nome || "O corretor"} escreveu sobre ${cliente.nome}:\n"${trecho}"\nResponda pelo painel da equipe.`, url, "Abrir no painel");
  }
  return n;
}

// Lembrete automático: documento obrigatório (**) que ainda falta
async function processarLembrete(db: SupabaseClient, cfg: Config, ev: any) {
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, rascunho, status").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente || cliente.rascunho) return 0;
  const { data: nec } = await db.rpc("documentos_necessarios_v2", { p_cliente: cliente.id });
  const falta = (nec || []).filter((x: any) => x.regra === "**" && ["pendente", "recusado"].includes(x.situacao))
    .map((x: any) => (x.pessoa_nome && x.pessoa_nome !== cliente.nome ? `${x.nome} de ${primeiroNome(x.pessoa_nome)}` : x.nome));
  if (!falta.length) return 0;
  const url = `${cfg.base}?c=${cliente.id}`;
  let n = 0;
  for (const dest of await destinosDoCliente(db, cliente)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "pendencia", `Falta documento: ${cliente.nome}`,
      `${cumprimento(dest.nome)}! O processo de ${cliente.nome} está parado esperando: ${falta.join(", ")}. Sem esse documento o processo não vai para análise. Anexe pelo Portal do Corretor.`, url, "Anexar no Portal", true,
      { modelo: "cca_documento_pendente", params: [cumprimento(dest.nome), cliente.nome, falta.join(", ")] });
  }
  // O cliente com acesso ao portal também é lembrado, só dos documentos dele (compradores)
  const { data: doComprador } = await db.from("tipos_documento").select("codigo").eq("alvo", "comprador");
  const codigos = new Set((doComprador || []).map((t: any) => t.codigo));
  const dele = (nec || []).filter((x: any) => x.regra === "**" && ["pendente", "recusado"].includes(x.situacao) && codigos.has(x.tipo_codigo))
    .map((x: any) => (x.pessoa_nome && x.pessoa_nome !== cliente.nome ? `${x.nome} de ${primeiroNome(x.pessoa_nome)}` : x.nome));
  if (dele.length) {
    for (const dest of await destinosClienteFinal(db, cliente.id)) {
      n += await avisoAppEmail(db, cfg, ev, cliente, dest, "pendencia", "Falta documento no seu processo",
        `${cumprimento(dest.nome)}! O seu financiamento está esperando: ${dele.join(", ")}. Envie pelo app (botão Enviar documentos) ou entregue ao(à) seu(sua) corretor(a). Sem esses documentos o processo não vai para análise.`, `${cfg.base}?ir=meu`, "Enviar documentos", true,
        { modelo: "cca_documento_pendente", params: [cumprimento(dest.nome), cliente.nome, dele.join(", ")] });
    }
  }
  return n;
}

// ---------- Avisos para o próprio cliente (comprador com acesso ao portal) ----------
// Texto de cada etapa para o cliente: o que aconteceu e o que vem depois
const MSG_CLIENTE: Record<string, { titulo: string; texto: string }> = {
  documentacao_pendente: { titulo: "Falta documento no seu processo", texto: "Falta algum documento para seguir com o seu financiamento. Veja no app o que está pendente: os seus documentos você mesmo pode enviar." },
  cadastro_ok: { titulo: "Documentos conferidos", texto: "Os seus documentos foram conferidos pela CCA. Agora montamos a sua proposta de financiamento para a Caixa." },
  em_analise: { titulo: "Seu processo está na Caixa", texto: "A sua proposta foi enviada para a análise de crédito da Caixa Econômica Federal. Avisamos assim que houver resposta." },
  cliente_aprovado: { titulo: "🎉 Parabéns! Crédito aprovado no sistema da Caixa", texto: "Parabéns! O seu crédito imobiliário foi aprovado pelo sistema da Caixa Econômica Federal. Essa é a primeira aprovação. A segunda é a entrevista com o gerente da Caixa: avisamos a data, a hora e o endereço assim que estiver agendada." },
  assinaturas: { titulo: "🎉 Entrevista aprovada!", texto: "Parabéns! O gerente da Caixa aprovou a sua entrevista. Era a segunda e última aprovação: o seu financiamento está aprovado. Agora a CCA prepara os formulários do seu processo e envia para você e o vendedor assinarem pelo gov.br. Assine assim que receber." },
  conformidade: { titulo: "Formulários assinados", texto: "Todos os formulários foram assinados. A CCA enviou o dossiê do seu processo ao setor de Conformidade da Caixa. Avisamos assim que for aprovado." },
  minuta_em_maos: { titulo: "Seu contrato está pronto", texto: "O seu contrato está pronto para assinatura. O(a) seu(sua) corretor(a) vai combinar a assinatura com você." },
  contrato_assinado: { titulo: "Contrato assinado", texto: "Contrato assinado! Agora ele segue para o cartório de registro de imóveis." },
  registro_cartorio: { titulo: "Contrato no cartório", texto: "O seu contrato está no cartório de registro de imóveis. Depois do registro, o imóvel passa para o seu nome." },
  conformidade_final: { titulo: "Registro concluído", texto: "Registro concluído. A CCA faz a conferência final na Caixa para liberar o crédito." },
  credito_liberado: { titulo: "🎉 Financiamento concluído", texto: "Tudo concluído! A Caixa liberou o crédito para o vendedor. Parabéns pelo seu novo imóvel!" },
  entrevista_reprovada: { titulo: "Resultado da sua entrevista", texto: "Infelizmente o gerente da Caixa não aprovou a sua entrevista e o processo foi encerrado. A entrevista fica registrada no sistema da Caixa, e uma nova tentativa só é possível depois de 180 dias. Fale com o(a) seu(sua) corretor(a) ou com a CCA para entender os próximos passos." },
  processo_encerrado: { titulo: "Seu processo foi encerrado", texto: "Na consulta inicial do seu CPF no sistema da Caixa apareceu um impedimento (restrição ou falta de QV) e o processo foi encerrado. Fale com o seu corretor para entender os próximos passos." },
};

// Quem é o cliente com acesso ao portal (só quando a imobiliária ou o corretor ligou o acesso)
async function destinosClienteFinal(db: SupabaseClient, clienteId: string): Promise<Destino[]> {
  const { data: ligado } = await db.rpc("acesso_cliente_ligado", { p_cliente: clienteId });
  if (!ligado) return [];
  const { data: pessoas } = await db.from("perfis").select("id, nome, email, whatsapp").eq("cliente_id", clienteId).eq("papel", "cliente").eq("ativo", true);
  return (pessoas || []).map((p: any) => ({ tipo: "pessoa" as const, nome: p.nome, telefone: p.whatsapp || "", usuarios: [p.id], usuarioId: p.id, aceita: true, emails: p.email ? [p.email] : [] }));
}

// Nome curto da etapa no WhatsApp do cliente (modelo cca_etapa_cliente)
const ETAPA_WHATS: Record<string, string> = {
  documentacao_pendente: "documentação pendente", cliente_aprovado: "crédito aprovado pela Caixa", assinaturas: "entrevista aprovada, agora as assinaturas no gov.br",
  minuta_em_maos: "contrato pronto para assinatura", credito_liberado: "crédito liberado, financiamento concluído", entrevista_reprovada: "entrevista não aprovada, processo encerrado",
  processo_encerrado: "processo encerrado na consulta inicial do CPF",
};
// Etapas-chave: também vão pelo WhatsApp (as demais só por notificação do app e e-mail)
const ETAPAS_CHAVE = new Set(["documentacao_pendente", "cliente_aprovado", "assinaturas", "minuta_em_maos", "credito_liberado", "entrevista_reprovada", "processo_encerrado"]);
async function avisarClienteDaEtapa(db: SupabaseClient, cfg: Config, ev: any, cliente: any, para: string) {
  const m = MSG_CLIENTE[para];
  if (!m) return 0;
  let n = 0;
  for (const dest of await destinosClienteFinal(db, cliente.id)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "cliente_etapa", m.titulo, `${cumprimento(dest.nome)}! ${m.texto}`, `${cfg.base}?ir=meu`, "Ver meu financiamento", ETAPAS_CHAVE.has(para),
      { modelo: "cca_etapa_cliente", params: [cumprimento(dest.nome), ETAPA_WHATS[para] || m.titulo.replace(/^\P{L}+/u, "")] });
  }
  return n;
}

// Entrevista agendada pela CCA: o cliente recebe data, hora, gerente, agência e endereço; o corretor também é avisado
async function processarEntrevistaAgendada(db: SupabaseClient, cfg: Config, ev: any) {
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, entrevista_em, entrevista_modalidade, entrevista_local, entrevista_agencia, entrevista_gerente, entrevista_endereco").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente?.entrevista_em) return 0;
  const d = new Date(cliente.entrevista_em);
  const tz = { timeZone: "America/Sao_Paulo" };
  const data = d.toLocaleDateString("pt-BR", { ...tz, weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" });
  const video = cliente.entrevista_modalidade === "video";
  const onde = cliente.entrevista_endereco || cliente.entrevista_local;
  const detalhes = [`Data: ${data}`, `Hora: ${hora}`, video ? "Por videoconferência" : "Presencial, na agência",
    cliente.entrevista_gerente ? `Gerente: ${cliente.entrevista_gerente}` : "", cliente.entrevista_agencia ? `Agência: ${cliente.entrevista_agencia}` : "",
    onde ? `${video ? "Link ou local" : "Endereço"}: ${onde}` : ""].filter(Boolean).join("\n");
  let n = 0;
  const local = video ? "videoconferência (link no app)" : [cliente.entrevista_agencia, onde].filter(Boolean).join(", ") || "agência da Caixa (ver no app)";
  const wEnt = (nome: string): Whats => ({ modelo: "cca_entrevista_agendada", params: [cumprimento(nome), cliente.nome, d.toLocaleDateString("pt-BR", { ...tz, weekday: "long", day: "2-digit", month: "long" }), hora, local] });
  for (const dest of await destinosClienteFinal(db, cliente.id)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "entrevista", "Sua entrevista na Caixa foi agendada",
      `${cumprimento(dest.nome)}! A sua entrevista com o gerente da Caixa foi agendada:\n${detalhes}\n${video ? "" : "Leve documento original com foto e chegue 15 minutos antes."}`.trim(), `${cfg.base}?ir=meu`, "Ver meu financiamento", true, wEnt(dest.nome));
  }
  for (const dest of await destinosDoCliente(db, cliente)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "entrevista", `Entrevista agendada: ${cliente.nome}`,
      `${cumprimento(dest.nome)}! A CCA agendou a entrevista de ${cliente.nome} com o gerente da Caixa:\n${detalhes}`, `${cfg.base}?c=${cliente.id}`, "Ver no Portal", true, wEnt(dest.nome));
  }
  return n;
}

// Etapa Assinaturas: lembrete de formulário ainda sem assinar (WhatsApp, é atraso) e aviso à CCA quando tudo foi assinado
async function processarAssinaturas(db: SupabaseClient, cfg: Config, ev: any) {
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, status, rascunho").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente || cliente.rascunho || cliente.status !== "assinaturas") return 0;
  const url = `${cfg.base}?c=${cliente.id}`;
  let n = 0;
  if (ev.tipo === "mo_completo") {
    const dest = await destinoEquipe(db, cfg);
    return await avisoAppEmail(db, cfg, ev, cliente, dest, "mo_completo", `Tudo assinado: ${cliente.nome}`,
      `Todos os formulários de ${cliente.nome} foram assinados e anexados. Já pode montar o dossiê e enviar ao setor de Conformidade da Caixa.`, url, "Abrir no painel");
  }
  const { data: pend } = await db.rpc("mo_pendentes", { p_cliente: cliente.id });
  if (!pend) return 0;
  for (const dest of await destinosDoCliente(db, cliente)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "lembrete_assinaturas", `Falta assinar: ${cliente.nome}`,
      `${cumprimento(dest.nome)}! O processo de ${cliente.nome} está parado esperando assinaturas no gov.br: ${pend}. Confira no Portal quem já assinou e anexe os PDFs assinados.`, url, "Ver no Portal", true,
      { modelo: "cca_assinatura_pendente", params: [cumprimento(dest.nome), cliente.nome, pend] });
  }
  for (const dest of await destinosClienteFinal(db, cliente.id)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "lembrete_assinaturas", "Falta assinar no gov.br",
      `${cumprimento(dest.nome)}! O seu financiamento está esperando a assinatura dos formulários da Caixa no gov.br. Assine assim que puder: o processo só segue com todas as assinaturas. Qualquer dúvida, fale com o(a) seu(sua) corretor(a).`, `${cfg.base}?ir=meu`, "Ver meu financiamento", true,
      { modelo: "cca_assinatura_pendente", params: [cumprimento(dest.nome), cliente.nome, pend] });
  }
  return n;
}

// Nova tentativa (gancho de venda): cliente encerrado que já pode tentar de novo (entrevista reprovada há 180 dias ou QV de volta).
// Corretor avulso: ele. Cliente de imobiliária: a imobiliária (o corretor pode ter saído) e o corretor, se ainda estiver ativo.
async function processarNovaTentativa(db: SupabaseClient, cfg: Config, ev: any) {
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, status, barreira").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente || !["entrevista_reprovada", "processo_encerrado"].includes(cliente.status)) return 0;
  const motivo = cliente.status === "entrevista_reprovada" ? "a entrevista com o gerente foi reprovada e já se passaram os 180 dias"
    : cliente.barreira === "sem_qv" ? "o cliente estava sem QV e a data da nova QV chegou" : "o processo foi encerrado e já pode ser retomado";
  const { data: corretor } = await db.from("perfis").select("id, nome, email, whatsapp, aceita_whatsapp, ativo").eq("id", cliente.corretor_id).maybeSingle();
  const dests: Destino[] = [];
  if (corretor?.ativo) dests.push({ tipo: "corretor", nome: corretor.nome || "", telefone: corretor.whatsapp || "", usuarios: [corretor.id], usuarioId: corretor.id, aceita: corretor.aceita_whatsapp !== false, emails: corretor.email ? [corretor.email] : [] });
  if (cliente.imobiliaria_id) {
    const { data: imob } = await db.from("imobiliarias").select("id, nome, email, whatsapp").eq("id", cliente.imobiliaria_id).maybeSingle();
    if (imob) {
      const { data: gestores } = await db.from("perfis").select("id, email").eq("imobiliaria_id", imob.id).eq("papel", "gestor_imobiliaria").eq("ativo", true);
      dests.push({ tipo: "imobiliaria", nome: imob.nome, telefone: imob.whatsapp || "", usuarios: (gestores || []).map((g: any) => g.id), usuarioId: null, aceita: true,
        emails: [imob.email, ...(gestores || []).map((g: any) => g.email)].filter(Boolean) });
    }
  }
  const url = `${cfg.base}?c=${cliente.id}`;
  let n = 0;
  for (const dest of dests) {
    const quem = dest.tipo === "imobiliaria" && corretor?.nome ? ` O corretor que atendeu foi ${corretor.nome}${corretor.ativo ? "" : " (não está mais ativo no app)"}.` : "";
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "nova_tentativa", `Nova tentativa: ${cliente.nome}`,
      `${cumprimento(dest.nome)}! ${cliente.nome} pode tentar uma nova aprovação: ${motivo}.${quem} Que tal entrar em contato? A CCA faz a nova análise.`, url, "Ver no Portal", true,
      { modelo: "cca_status_atualizado", params: [cumprimento(dest.nome), cliente.nome, "nova tentativa de aprovação já pode ser feita"] });
  }
  return n;
}

// Cliente com acesso ao portal enviou documento: avisa o corretor e/ou a imobiliária (um aviso a cada 10 min por cliente)
async function processarDocDoCliente(db: SupabaseClient, cfg: Config, ev: any) {
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id, rascunho").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente || cliente.rascunho) return 0;
  const codigo = ev.dados?.tipo_codigo || "";
  const { data: tipo } = await db.from("tipos_documento").select("nome").eq("codigo", codigo).maybeSingle();
  const doc = tipo?.nome || "um documento";
  const url = `${cfg.base}?c=${cliente.id}`;
  let n = 0;
  for (const dest of await destinosDoCliente(db, cliente)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "doc_do_cliente", `${primeiroNome(cliente.nome)} enviou documento`,
      `${cumprimento(dest.nome)}! ${cliente.nome} enviou pelo portal: ${doc}. Se mandar outros em seguida, eles aparecem direto no processo. A CCA já vai conferir.`, url, "Ver no Portal");
  }
  return n;
}

// Pré-conferência por IA viu problema claro: avisa o corretor para trocar o arquivo antes da equipe conferir
async function processarIaAlerta(db: SupabaseClient, cfg: Config, ev: any) {
  const d = ev.dados || {};
  const { data: cliente } = await db.from("clientes").select("id, nome, corretor_id, imobiliaria_id").eq("id", ev.cliente_id).maybeSingle();
  if (!cliente) return 0;
  const { data: doc } = await db.from(d.tabela === "documentos_vendedor" ? "documentos_vendedor" : "documentos").select("situacao").eq("id", d.documento_id).maybeSingle();
  if (doc && doc.situacao !== "em_conferencia") return 0; // a equipe já conferiu
  const url = `${cfg.base}?c=${cliente.id}`;
  let n = 0;
  for (const dest of await destinosDoCliente(db, cliente)) {
    n += await avisoAppEmail(db, cfg, ev, cliente, dest, "ia_alerta", `Confira o documento: ${cliente.nome}`,
      `${cumprimento(dest.nome)}! A conferência automática viu um possível problema em ${d.documento || "um documento"} de ${cliente.nome}: ${d.resumo || "verifique o arquivo"}.\nSe puder, envie um arquivo melhor pelo Portal. A equipe da CCA ainda vai conferir.`, url, "Substituir no Portal");
  }
  return n;
}

// Aviso geral (sem cliente): notificação do app e e-mail; WhatsApp só quando há um modelo específico (whats)
async function avisarGeral(db: SupabaseClient, cfg: Config, ev: any, dests: Destino[], titulo: string, texto: (nome: string) => string, rota: string, soPush = false, botaoEmail = "Abrir no Portal", whats?: (nome: string) => Whats) {
  const url = `${cfg.base}?ir=${encodeURIComponent(rota)}`;
  let n = 0;
  for (const dest of dests) {
    let ref: string | undefined; let erro: string | null = null;
    try { ref = await enviarPush(db, cfg, dest.usuarios, titulo, texto(dest.nome), url); n++; } catch (e) { erro = (e as Error).message; }
    await registrar(db, { cliente_id: null, destino_id: dest.usuarioId, telefone: null, tipo: "aviso", canal: "push", evento_id: ev.id,
      texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto(dest.nome)}`, situacao: erro ? "erro" : "enviada", erro, referencia: ref || null, enviada_em: erro ? null : new Date().toISOString() });
    if (cfg.canal === "whatsapp" && !soPush && whats && soDigitos(dest.telefone)) {
      let refW: string | undefined; let erroW: string | null = null;
      try {
        if (!dest.aceita) throw new Error("Não aceitou avisos no WhatsApp");
        const w = whats(dest.nome);
        refW = await enviarWhats(cfg, dest.telefone, w.modelo, w.params, encodeURIComponent(rota)); n++;
      } catch (e) { erroW = (e as Error).message; }
      await registrar(db, { cliente_id: null, destino_id: dest.usuarioId, telefone: dest.telefone, tipo: "aviso", canal: "whatsapp", evento_id: ev.id,
        texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto(dest.nome)}`, situacao: erroW ? "erro" : "enviada", erro: erroW, referencia: refW || null, enviada_em: erroW ? null : new Date().toISOString() });
    }
    if (cfg.email && emailPronto(cfg) && dest.emails.length) {
      let refE: string | undefined; let erroE: string | null = null;
      try { refE = await enviarEmail(cfg, dest.emails, titulo, texto(dest.nome), url, botaoEmail); n++; } catch (e) { erroE = (e as Error).message; }
      await registrar(db, { cliente_id: null, destino_id: dest.usuarioId, telefone: null, tipo: "aviso", canal: "email", evento_id: ev.id,
        texto: texto(dest.nome), situacao: erroE ? "erro" : "enviada", erro: erroE, referencia: refE || null, enviada_em: erroE ? null : new Date().toISOString() });
    }
  }
  return n;
}

async function destinoEquipe(db: SupabaseClient, cfg: Config): Promise<Destino> {
  const { data: equipe } = await db.from("perfis").select("id").in("papel", ["equipe_cca", "admin"]).eq("ativo", true);
  return { tipo: "pessoa", nome: "Equipe CCA", telefone: "", usuarios: (equipe || []).map((x: any) => x.id), usuarioId: null, aceita: true, emails: cfg.responderPara ? [cfg.responderPara] : [] };
}

// Vídeo de identidade do consumidor final: chegou (avisa a equipe) / foi conferido (avisa a pessoa)
async function processarVerificacao(db: SupabaseClient, cfg: Config, ev: any) {
  const d = ev.dados || {};
  const { data: pessoa } = await db.from("perfis").select("id, nome, email, whatsapp, aceita_whatsapp").eq("id", d.perfil_id).maybeSingle();
  if (!pessoa) return 0;
  if (d.fase === "enviada") {
    return await avisarGeral(db, cfg, ev, [await destinoEquipe(db, cfg)], `Vídeo para conferir: ${pessoa.nome}`,
      () => `${pessoa.nome} enviou o vídeo de identidade para conferência. Abra Verificações no painel.`, "painel/verificacoes", true, "Abrir no painel");
  }
  const dest: Destino = { tipo: "pessoa", nome: pessoa.nome, telefone: pessoa.whatsapp || "", usuarios: [pessoa.id], usuarioId: pessoa.id, aceita: pessoa.aceita_whatsapp !== false, emails: pessoa.email ? [pessoa.email] : [] };
  return d.aprovada
    ? await avisarGeral(db, cfg, ev, [dest], "Identidade confirmada", (n) => `${cumprimento(n)}! A CCA confirmou a sua identidade. Já pode preencher o cadastro do seu financiamento no app.`, "verificacao", false, "Preencher cadastro",
      (n) => ({ modelo: "cca_identidade_conferida", params: [cumprimento(n), "identidade confirmada"] }))
    : await avisarGeral(db, cfg, ev, [dest], "Vídeo não aprovado", (n) => `${cumprimento(n)}! Não conseguimos confirmar o seu vídeo: ${d.motivo || "veja o motivo no app"}. Grave outro pelo app.`, "verificacao", false, "Enviar outro vídeo",
      (n) => ({ modelo: "cca_identidade_conferida", params: [cumprimento(n), `vídeo não aprovado (${String(d.motivo || "veja o motivo no app").slice(0, 80)}), grave outro`] }));
}

// Engenharia: cada fase avisa quem precisa agir
const TIPOS_ENG: Record<string, string> = { novo_fgts: "imóvel novo (FGTS)", novo_sbpe: "imóvel novo (SBPE)", usado: "imóvel usado", atc: "terreno e construção (ATC)", ctp: "construção em terreno próprio (CTP)" };
const DOCS_ENG: Record<string, string> = { ART: "ART", SINTESE: "Síntese memorial", MATRICULA: "Matrícula", IPTU: "Espelho do IPTU", ALVARA: "Alvará", HABITESE: "Habite-se", PROJETO: "Projeto", CNO_SCPO: "CNO e SCPO", CREA_CAU: "CREA/CAU", PCI: "PCI", PEPT_DOC: "Documento da pendência (PEPT)" };
async function processarEngenharia(db: SupabaseClient, cfg: Config, ev: any) {
  const d = ev.dados || {};
  const { data: e } = await db.from("engenharias").select("id, tipo, criado_por, imobiliaria_id, vendedor:vendedores(nome)").eq("id", d.engenharia_id).maybeSingle();
  if (!e) return 0;
  const vend = (e as any).vendedor?.nome || "o vendedor";
  const { data: autor } = await db.from("perfis").select("nome").eq("id", e.criado_por).maybeSingle();
  const quem = autor?.nome || "O corretor";
  if (["enviada", "pago", "contestou", "doc_adicionado"].includes(d.fase)) {
    let novos = "";
    if (d.fase === "doc_adicionado") {
      const { data: docs } = await db.from("engenharia_docs").select("tipo").eq("engenharia_id", e.id).eq("enviado_por", e.criado_por)
        .gt("enviado_em", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      novos = [...new Set((docs || []).map((x: any) => DOCS_ENG[x.tipo] || x.tipo))].join(", ");
    }
    const txt = d.fase === "doc_adicionado" ? `${quem} anexou documento${novos.includes(",") ? "s" : ""} na engenharia de ${vend}${novos ? `: ${novos}` : ""}. Confira antes de cadastrar na Caixa.`
      : d.fase === "enviada" ? `${quem} pediu uma engenharia (${TIPOS_ENG[e.tipo] || e.tipo}) para ${vend}. Documentos prontos para cadastrar na Caixa.`
      : d.fase === "pago" ? `${quem} informou o pagamento do boleto da engenharia de ${vend}. Aguardando a OS.`
      : `${quem} pediu ${d.tipo === "segunda_instancia" ? "segunda instância" : "reavaliação"} da engenharia de ${vend}.`;
    return await avisarGeral(db, cfg, ev, [await destinoEquipe(db, cfg)], `Engenharia: ${vend}`, () => txt, `painel/engenharia/${e.id}`, true, "Abrir no painel");
  }
  const dests = await destinosDoCliente(db, { corretor_id: e.criado_por, imobiliaria_id: e.imobiliaria_id });
  const txt = (n: string) => d.fase === "boleto" ? `${cumprimento(n)}! O boleto da engenharia de ${vend} já está no app. Pague e anexe o comprovante.`
    : d.fase === "os_recebida" ? `${cumprimento(n)}! A OS da engenharia de ${vend} chegou. Agora é aguardar a vistoria da Caixa.`
    : d.aprovado ? `${cumprimento(n)}! O laudo da engenharia de ${vend} foi aprovado. Veja o valor e a validade no app.`
    : `${cumprimento(n)}! O laudo da engenharia de ${vend} teve pendências (PEPT). Anexe os documentos que faltam pelo app.`;
  const fase = d.fase === "boleto" ? "boleto disponível para pagamento" : d.fase === "os_recebida" ? "OS recebida, aguardando a vistoria da Caixa"
    : d.aprovado ? "laudo aprovado" : "laudo com pendências (PEPT)";
  return await avisarGeral(db, cfg, ev, dests, `Engenharia: ${vend}`, txt, `engenharia/${e.id}`, false, "Abrir a engenharia",
    (n) => ({ modelo: "cca_engenharia_atualizada", params: [cumprimento(n), vend, fase] }));
}

async function processar(db: SupabaseClient, cfg: Config) {
  const { data: eventos, error } = await db.rpc("pegar_eventos_aviso", { p_limite: 20 });
  if (error) throw new Error(error.message);
  let enviados = 0;
  for (const ev of eventos || []) {
    try {
      if (ev.tipo === "convite") {
        // Link de acesso só sai automático pelo WhatsApp (push não chega a quem ainda não entrou)
        const d = ev.dados || {};
        if (cfg.canal === "whatsapp" && d.whatsapp && d.token_hash) {
          let ref: string | undefined; let erro: string | null = null;
          try { ref = await enviarWhats(cfg, d.whatsapp, "cca_link_acesso", [cumprimento(d.nome)], `${d.tipo}.${d.token_hash}`); enviados++; }
          catch (e) { erro = (e as Error).message; }
          await registrar(db, { destino_id: d.usuario_id || null, telefone: d.whatsapp, tipo: "convite", canal: "whatsapp", evento_id: ev.id,
            texto: `${cumprimento(d.nome)}! Seu link de acesso ao Portal do Corretor foi enviado.`, situacao: erro ? "erro" : "enviada",
            erro, referencia: ref || null, enviada_em: erro ? null : new Date().toISOString() });
        }
        await db.from("eventos").update({ processado: true, dados: { ...d, token_hash: null } }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "verificacao" || ev.tipo === "engenharia") {
        enviados += ev.tipo === "verificacao" ? await processarVerificacao(db, cfg, ev) : await processarEngenharia(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "doc_do_cliente") {
        enviados += await processarDocDoCliente(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "conversa" || ev.tipo === "lembrete_docs" || ev.tipo === "ia_alerta") {
        enviados += ev.tipo === "conversa" ? await processarConversa(db, cfg, ev)
          : ev.tipo === "ia_alerta" ? await processarIaAlerta(db, cfg, ev) : await processarLembrete(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "mo_completo" || ev.tipo === "lembrete_assinaturas") {
        enviados += await processarAssinaturas(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "nova_tentativa") {
        enviados += await processarNovaTentativa(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      if (ev.tipo === "entrevista_agendada") {
        enviados += await processarEntrevistaAgendada(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      const montado = await avisoDoEvento(db, cfg, ev);
      // Mudança de etapa: o cliente com acesso ao portal também recebe (texto próprio, sem termos internos)
      if (montado && ev.tipo === "status_mudou" && ev.dados?.para && ev.dados?.para !== ev.dados?.de) {
        enviados += await avisarClienteDaEtapa(db, cfg, ev, montado.cliente, ev.dados.para);
      }
      if (montado) {
        const { cliente, aviso } = montado;
        const importante = aviso.tipoMsg === "recusa" || (ev.tipo === "status_mudou" && ev.dados?.para !== ev.dados?.de && ETAPAS_CHAVE.has(ev.dados?.para));
        for (const dest of await destinosDoCliente(db, cliente)) {
          let ref: string | undefined; let erro: string | null = null;
          try { ref = await enviarPush(db, cfg, dest.usuarios, aviso.titulo, aviso.texto(dest.nome), aviso.url); enviados++; } catch (e) { erro = (e as Error).message; }
          await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: null,
            tipo: aviso.tipoMsg, canal: "push", evento_id: ev.id, texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${aviso.texto(dest.nome)}`,
            situacao: erro ? "erro" : "enviada", erro, referencia: ref || null, enviada_em: erro ? null : new Date().toISOString() });
          if (importante && cfg.canal === "whatsapp" && soDigitos(dest.telefone)) {
            let refW: string | undefined; let erroW: string | null = null;
            try {
              if (!dest.aceita) throw new Error("Corretor não aceitou avisos no WhatsApp");
              refW = await enviarWhats(cfg, dest.telefone, aviso.modelo, aviso.params(dest.nome), aviso.botao); enviados++;
            } catch (e) { erroW = (e as Error).message; }
            await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: dest.telefone,
              tipo: aviso.tipoMsg, canal: "whatsapp", evento_id: ev.id, texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${aviso.texto(dest.nome)}`,
              situacao: erroW ? "erro" : "enviada", erro: erroW, referencia: refW || null, enviada_em: erroW ? null : new Date().toISOString() });
          }
          // Também por e-mail (se ligado em Configurações)
          if (cfg.email && emailPronto(cfg) && dest.emails.length) { // sem caixa configurada ainda: não tenta
            let refE: string | undefined; let erroE: string | null = null;
            try { refE = await enviarEmail(cfg, dest.emails, aviso.titulo, aviso.texto(dest.nome), aviso.url, aviso.botaoEmail); enviados++; }
            catch (e) { erroE = (e as Error).message; }
            await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: null,
              tipo: aviso.tipoMsg, canal: "email", evento_id: ev.id, texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${aviso.texto(dest.nome)}`,
              situacao: erroE ? "erro" : "enviada", erro: erroE, referencia: refE || null, enviada_em: erroE ? null : new Date().toISOString() });
          }
        }
      }
      await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
    } catch (e) {
      await db.from("eventos").update({ erro: (e as Error).message, processando_em: null }).eq("id", ev.id);
    }
  }
  return { eventos: (eventos || []).length, enviados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const corpo = await req.json().catch(() => ({}));
    const cfg = await carregarConfig(db);

    // Chamada interna (gatilho do banco)
    const seg = req.headers.get("x-segredo");
    if (seg) {
      const { data } = await db.from("integracoes").select("valor").eq("chave", "segredo_interno").single();
      if (!data || data.valor !== seg) return resposta({ erro: "Não autorizado" }, 401);
      return resposta(await processar(db, cfg));
    }

    // Chamadas do ADM
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await db.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);
    const { data: eu } = await db.from("perfis").select("id, nome, email, papel, ativo, whatsapp").eq("id", quem.user.id).single();
    if (!eu?.ativo) return resposta({ erro: "Acesso desativado" }, 403);

    // Confirmação de e-mail e celular com código (qualquer usuário, para o próprio cadastro)
    if (corpo.acao === "enviar_codigo" || corpo.acao === "confirmar_codigo") {
      const canal = corpo.canal === "email" ? "email" : "whatsapp";
      const destino = canal === "email" ? String(eu.email || quem.user.email || "").trim().toLowerCase() : soDigitos(eu.whatsapp);
      if (!destino) return resposta({ erro: canal === "email" ? "Cadastro sem e-mail" : "Cadastro sem celular" }, 400);
      if (corpo.acao === "enviar_codigo") {
        const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await db.from("contato_codigos").select("id", { count: "exact", head: true }).eq("perfil_id", eu.id).eq("canal", canal).gte("criado_em", desde);
        if ((count || 0) >= 5) return resposta({ erro: "Muitos códigos pedidos. Espere um pouco e tente de novo." }, 429);
        const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
        if (canal === "email") {
          await enviarEmail(cfg, [destino], "Seu código de confirmação", `${cumprimento(eu.nome)}! O seu código para confirmar o e-mail no app da Andrade Almeida CCA é: ${codigo}\nEle vale por 10 minutos. Se não foi você que pediu, ignore este e-mail.`, cfg.base, "Abrir o app");
        } else {
          await enviarCodigoWhats(cfg, destino, codigo);
        }
        await db.from("contato_codigos").insert({ perfil_id: eu.id, canal, destino, codigo_hash: await hashCodigo(eu.id, codigo), expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
        return resposta({ ok: true, destino: canal === "email" ? destino : `final ${destino.slice(-4)}` });
      }
      const codigo = soDigitos(corpo.codigo);
      const { data: ult } = await db.from("contato_codigos").select("*").eq("perfil_id", eu.id).eq("canal", canal).is("usado_em", null).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (!ult || ult.destino !== destino) return resposta({ erro: "Peça um código primeiro." }, 400);
      if (new Date(ult.expira_em).getTime() < Date.now()) return resposta({ erro: "Código vencido. Peça outro." }, 400);
      if (ult.tentativas >= 5) return resposta({ erro: "Muitas tentativas. Peça outro código." }, 400);
      if (ult.codigo_hash !== await hashCodigo(eu.id, codigo)) {
        await db.from("contato_codigos").update({ tentativas: ult.tentativas + 1 }).eq("id", ult.id);
        return resposta({ erro: "Código incorreto. Confira e digite de novo." }, 400);
      }
      await db.from("contato_codigos").update({ usado_em: new Date().toISOString() }).eq("id", ult.id);
      await db.from("perfis").update(canal === "email" ? { email_verificado_em: new Date().toISOString() } : { whatsapp_verificado_em: new Date().toISOString() }).eq("id", eu.id);
      return resposta({ ok: true });
    }

    if (eu.papel !== "admin") return resposta({ erro: "Somente administradores" }, 403);

    if (corpo.acao === "processar") return resposta(await processar(db, cfg));

    if (corpo.acao === "testar") {
      if (corpo.canal === "email") {
        const para = String(corpo.email || eu.email || quem.user.email || "");
        const r = await enviarEmail(cfg, [para], "Teste de aviso por e-mail",
          `${cumprimento(eu.nome)}! Os avisos por e-mail do Portal do Corretor estão funcionando.\nÉ assim que o corretor vai receber os avisos de cadastro, status e documentos.`, cfg.base);
        return resposta({ ok: true, detalhe: `E-mail enviado para ${r}. Confira a caixa de entrada (e o spam, na primeira vez).` });
      }
      const canal = corpo.canal === "whatsapp" ? "whatsapp" : corpo.canal === "push" ? "push" : cfg.canal;
      if (canal === "whatsapp") {
        const id = await enviarWhats(cfg, corpo.telefone || eu.whatsapp, "cca_status_atualizado", [cumprimento(eu.nome), "Cliente de Teste", "Teste de aviso"], "teste");
        return resposta({ ok: true, detalhe: `Mensagem enviada (${id || "sem id"}). Confira o WhatsApp ${corpo.telefone || eu.whatsapp}.` });
      }
      const r = await enviarPush(db, cfg, [eu.id], "Teste de aviso", `${cumprimento(eu.nome)}! As notificações do Portal do Corretor estão funcionando.`, cfg.base);
      return resposta({ ok: true, detalhe: `Notificação enviada para ${r}.` });
    }

    if (corpo.acao === "criar_modelos" || corpo.acao === "modelos") {
      if (!cfg.token || !cfg.wabaId) return resposta({ erro: "Configure o token e o ID da conta do WhatsApp Business (WABA)" }, 400);
      const resultado: unknown[] = [];
      if (corpo.acao === "criar_modelos") {
        for (const m of modelos(cfg.base)) {
          const r = await fetch(`${GRAPH}/${cfg.wabaId}/message_templates`, {
            method: "POST", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" }, body: JSON.stringify(m),
          });
          const j = await r.json().catch(() => ({}));
          resultado.push({ nome: m.name, ok: r.ok, situacao: j?.status || null, erro: r.ok ? null : (j?.error?.error_user_msg || j?.error?.message || `erro ${r.status}`) });
        }
      }
      const r = await fetch(`${GRAPH}/${cfg.wabaId}/message_templates?fields=name,status,category,rejected_reason&limit=100`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return resposta({ erro: j?.error?.message || `Meta respondeu ${r.status}`, criacao: resultado }, 400);
      const lista = (j.data || []).filter((t: any) => String(t.name).startsWith("cca_"))
        .map((t: any) => ({ nome: t.name, situacao: t.status, categoria: t.category, motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null }));
      return resposta({ criacao: resultado, modelos: lista });
    }
    return resposta({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
