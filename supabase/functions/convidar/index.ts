// Convite de acesso ao APP CCA.
// A equipe da CCA convida corretores, gestores de imobiliária e (só ADM) pessoas da equipe.
// Devolve um link de acesso para mandar pelo WhatsApp: a pessoa abre, cria a senha e entra.
// Também gera "novo link de acesso" para quem esqueceu a senha.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

    // Quem está pedindo?
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);
    const { data: eu } = await admin.from("perfis").select("id, papel, ativo, permissoes").eq("id", quem.user.id).single();
    if (!eu?.ativo || !EQUIPE.includes(eu.papel)) return resposta({ erro: "Somente a equipe da CCA convida" }, 403);

    const corpo = await req.json();
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
