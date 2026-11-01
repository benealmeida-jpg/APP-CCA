// Leitura por IA na etapa de assinatura do contrato (Claude, API paga da Anthropic). Só a equipe da CCA chama.
// modo "procuracao": lê o jogo de procurações do gerente (validade, outorgado, poderes) e grava a validade se a CCA ainda não informou.
// modo "contrato":   compara o contrato assinado com o cadastro (comprador, vendedor, imóvel, gerente) e lista quem tem campo de assinatura.
// modo "iti":        lê o relatório do validar.iti.gov.br e diz se todas as assinaturas foram aprovadas.
// Sem a chave da IA configurada, responde { semIa: true } e a CCA confere pela lista guiada. O resultado é sugestão: quem marca é a CCA.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "claude-sonnet-5-5"; // contratos são longos e cheios de detalhe
const MAX_PDF = 25 * 1024 * 1024;
// Preço aproximado por token (US$) para o controle de gasto em Configurações
const PRECO_ENTRADA = 3 / 1e6;
const PRECO_SAIDA = 15 / 1e6;

const FERRAMENTAS: Record<string, { name: string; description: string; input_schema: unknown }> = {
  procuracao: {
    name: "registrar_procuracao",
    description: "Registra o que foi lido no jogo de procurações do gerente da CAIXA.",
    input_schema: { type: "object", properties: {
      validade: { type: "string", description: "Data até quando a procuração vale, AAAA-MM-DD; vazio se não houver prazo escrito." },
      outorgada_em: { type: "string", description: "Data da lavratura/outorga, AAAA-MM-DD, ou vazio." },
      outorgado_nome: { type: "string" }, outorgado_cpf: { type: "string" },
      poderes_resumo: { type: "string", description: "Em uma frase: que poderes o gerente recebeu (ex.: assinar contratos de financiamento habitacional pela CAIXA)." },
      alertas: { type: "array", items: { type: "string" }, description: "Problemas: vencida, ilegível, sem poderes para contratos habitacionais, outro outorgado etc." },
    }, required: ["validade", "alertas"] },
  },
  contrato: {
    name: "registrar_conferencia",
    description: "Registra a conferência do contrato com os dados do cadastro.",
    input_schema: { type: "object", properties: {
      itens: { type: "object", properties: Object.fromEntries(["comprador", "vendedor", "imovel", "gerente", "campos_assinatura"].map((k) => [k,
        { type: "object", properties: { confere: { type: "boolean" }, observacao: { type: "string" } }, required: ["confere"] }])) },
      pessoas_com_campo_assinatura: { type: "array", items: { type: "string" }, description: "Nomes que têm campo de assinatura no contrato." },
      divergencias: { type: "array", items: { type: "string" }, description: "Cada diferença encontrada, curta (ex.: 'CPF do vendedor diferente: contrato 123..., cadastro 456...')." },
      resumo: { type: "string" },
    }, required: ["itens", "divergencias", "resumo"] },
  },
  iti: {
    name: "registrar_relatorio_iti",
    description: "Registra o resultado do relatório de conformidade do validar.iti.gov.br.",
    input_schema: { type: "object", properties: {
      todas_aprovadas: { type: "boolean" },
      assinaturas: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, situacao: { type: "string", description: "Aprovado, Reprovado, Indeterminado ou o texto do relatório" } }, required: ["nome", "situacao"] } },
      resumo: { type: "string" },
    }, required: ["todas_aprovadas", "assinaturas", "resumo"] },
  },
};

const SISTEMA = `Você ajuda a equipe de um Correspondente Caixa Aqui (CCA) a conferir documentos da etapa de assinatura do contrato de financiamento habitacional da Caixa Econômica Federal.
Regras:
- Responda só com o que está escrito no documento. Não invente dados. Se algo não aparece, diga que não aparece.
- Compare nomes ignorando acentos e maiúsculas; CPF/CNPJ só pelos números.
- Em contratos de construtora (pessoa jurídica), o representante pode não assinar todos os campos em que o nome aparece, e funcionários listados podem ser dispensados: siga a "regra de assinatura do vendedor" informada, quando houver.
- Datas no formato AAAA-MM-DD. Seja breve e objetivo, em português do Brasil.`;

