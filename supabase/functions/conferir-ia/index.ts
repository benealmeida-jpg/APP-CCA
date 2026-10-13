// Pré-conferência de documentos por IA (Claude Haiku, API paga da Anthropic).
// O banco chama esta função quando um documento chega (x-segredo). A equipe também pode pedir de novo
// pelo painel, e o ADM pode testar a chave. O resultado é só uma sugestão: quem aceita ou recusa é a equipe.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-segredo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "claude-haiku-5-5";
// Preço por token (US$) do Claude Haiku 5.5 para pedidos de até 100 mil tokens
const PRECO_ENTRADA = 0.10 / 1e6;
const PRECO_SAIDA = 0.50 / 1e6;
const MOTIVOS = ["Ilegível", "Foto com baixa qualidade", "Documento cortado", "Documento vencido", "Documento errado", "Outro"];
const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGEM = 4.5 * 1024 * 1024;
const MAX_PDF = 15 * 1024 * 1024;

const FERRAMENTA = {
  name: "registrar_conferencia",
  description: "Registra a pré-conferência do documento analisado.",
  input_schema: {
    type: "object",
    properties: {
      tipo_confere: { type: "boolean", description: "O arquivo é mesmo o documento esperado?" },
      tipo_identificado: { type: "string", description: "Que documento parece ser (ex.: CNH, conta de luz, contracheque)." },
      legivel: { type: "boolean", description: "Dá para ler os dados importantes?" },
      completo: { type: "boolean", description: "Está inteiro: sem partes cortadas e com os lados/páginas necessários (ex.: identidade com frente e verso)." },
      nome_confere: { type: "string", enum: ["sim", "nao", "nao_aparece"], description: "O nome no documento é o da pessoa informada?" },
      cpf_confere: { type: "string", enum: ["sim", "nao", "nao_aparece"], description: "O CPF no documento é o da pessoa informada?" },
      validade: { type: "string", enum: ["valido", "vencido", "nao_se_aplica", "nao_identificado"] },
      data_documento: { type: "string", description: "Data de emissão ou referência principal no formato DD/MM/AAAA, ou vazio." },
      problemas: { type: "array", items: { type: "string" }, maxItems: 4, description: "Problemas encontrados, em frases curtas. Vazio se nenhum." },
      sugestao: { type: "string", enum: ["aceitar", "revisar", "recusar"], description: "aceitar = parece tudo certo; revisar = dúvida, a equipe precisa olhar com atenção; recusar = problema claro." },
      motivo_recusa: { type: "string", enum: [...MOTIVOS, ""], description: "Se sugerir recusar, o motivo mais próximo; senão vazio." },
      resumo: { type: "string", description: "Uma frase curta (até 140 letras) para a equipe e o corretor." },
    },
    required: ["tipo_confere", "tipo_identificado", "legivel", "completo", "nome_confere", "cpf_confere", "validade", "problemas", "sugestao", "motivo_recusa", "resumo"],
  },
};

const formatarCpf = (s: unknown) => {
  const d = String(s ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
};
const hojeBr = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());

function mimeDe(doc: any) {
  const m = String(doc.mime || "").toLowerCase();
  if (m) return m === "image/jpg" ? "image/jpeg" : m;
  const ext = String(doc.nome_original || doc.arquivo_path || "").toLowerCase().split(".").pop();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", heic: "image/heic" } as Record<string, string>)[ext || ""] || "";
}

async function baixar(db: SupabaseClient, bucket: string, caminho: string) {
  const { data, error } = await db.storage.from(bucket).download(caminho);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function chaveIa(db: SupabaseClient) {
  const { data } = await db.from("integracoes").select("valor").eq("chave", "anthropic_chave").maybeSingle();
  return data?.valor as string | undefined;
}

async function chamarClaude(chave: string, conteudo: unknown[], sistema: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO, max_tokens: 900, system: sistema,
      tools: [FERRAMENTA], tool_choice: { type: "tool", name: FERRAMENTA.name },
      messages: [{ role: "user", content: conteudo }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `erro ${r.status}`;
    if (r.status === 401) throw new Error("Chave da IA inválida ou desativada. Confira em Configurações.");
    if (r.status === 402 || /credit|billing|balance/i.test(msg)) throw new Error("Sem crédito na conta da Anthropic. Adicione crédito no Console.");
    if (r.status === 429 || r.status === 529) throw new Error("IA ocupada no momento. Peça a pré-conferência de novo em alguns minutos.");
    throw new Error(`IA respondeu: ${msg}`);
  }
  const uso = j.usage || {};
  const entrada = (uso.input_tokens || 0) + (uso.cache_creation_input_tokens || 0) + (uso.cache_read_input_tokens || 0);
  const saida = uso.output_tokens || 0;
  const bloco = (j.content || []).find((c: any) => c.type === "tool_use");
  return { resultado: bloco?.input || null, entrada, saida, custo: entrada * PRECO_ENTRADA + saida * PRECO_SAIDA };
}

async function usoDoMes(db: SupabaseClient) {
  const agora = new Date();
  const ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 3)); // 1º dia, 00h de Brasília
  const { count } = await db.from("ia_uso").select("id", { count: "exact", head: true }).gte("em", ini.toISOString()).eq("ok", true);
  const { data: p } = await db.from("parametros").select("valor").eq("chave", "ia_limite_mes").maybeSingle();
  return { usados: count || 0, limite: Number(p?.valor) || 3000 };
}

