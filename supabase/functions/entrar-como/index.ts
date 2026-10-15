// Perfil secundário (Modelo 2): o nível 1 da CCA (CEO) entra como uma pessoa de uma imobiliária parceira
// (CEO, gestor ou corretor) para ver e agir exatamente como ela. Devolve um código de entrada de uso único;
// o app guarda a sessão do nível 1 para voltar depois. Tudo fica registrado no log de acessos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const corpo = await req.json().catch(() => ({}));
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);

    // Volta ao perfil principal: só registra (a sessão do nível 1 fica guardada no aparelho)
    if (corpo.acao === "voltar") {
      await admin.from("acessos_log").insert({ usuario_id: quem.user.id, acao: "voltar_perfil_principal", detalhes: { cca: corpo.cca_id || null } });
      return resposta({ ok: true });
    }

    const { data: eu } = await admin.from("perfis").select("id, nome, papel, ativo, nivel").eq("id", quem.user.id).single();
    if (!eu?.ativo || !["equipe_cca", "admin"].includes(eu.papel) || eu.nivel !== 1) return resposta({ erro: "Somente o CEO da CCA (nível 1)" }, 403);
    const { data: alvo } = await admin.from("perfis").select("id, nome, email, papel, ativo, imobiliaria_id").eq("id", String(corpo.usuario_id || "")).maybeSingle();
    if (!alvo || !alvo.ativo || !alvo.imobiliaria_id || !["corretor", "gestor_imobiliaria"].includes(alvo.papel)) return resposta({ erro: "Pessoa não encontrada" }, 404);

    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: alvo.email });
    if (error) return resposta({ erro: error.message }, 400);
    await admin.from("acessos_log").insert({ usuario_id: eu.id, acao: "entrar_como", detalhes: { usuario: alvo.id, nome: alvo.nome } });
    return resposta({ token_hash: link.properties.hashed_token, nome: alvo.nome, cca_nome: eu.nome, cca_id: eu.id });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