async function baixar(db: SupabaseClient, bucket: string, caminho: string) {
  const { data, error } = await db.storage.from(bucket).download(caminho);
  if (error || !data) throw new Error("Não foi possível abrir o arquivo.");
  const b = new Uint8Array(await data.arrayBuffer());
  if (b.length > MAX_PDF) throw new Error("Arquivo grande demais para a IA (máximo 25 MB).");
  return b;
}
const blocoArquivo = (bytes: Uint8Array, caminho: string) => {
  const ext = caminho.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(bytes) } };
  const mime = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[ext || ""];
  if (!mime) throw new Error("A IA lê PDF ou foto (JPG/PNG). Converta o arquivo e anexe de novo.");
  return { type: "image", source: { type: "base64", media_type: mime, data: encodeBase64(bytes) } };
};

async function chamarClaude(chave: string, modo: string, conteudo: unknown[]) {
  const f = FERRAMENTAS[modo];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 2000, system: SISTEMA, tools: [f], tool_choice: { type: "tool", name: f.name }, messages: [{ role: "user", content: conteudo }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `erro ${r.status}`;
    if (r.status === 401) throw new Error("Chave da IA inválida ou desativada. Confira em Configurações.");
    if (r.status === 402 || /credit|billing|balance/i.test(msg)) throw new Error("Sem crédito na conta da Anthropic. Adicione crédito no Console.");
    if (r.status === 429 || r.status === 529) throw new Error("IA ocupada no momento. Tente de novo em alguns minutos.");
    throw new Error(`IA respondeu: ${msg}`);
  }
  const uso = j.usage || {};
  return { resultado: (j.content || []).find((c: any) => c.type === "tool_use")?.input || null, entrada: uso.input_tokens || 0, saida: uso.output_tokens || 0 };
}

