// Convite de acesso ao APP CCA.
// A equipe da CCA convida corretores, gestores de imobiliária e (só ADM) pessoas da equipe.
// Devolve um link de acesso para mandar pelo WhatsApp: a pessoa abre, cria a senha e entra.
// Também gera "novo link de acesso" para quem esqueceu a senha.
// Convite por link (forma principal): a CCA gera o link só com o tipo; a pessoa preenche os próprios dados
// e cria a senha (ações gerar_convite, ver_convite e aceitar_convite).
// verify_jwt desligado: quem abre o convite ainda não tem login. As ações da equipe conferem o login aqui dentro.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PAPEIS = ["corretor", "gestor_imobiliaria", "equipe_cca", "admin"];
const EQUIPE = ["equipe_cca", "admin"];
const TIPOS_CONVITE = ["corretor", "imobiliaria", "equipe_cca", "admin"];
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

async function sha256(texto: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function novoToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cnpjValido(c: string) {
  const d = soDigitos(c);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((t, p, i) => t + Number(d[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
const foneBr = (s: unknown) => { const d = soDigitos(s); if (!d) return null; return `+${d.startsWith("55") ? d : `55${d}`}`; };

// Quem pode convidar o quê. ADM: tudo. Usuário: o que o ADM liberou (equipe só se marcado; ADM nunca).
function podeConvidar(eu: any, tipo: string) {
  if (eu.papel === "admin") return true;
  if (eu.papel !== "equipe_cca") return false;
  const p = eu.permissoes || {};
  if (tipo === "corretor") return p.convidar_corretor !== false;
  if (tipo === "imobiliaria") return p.convidar_imobiliaria !== false;
  if (tipo === "equipe_cca") return p.convidar_equipe === true;
  return false;
}
const ROTULO: Record<string, string> = { corretor: "Corretor", imobiliaria: "Imobiliária", equipe_cca: "Equipe da CCA", admin: "Equipe da CCA (ADM)" };

// Ações públicas (quem abre o link ainda não tem login)
async function acaoPublica(admin: any, corpo: any) {
  const token = String(corpo.token || "");
  if (token.length < 20) return resposta({ erro: "Convite inválido" }, 400);
  const { data: cv } = await admin.from("convites_link").select("*, imobiliaria:imobiliarias(nome)").eq("token_hash", await sha256(token)).maybeSingle();
  if (!cv) return resposta({ erro: "Convite não encontrado. Peça um novo à CCA." }, 404);
  if (cv.cancelado_em) return resposta({ erro: "Este convite foi cancelado. Peça um novo à CCA." }, 410);
  if (cv.usado_em) return resposta({ erro: "Este convite já foi usado. Entre com o seu e-mail e senha." }, 410);
  if (new Date(cv.expira_em) < new Date()) return resposta({ erro: "Este convite expirou. Peça um novo à CCA." }, 410);

  if (corpo.acao === "ver_convite") {
    return resposta({ tipo: cv.tipo, rotulo: ROTULO[cv.tipo], nome: cv.nome, whatsapp: cv.whatsapp, imobiliaria_nome: cv.imobiliaria?.nome || null, expira_em: cv.expira_em });
  }

  // aceitar_convite
  const nome = String(corpo.nome || "").trim();
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");
  if (nome.split(/\s+/).length < 2) return resposta({ erro: "Digite o seu nome completo" }, 400);
  if (!emailValido(email)) return resposta({ erro: "E-mail inválido" }, 400);
  if (senha.length < 8) return resposta({ erro: "A senha precisa ter pelo menos 8 caracteres" }, 400);
  const whatsapp = foneBr(corpo.whatsapp);
  if (!whatsapp || whatsapp.length < 13) return resposta({ erro: "Informe o seu WhatsApp com DDD" }, 400);
  const { data: jaExiste } = await admin.from("perfis").select("id").eq("email", email).maybeSingle();
  if (jaExiste) return resposta({ erro: "Este e-mail já tem acesso ao portal. Use Entrar, ou peça um novo link de acesso à CCA." }, 409);

  let imobiliariaId: string | null = cv.imobiliaria_id || null;
  let papel = cv.tipo === "imobiliaria" ? "gestor_imobiliaria" : cv.tipo;
  if (cv.tipo === "imobiliaria") {
    const im = corpo.imobiliaria || {};
    const cnpj = soDigitos(im.cnpj);
    if (!cnpjValido(cnpj)) return resposta({ erro: "CNPJ da imobiliária inválido" }, 400);
    const { data: existente } = await admin.from("imobiliarias").select("id").eq("cnpj", cnpj).maybeSingle();
    if (existente) imobiliariaId = existente.id;
    else {
      const campos = ["razao_social", "nome_fantasia", "situacao_cadastral", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "telefone", "email"];
      const linha: Record<string, unknown> = { cnpj, nome: String(im.nome || im.nome_fantasia || im.razao_social || "").trim(), whatsapp: foneBr(im.whatsapp) || whatsapp, cnpj_consultado_em: im.razao_social ? new Date().toISOString() : null };
      if (!linha.nome) return resposta({ erro: "Informe o nome da imobiliária" }, 400);
      for (const k of campos) { const v = String(im[k] ?? "").trim(); linha[k] = v ? (["cep", "telefone"].includes(k) ? soDigitos(v) : k === "uf" ? v.toUpperCase().slice(0, 2) : v) : null; }
      const { data: nova, error } = await admin.from("imobiliarias").insert(linha).select("id").single();
      if (error) return resposta({ erro: error.message }, 400);
      imobiliariaId = nova.id;
    }
  }
  if (EQUIPE.includes(papel)) imobiliariaId = null;

  const { data: criado, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, whatsapp } });
  if (e1) return resposta({ erro: /already|registered|exists/i.test(e1.message) ? "Este e-mail já tem acesso ao portal." : e1.message }, 400);
  const uid = criado.user.id;
  const { error: e2 } = await admin.from("perfis").update({ nome, whatsapp, papel, imobiliaria_id: imobiliariaId, ativo: true,
    aceita_whatsapp: corpo.aceita_whatsapp !== false, cpf: soDigitos(corpo.cpf) || null }).eq("id", uid);
  if (e2) return resposta({ erro: e2.message }, 400);
  await admin.from("convites_link").update({ usado_em: new Date().toISOString(), usado_por: uid }).eq("id", cv.id);
  await admin.from("convites").insert({ usuario_id: uid, email, nome, whatsapp, papel, imobiliaria_id: imobiliariaId, tipo: "convite", convidado_por: cv.criado_por });
  await admin.from("acessos_log").insert({ usuario_id: uid, acao: "aceitar_convite", detalhes: { email, papel, convite: cv.id } });
  return resposta({ ok: true, email });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === "ver_convite" || corpo.acao === "aceitar_convite") return await acaoPublica(admin, corpo);

    // Quem está pedindo?
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);
    const { data: eu } = await admin.from("perfis").select("id, papel, ativo, permissoes").eq("id", quem.user.id).single();
    if (!eu?.ativo || !EQUIPE.includes(eu.papel)) return resposta({ erro: "Somente a equipe da CCA convida" }, 403);

    // Gera um convite por link (a pessoa preenche os próprios dados)
    if (corpo.acao === "gerar_convite") {
      const tipo = TIPOS_CONVITE.includes(corpo.tipo) ? corpo.tipo : "";
      if (!tipo) return resposta({ erro: "Escolha quem vai ser convidado" }, 400);
      if (!podeConvidar(eu, tipo)) return resposta({ erro: "Seu perfil não pode fazer este tipo de convite" }, 403);
      const appUrl = String(corpo.app_url || "").replace(/[#?].*$/, "");
      if (!/^https:\/\//.test(appUrl)) return resposta({ erro: "Endereço do app inválido" }, 400);
      const tk = novoToken();
      const { data: cv, error } = await admin.from("convites_link").insert({
        token_hash: await sha256(tk), tipo, imobiliaria_id: tipo === "corretor" ? (corpo.imobiliaria_id || null) : null,
        nome: String(corpo.nome || "").trim() || null, whatsapp: foneBr(corpo.whatsapp), criado_por: eu.id,
      }).select("id, expira_em").single();
      if (error) return resposta({ erro: error.message }, 400);
      await admin.from("acessos_log").insert({ usuario_id: eu.id, acao: "gerar_convite", detalhes: { tipo, convite: cv.id } });
      return resposta({ link: `${appUrl}#/convite?t=${tk}`, id: cv.id, expira_em: cv.expira_em });
    }

    const acao = corpo.acao === "novo_link" ? "novo_link" : "convite";
    const email = String(corpo.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta({ erro: "E-mail inválido" }, 400);
    const appUrl = String(corpo.app_url || "").replace(/[#?].*$/, "");
    if (!/^https:\/\//.test(appUrl)) return resposta({ erro: "Endereço do app inválido" }, 400);

    let usuarioId: string;
    let papel: string;
    let tipoLink: "invite" | "recovery";

    if (acao === "novo_link") {
      // Usuário já existe: link para criar senha nova
      const { data: perfil } = await admin.from("perfis").select("id, papel, nome").eq("email", email).maybeSingle();
      if (!perfil) return resposta({ erro: "Não há usuário com este e-mail" }, 404);
      if (EQUIPE.includes(perfil.papel) && eu.papel !== "admin") return resposta({ erro: "Somente ADM gera link para a equipe" }, 403);
      usuarioId = perfil.id; papel = perfil.papel; tipoLink = "recovery";
    } else {
      papel = PAPEIS.includes(corpo.papel) ? corpo.papel : "corretor";
      if (EQUIPE.includes(papel) && eu.papel !== "admin") return resposta({ erro: "Somente ADM convida pessoas da equipe" }, 403);
      if (!EQUIPE.includes(papel) && eu.papel !== "admin" && (eu.permissoes || {}).ver_imobiliarias_corretores === false) {
        return resposta({ erro: "Seu perfil não convida corretores" }, 403);
      }
      const nome = String(corpo.nome || "").trim();
      if (nome.split(/\s+/).length < 2) return resposta({ erro: "Digite o nome completo" }, 400);
      tipoLink = "invite";
      usuarioId = "";
      // Se já existe, vira "novo link"
      const { data: existente } = await admin.from("perfis").select("id").eq("email", email).maybeSingle();
      if (existente) { usuarioId = existente.id; tipoLink = "recovery"; }
    }

    const { data: link, error } = await admin.auth.admin.generateLink({
      type: tipoLink,
      email,
      options: tipoLink === "invite" ? { data: { nome: corpo.nome, whatsapp: corpo.whatsapp || null } } : undefined,
    });
    if (error) return resposta({ erro: error.message }, 400);
    usuarioId ||= link.user.id;

    if (acao === "convite") {
      const imobiliaria = EQUIPE.includes(papel) ? null : (corpo.imobiliaria_id || null);
      const { error: e2 } = await admin.from("perfis").update({
        nome: String(corpo.nome).trim(), whatsapp: corpo.whatsapp || null, papel, imobiliaria_id: imobiliaria, ativo: true,
      }).eq("id", usuarioId);
      if (e2) return resposta({ erro: e2.message }, 400);
    }
    await admin.from("convites").insert({
      usuario_id: usuarioId, email, nome: corpo.nome || null, whatsapp: corpo.whatsapp || null, papel,
      imobiliaria_id: corpo.imobiliaria_id || null, tipo: acao, convidado_por: eu.id,
    });
    // Se o canal de avisos for WhatsApp, o link também sai automático (função "avisos")
    if (corpo.whatsapp || acao === "novo_link") {
      const { data: alvo } = await admin.from("perfis").select("nome, whatsapp").eq("id", usuarioId).single();
      const fone = corpo.whatsapp || alvo?.whatsapp;
      if (fone) {
        await admin.from("eventos").insert({ tipo: "convite", dados: { nome: corpo.nome || alvo?.nome, whatsapp: fone, usuario_id: usuarioId,
          token_hash: link.properties.hashed_token, tipo: tipoLink } });
      }
    }
    await admin.from("acessos_log").insert({
      usuario_id: eu.id, acao: acao === "convite" ? "convidar" : "novo_link", detalhes: { email, papel },
    });

    // Link direto para o app (não depende da configuração de redirecionamento do Supabase)
    const acesso = `${appUrl}#/acesso?token_hash=${encodeURIComponent(link.properties.hashed_token)}&tipo=${tipoLink}`;
    return resposta({ link: acesso, usuario_id: usuarioId, tipo: tipoLink });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
