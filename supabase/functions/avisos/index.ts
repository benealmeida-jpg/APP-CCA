// Avisos automáticos do APP CCA.
// Lê a fila de eventos (cadastro enviado, status, documento recusado, convite), decide para quem vai
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
    { name: "cca_link_acesso", language: "pt_BR", category: "UTILITY",
      components: [...comum("👋 {{1}}! Seu acesso ao Portal do Corretor da Andrade Almeida CCA está pronto. Toque no botão para criar sua senha. O link vale por pouco tempo e funciona uma vez só.",
        ["Bom dia, João"]),
        botao("Criar minha senha", "?acesso=", "invite.exemplo")] },
  ];
}

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

  if (ev.tipo === "cliente_enviado") {
    const { data: nec } = await db.rpc("documentos_necessarios_v2", { p_cliente: cliente.id });
    const falta = (nec || []).filter((n: any) => n.regra === "**" && ["pendente", "recusado"].includes(n.situacao))
      .map((n: any) => (n.pessoa_nome && n.pessoa_nome !== nomeCli ? `${n.nome} de ${primeiroNome(n.pessoa_nome)}` : n.nome));
    const pend = falta.length ? `Ainda falta: ${falta.join(", ")}. Sem esse documento o processo não vai para análise.` : "Todos os documentos obrigatórios chegaram.";
    return { cliente, aviso: { tipoMsg: "confirmacao", modelo: "cca_cadastro_recebido", botao: cliente.id, url,
      params: (n) => [cumprimento(n), nomeCli, pend], titulo: "Cadastro recebido",
      texto: (n) => `${cumprimento(n)}! Recebemos o cadastro de ${nomeCli}. ${pend}` } };
  }
  if (ev.tipo === "status_mudou") {
    const { data: st } = await db.from("status_etapas").select("nome").eq("codigo", ev.dados?.para).maybeSingle();
    const nomeSt = st?.nome || ev.dados?.para || "";
    // Mensagem editada pela equipe no painel: vai no lugar do texto padrão (notificação do app e histórico)
    const editada = typeof ev.dados?.mensagem === "string" && ev.dados.mensagem.trim() ? ev.dados.mensagem.replace(/\*/g, "").trim() : null;
    return { cliente, aviso: { tipoMsg: "status", modelo: "cca_status_atualizado", botao: cliente.id, url,
      params: (n) => [cumprimento(n), nomeCli, nomeSt], titulo: `${nomeCli}: ${nomeSt}`,
      texto: (n) => editada || `${cumprimento(n)}! O processo de ${nomeCli} mudou para: ${nomeSt}.` } };
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
      texto: (n) => `${cumprimento(n)}! O documento ${nomeDoc} de ${nomeCli} foi recusado. Motivo: ${motivo}.` } };
  }
  return null;
}

async function registrar(db: SupabaseClient, linha: Record<string, unknown>) {
  await db.from("mensagens").insert(linha);
}

// Envia por notificação do app e por e-mail (conversa e lembretes não têm modelo no WhatsApp) e registra
async function avisoAppEmail(db: SupabaseClient, cfg: Config, ev: any, cliente: any, dest: Destino, tipoMsg: string,
  titulo: string, texto: string, url: string, botaoEmail?: string) {
  let n = 0;
  let ref: string | undefined; let erro: string | null = null;
  try { ref = await enviarPush(db, cfg, dest.usuarios, titulo, texto, url); n++; } catch (e) { erro = (e as Error).message; }
  await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: null, tipo: tipoMsg, canal: "push", evento_id: ev.id,
    texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${texto}`, situacao: erro ? "erro" : "enviada", erro, referencia: ref || null,
    enviada_em: erro ? null : new Date().toISOString() });
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
      `${cumprimento(dest.nome)}! O processo de ${cliente.nome} está parado esperando: ${falta.join(", ")}. Sem esse documento o processo não vai para análise. Anexe pelo Portal do Corretor.`, url, "Anexar no Portal");
  }
  return n;
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
      if (ev.tipo === "conversa" || ev.tipo === "lembrete_docs") {
        enviados += ev.tipo === "conversa" ? await processarConversa(db, cfg, ev) : await processarLembrete(db, cfg, ev);
        await db.from("eventos").update({ processado: true, erro: null }).eq("id", ev.id);
        continue;
      }
      const montado = await avisoDoEvento(db, cfg, ev);
      if (montado) {
        const { cliente, aviso } = montado;
        for (const dest of await destinosDoCliente(db, cliente)) {
          let ref: string | undefined; let erro: string | null = null;
          try {
            if (cfg.canal === "whatsapp") {
              if (!dest.aceita) throw new Error("Corretor não aceitou avisos no WhatsApp");
              ref = await enviarWhats(cfg, dest.telefone, aviso.modelo, aviso.params(dest.nome), aviso.botao);
            } else {
              ref = await enviarPush(db, cfg, dest.usuarios, aviso.titulo, aviso.texto(dest.nome), aviso.url);
            }
            enviados++;
          } catch (e) { erro = (e as Error).message; }
          await registrar(db, { cliente_id: cliente.id, destino_id: dest.usuarioId, telefone: dest.telefone || null,
            tipo: aviso.tipoMsg, canal: cfg.canal, evento_id: ev.id, texto: `${dest.tipo === "imobiliaria" ? `[${dest.nome}] ` : ""}${aviso.texto(dest.nome)}`,
            situacao: erro ? "erro" : "enviada", erro, referencia: ref || null, enviada_em: erro ? null : new Date().toISOString() });
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
    if (!eu?.ativo || eu.papel !== "admin") return resposta({ erro: "Somente administradores" }, 403);

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