const cpf = (v?: string | null) => (v || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await db.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: "Faça login novamente" }, 401);
    const { data: eu } = await db.from("perfis").select("id, papel, ativo").eq("id", quem.user.id).single();
    if (!(eu?.ativo && ["equipe_cca", "admin"].includes(eu.papel))) return resposta({ erro: "Somente a equipe da CCA" }, 403);

    const corpo = await req.json().catch(() => ({}));
    const modo = String(corpo.modo || "");
    if (!FERRAMENTAS[modo]) return resposta({ erro: "Modo desconhecido" }, 400);
    const { data: k } = await db.from("integracoes").select("valor").eq("chave", "anthropic_chave").maybeSingle();
    const chave = k?.valor as string | undefined;
    if (!chave) return resposta({ semIa: true });

    let conteudo: unknown[]; let gravar: (r: any) => Promise<void>;
    if (modo === "procuracao") {
      const { data: p } = await db.from("procuracoes_gerente").select("*, gerente:gerentes_caixa(nome, cpf)").eq("id", corpo.procuracao_id).is("excluida_em", null).single();
      if (!p) return resposta({ erro: "Procuração não encontrada" }, 404);
      conteudo = [blocoArquivo(await baixar(db, "procuracoes", p.arquivo_path), p.arquivo_path),
        { type: "text", text: `Jogo de procurações do gerente ${p.gerente?.nome} (CPF ${cpf(p.gerente?.cpf) || "não informado"}). Diga até quando vale, quem é o outorgado e se ele tem poderes para assinar contratos de financiamento habitacional pela CAIXA.` }];
      gravar = async (r) => {
        const val = /^\d{4}-\d{2}-\d{2}$/.test(r.validade || "") ? r.validade : null;
        await db.from("procuracoes_gerente").update({ ia: r, ...(p.validade_por === "cca" || !val ? {} : { validade: val, validade_por: "ia" }),
          ...(/^\d{4}-\d{2}-\d{2}$/.test(r.outorgada_em || "") && !p.outorgada_em ? { outorgada_em: r.outorgada_em } : {}) }).eq("id", p.id);
      };
    } else {
      const { data: c } = await db.from("clientes").select("*").eq("id", corpo.cliente_id).single();
      if (!c) return resposta({ erro: "Cliente não encontrado" }, 404);
      const tipo = modo === "iti" ? "validador_assinatura" : "contrato_assinado";
      const { data: arq } = await db.from("contrato_arquivos").select("arquivo_path").eq("cliente_id", c.id).eq("tipo", tipo).eq("substituido", false).order("enviado_em", { ascending: false }).limit(1).maybeSingle();
      if (!arq) return resposta({ erro: modo === "iti" ? "Anexe o relatório do ITI antes." : "Anexe o contrato assinado antes." }, 400);
      const arquivo = blocoArquivo(await baixar(db, "documentos", arq.arquivo_path), arq.arquivo_path);
      if (modo === "iti") {
        conteudo = [arquivo, { type: "text", text: "Relatório de conformidade do validar.iti.gov.br. Liste cada assinatura com a situação e diga se todas foram aprovadas." }];
      } else {
        const [{ data: parts }, { data: v }, { data: im }, { data: g }] = await Promise.all([
          db.from("participantes").select("papel, nome, cpf, estado_civil, regime_bens").eq("cliente_id", c.id).order("ordem"),
          c.vendedor_id ? db.from("vendedores").select("tipo, nome, cpf_cnpj, estado_civil, conjuge_nome, conjuge_cpf, responsavel_nome, assinantes, regra_assinatura").eq("id", c.vendedor_id).maybeSingle() : Promise.resolve({ data: null }),
          c.imovel_id ? db.from("imoveis").select("endereco, cidade, uf, matricula, cartorio_rgi").eq("id", c.imovel_id).maybeSingle() : Promise.resolve({ data: null }),
          c.contrato_gerente_id ? db.from("gerentes_caixa").select("nome, cpf, agencia").eq("id", c.contrato_gerente_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        const cadastro = {
          compradores: [{ papel: "titular", nome: c.nome, cpf: cpf(c.cpf), estado_civil: c.estado_civil, regime_bens: c.regime_bens },
            ...(parts || []).filter((p: any) => ["comprador", "conjuge"].includes(p.papel)).map((p: any) => ({ ...p, cpf: cpf(p.cpf) }))],
          vendedor: v ? { ...v, cpf_cnpj: cpf(v.cpf_cnpj), conjuge_cpf: cpf(v.conjuge_cpf) } : null,
          imovel: im || null, gerente: g ? { ...g, cpf: cpf(g.cpf) } : null,
          tipo_contrato: c.contrato_tipo === "misto" ? "Misto (aceita assinatura manual)" : "NATO Digital (todos assinam digitalmente)",
        };
        conteudo = [arquivo, { type: "text", text: `Dados do cadastro no sistema:\n${JSON.stringify(cadastro, null, 2)}\n\nConfira se o contrato bate com o cadastro (comprador, vendedor, imóvel, gerente) e se todos os envolvidos têm campo de assinatura.` }];
      }
      gravar = async (r) => {
        const atual = c.contrato_conferencia || {};
        await db.from("clientes").update({ contrato_conferencia: { ...atual, [modo === "iti" ? "ia_iti" : "ia_contrato"]: { ...r, em: new Date().toISOString() } } }).eq("id", c.id);
      };
    }

    const r = await chamarClaude(chave, modo, conteudo);
    await db.from("ia_uso").insert({ tabela: `contrato_${modo}`, tokens_entrada: r.entrada, tokens_saida: r.saida, custo_usd: r.entrada * PRECO_ENTRADA + r.saida * PRECO_SAIDA, ok: !!r.resultado }).then(() => {}, () => {});
    if (!r.resultado) return resposta({ erro: "A IA não conseguiu ler o arquivo. Confira manualmente." });
    await gravar(r.resultado);
    return resposta({ ok: true, modelo: MODELO, ...r.resultado });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : String(e) }, 200);
  }
});