// Analisa um documento e grava o resultado
async function conferir(db: SupabaseClient, tabela: string, id: string, { forcar = false } = {}) {
  if (!["documentos", "documentos_vendedor"].includes(tabela)) throw new Error("Tabela inválida");
  const { data: doc } = await db.from(tabela).select("*").eq("id", id).maybeSingle();
  if (!doc) throw new Error("Documento não encontrado");
  if (!forcar && doc.situacao !== "em_conferencia") return { pulado: "documento já conferido" };
  const { data: lig } = await db.from("parametros").select("valor").eq("chave", "ia_conferencia").maybeSingle();
  if (!forcar && lig?.valor === "nao") return { pulado: "pré-conferência desligada" };
  const chave = await chaveIa(db);
  if (!chave) throw new Error("Chave da IA não configurada");

  const gravar = async (ia: Record<string, unknown>) => {
    await db.from(tabela).update({ ia, ia_em: new Date().toISOString() }).eq("id", id);
    return ia;
  };
  const { usados, limite } = await usoDoMes(db);
  if (usados >= limite) return gravar({ analisado: false, motivo: `Limite do mês atingido (${limite} documentos). Ajuste em Configurações.` });

  // Quem é a pessoa do documento
  const { data: tipo } = await db.from("tipos_documento").select("nome, grupo").eq("codigo", doc.tipo_codigo).maybeSingle();
  let pessoa = ""; let cpf = ""; let clienteNome = ""; let clienteId = doc.cliente_id;
  if (tabela === "documentos") {
    const { data: cli } = await db.from("clientes").select("id, nome, cpf").eq("id", doc.cliente_id).maybeSingle();
    clienteNome = cli?.nome || "";
    if (doc.participante_id) {
      const { data: pa } = await db.from("participantes").select("nome, cpf").eq("id", doc.participante_id).maybeSingle();
      pessoa = pa?.nome || ""; cpf = pa?.cpf || "";
    } else if (doc.dependente_ordem) {
      pessoa = `dependente nº ${doc.dependente_ordem} de ${cli?.nome || "cliente"}`;
    } else { pessoa = cli?.nome || ""; cpf = cli?.cpf || ""; }
  } else {
    const { data: v } = await db.from("vendedores").select("nome, cpf_cnpj, tipo").eq("id", doc.vendedor_id).maybeSingle();
    pessoa = `${v?.nome || ""} (vendedor do imóvel${v?.tipo === "PJ" ? ", empresa" : ""})`; cpf = v?.cpf_cnpj || "";
    if (doc.cliente_id) { const { data: cli } = await db.from("clientes").select("nome").eq("id", doc.cliente_id).maybeSingle(); clienteNome = cli?.nome || ""; }
  }

  // Arquivo: imagem reduzida feita pelo app (.ia.jpg) ou o original
  const bucket = tabela === "documentos" ? "documentos" : "vendedores";
  const mime = mimeDe(doc);
  let bloco: unknown = null; let fonte = "original";
  if (mime.startsWith("image/")) {
    const previa = await baixar(db, bucket, `${doc.arquivo_path}.ia.jpg`);
    if (previa?.length) { bloco = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: encodeBase64(previa) } }; fonte = "previa"; }
    else if (IMAGENS.includes(mime) && Number(doc.tamanho_bytes || 0) <= MAX_IMAGEM) {
      const orig = await baixar(db, bucket, doc.arquivo_path);
      if (orig?.length && orig.length <= MAX_IMAGEM) bloco = { type: "image", source: { type: "base64", media_type: mime, data: encodeBase64(orig) } };
    }
    if (!bloco) return gravar({ analisado: false, motivo: mime === "image/heic" ? "Foto em formato HEIC: a IA não lê. A equipe confere normalmente." : "Imagem grande demais para a IA. A equipe confere normalmente." });
  } else if (mime === "application/pdf") {
    if (Number(doc.tamanho_bytes || 0) > MAX_PDF) return gravar({ analisado: false, motivo: "PDF grande demais para a IA. A equipe confere normalmente." });
    const orig = await baixar(db, bucket, doc.arquivo_path);
    if (!orig?.length) return gravar({ analisado: false, motivo: "Arquivo não encontrado" });
    bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(orig) } };
  } else {
    return gravar({ analisado: false, motivo: "Formato de arquivo que a IA não lê. A equipe confere normalmente." });
  }

  const sistema = `Você ajuda a equipe de um Correspondente Caixa Aqui (CCA) a fazer a primeira triagem dos documentos que corretores enviam para financiamento habitacional da Caixa Econômica Federal.
Olhe o arquivo com atenção e preencha a ferramenta registrar_conferencia. Hoje é ${hojeBr()}.
Regras:
- Não invente dados. Se algo não aparece ou não dá para ler, diga isso.
- Na dúvida, sugira "revisar", nunca "recusar". Use "recusar" só para problema claro: documento errado, ilegível, cortado, vencido ou de outra pessoa.
- Referências comuns de prazo (na dúvida, "revisar"): comprovante de residência e certidões com até 90 dias; contracheques e extratos dos últimos meses; documento de identidade dentro da validade (CNH vencida há mais de 30 dias não serve como identidade).
- Identidade (RG/CNH): precisa mostrar os dados e a foto; RG em geral precisa de frente e verso.
- Escreva em português do Brasil, com frases curtas e simples, sem repetir dados pessoais completos.`;
  const pedido = [
    `Documento esperado: ${tipo?.nome || doc.tipo_codigo}${tipo?.grupo ? ` (grupo: ${tipo.grupo})` : ""}.`,
    pessoa ? `De quem deve ser: ${pessoa}${cpf ? `, CPF/CNPJ ${formatarCpf(cpf)}` : ""}.` : "",
    clienteNome ? `Processo do cliente: ${clienteNome}.` : "",
    `Nome do arquivo enviado: ${doc.nome_original || "-"}.`,
  ].filter(Boolean).join("\n");

  try {
    const r = await chamarClaude(chave, [bloco, { type: "text", text: pedido }], sistema);
    await db.from("ia_uso").insert({ tabela, documento_id: id, tokens_entrada: r.entrada, tokens_saida: r.saida, custo_usd: r.custo, ok: !!r.resultado });
    if (!r.resultado) return gravar({ analisado: false, motivo: "A IA não devolveu resultado" });
    const res = r.resultado as Record<string, unknown>;
    if (!MOTIVOS.includes(String(res.motivo_recusa))) res.motivo_recusa = "";
    res.resumo = String(res.resumo || "").slice(0, 200);
    res.problemas = (Array.isArray(res.problemas) ? res.problemas : []).map((x) => String(x).slice(0, 160)).slice(0, 4);
    const ia = await gravar({ analisado: true, modelo: MODELO, fonte, ...res });
    // Problema claro: avisa o corretor na hora (notificação e e-mail), para ele trocar o arquivo
    if (res.sugestao === "recusar" && doc.situacao === "em_conferencia" && clienteId) {
      await db.from("eventos").insert({ tipo: "ia_alerta", cliente_id: clienteId,
        dados: { tabela, documento_id: id, documento: tipo?.nome || doc.tipo_codigo, resumo: res.resumo, pessoa } });
    }
    return ia;
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("ia_uso").insert({ tabela, documento_id: id, ok: false, erro: msg.slice(0, 300) });
    await gravar({ analisado: false, erro: msg });
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const corpo = await req.json().catch(() => ({}));

    // Chamada do banco (documento novo)
    const seg = req.headers.get("x-segredo");
    if (seg) {
      const { data } = await db.from("integracoes").select("valor").eq("chave", "segredo_interno").single();
      if (!data || data.valor !== seg) return resposta({ erro: "Não autorizado" }, 401);
      try { return resposta({ ok: true, ia: await conferir(db, corpo.tabela, corpo.id) }); }
      catch (e) { return resposta({ erro: (e as Error).message }, 200); }
    }

    // Chamadas da equipe
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await db.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);
    const { data: eu } = await db.from("perfis").select("id, papel, ativo, permissoes").eq("id", quem.user.id).single();
    const equipe = eu?.ativo && ["equipe_cca", "admin"].includes(eu.papel);
    if (!equipe) return resposta({ erro: "Somente a equipe da CCA" }, 403);

    if (corpo.acao === "conferir") return resposta({ ok: true, ia: await conferir(db, corpo.tabela, corpo.id, { forcar: true }) });

    if (corpo.acao === "testar") {
      if (eu.papel !== "admin") return resposta({ erro: "Somente administradores" }, 403);
      const chave = await chaveIa(db);
      if (!chave) return resposta({ erro: "Salve a chave da IA antes de testar." }, 400);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODELO, max_tokens: 20, messages: [{ role: "user", content: "Responda só: ok" }] }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return resposta({ erro: "Chave inválida ou desativada. Crie outra no Console da Anthropic." }, 400);
      if (!r.ok) return resposta({ erro: j?.error?.message || `A IA respondeu erro ${r.status}` }, 400);
      return resposta({ ok: true, detalhe: `Chave funcionando (modelo ${MODELO}).` });
    }
    return resposta({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
