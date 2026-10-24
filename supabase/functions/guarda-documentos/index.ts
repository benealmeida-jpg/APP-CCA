// Guarda dos documentos (LGPD): apaga os ARQUIVOS dos clientes cujo processo terminou há mais que o prazo
// (parâmetro anos_guarda_documentos, padrão 5). Fica o registro mínimo (lista de documentos, datas, quem enviou).
// Chamada todo dia pelo banco (pg_cron), com o segredo interno. Apaga pela API do Storage, em lotes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: seg } = await db.from("integracoes").select("valor").eq("chave", "segredo_interno").single();
  if (!seg || req.headers.get("x-segredo") !== seg.valor) return resposta({ erro: "Não autorizado" }, 401);
  const { data: lista, error } = await db.rpc("guarda_documentos_lista", { p_dias: 0 });
  if (error) return resposta({ erro: error.message }, 500);
  const feitos: unknown[] = [];
  for (const c of (lista || []).slice(0, 50)) {
    const { data: nomes, error: e1 } = await db.rpc("guarda_arquivos_do_cliente", { p_cliente: c.cliente_id });
    if (e1) { feitos.push({ cliente: c.cliente_id, erro: e1.message }); continue; }
    const arquivos = (nomes || []).map((n: any) => (typeof n === "string" ? n : n.guarda_arquivos_do_cliente)).filter(Boolean);
    let apagados = 0; let falhou: string | null = null;
    for (let i = 0; i < arquivos.length; i += 100) {
      const { error: e2 } = await db.storage.from("documentos").remove(arquivos.slice(i, i + 100));
      if (e2) { falhou = e2.message; break; }
      apagados += arquivos.slice(i, i + 100).length;
    }
    if (falhou) { feitos.push({ cliente: c.cliente_id, erro: falhou, apagados }); continue; }
    await db.rpc("guarda_marcar_apagados", { p_cliente: c.cliente_id, p_qtd: apagados });
    feitos.push({ cliente: c.cliente_id, apagados });
  }
  return resposta({ ok: true, clientes: feitos.length, feitos });
});
