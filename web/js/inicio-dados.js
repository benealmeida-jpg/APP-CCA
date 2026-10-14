// Números da página inicial (ADM e corretor). Sem tela: dá para testar no Node.
import * as R from './regras.js';
import { diasParaVencer, validadeDoLaudo } from './engenharia-regras.js';

const DIA = 864e5;
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const PERIODOS = [['mes', 'Este mês'], ['30', '30 dias'], ['90', '90 dias'], ['ano', 'Este ano']];
export const METRICAS = [
  ['abertos', 'Processos abertos', 'Cadastros enviados para a CCA'],
  ['aprovados', 'Clientes aprovados', 'Chegaram em Cliente Aprovado'],
  ['minutas', 'Minutas em mãos', 'Chegaram em Minuta em mãos'],
  ['assinados', 'Contratos assinados', 'Chegaram em Contrato assinado'],
];
const STATUS_DA_METRICA = { aprovados: 'cliente_aprovado', minutas: 'minuta_em_maos', assinados: 'contrato_assinado' };

const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mesmaMetrica = (m) => (METRICAS.some(([k]) => k === m) ? m : 'abertos');

// Intervalo [ini, fim) do período e o anterior, do mesmo tamanho
export function intervalos(periodo, agora = new Date()) {
  const hoje = inicioDia(agora); const fim = new Date(agora);
  let ini; let ant;
  if (periodo === '30') ini = new Date(hoje.getTime() - 29 * DIA);
  else if (periodo === '90') ini = new Date(hoje.getTime() - 89 * DIA);
  else if (periodo === 'ano') ini = new Date(hoje.getFullYear(), 0, 1);
  else ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const tamanho = fim.getTime() - ini.getTime();
  if (periodo === 'ano') ant = new Date(hoje.getFullYear() - 1, 0, 1);
  else if (periodo === 'mes') ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  else ant = new Date(ini.getTime() - tamanho);
  return { ini, fim, antIni: ant, antFim: new Date(ant.getTime() + tamanho) };
}

// Eventos de cada métrica: [{ cliente_id, em }] (a primeira vez que o cliente chegou naquele status; "abertos" = envio do cadastro)
export function eventos(metrica, clientes, historico) {
  const enviados = clientes.filter((c) => !c.rascunho);
  if (metrica === 'abertos') return enviados.filter((c) => c.enviado_em).map((c) => ({ cliente_id: c.id, em: c.enviado_em }));
  const alvo = STATUS_DA_METRICA[mesmaMetrica(metrica)];
  const ids = new Set(enviados.map((c) => c.id));
  const primeiro = new Map();
  for (const x of historico || []) {
    if (x.para !== alvo || !ids.has(x.cliente_id)) continue;
    const atual = primeiro.get(x.cliente_id);
    if (!atual || String(x.em) < String(atual)) primeiro.set(x.cliente_id, x.em);
  }
  return [...primeiro].map(([cliente_id, em]) => ({ cliente_id, em }));
}

const entre = (em, ini, fim) => { const t = new Date(em).getTime(); return t >= ini.getTime() && t < fim.getTime(); };

// Cartão de número: valor no período, valor no período anterior e variação
export function indicador(metrica, periodo, clientes, historico, agora = new Date()) {
  const { ini, fim, antIni, antFim } = intervalos(periodo, agora);
  const ev = eventos(metrica, clientes, historico);
  const valor = ev.filter((e) => entre(e.em, ini, fim)).length;
  const anterior = ev.filter((e) => entre(e.em, antIni, antFim)).length;
  const variacao = anterior === 0 ? (valor === 0 ? 0 : null) : Math.round(((valor - anterior) / anterior) * 100);
  return { metrica, valor, anterior, variacao };
}

// Últimos N meses (o atual por último) de uma métrica
export function serieMensal(metrica, clientes, historico, { meses = 6, agora = new Date() } = {}) {
  const ev = eventos(metrica, clientes, historico);
  const saida = [];
  for (let i = meses - 1; i >= 0; i--) {
    const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    saida.push({ rotulo: MESES_CURTOS[ini.getMonth()], ano: ini.getFullYear(), valor: ev.filter((e) => entre(e.em, ini, fim)).length, atual: i === 0 });
  }
  return saida;
}

// Clientes enviados hoje em cada etapa (funil)
export function funil(clientes) {
  const enviados = clientes.filter((c) => !c.rascunho);
  return R.STATUS.map((s) => ({ codigo: s.codigo, nome: s.nome, valor: enviados.filter((c) => c.status === s.codigo).length }));
}

// Principais clientes da CCA: por imobiliária (com autônomos juntos) ou por corretor
export function ranking(grupo, metrica, periodo, clientes, historico, { agora = new Date(), limite = 6 } = {}) {
  const { ini, fim } = intervalos(periodo, agora);
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const mapa = new Map();
  for (const e of eventos(metrica, clientes, historico)) {
    if (!entre(e.em, ini, fim)) continue;
    const c = porId.get(e.cliente_id); if (!c) continue;
    const chave = grupo === 'corretor' ? c.corretor_id : (c.imobiliaria_id || 'autonomo');
    const nome = grupo === 'corretor' ? (c.corretor_nome || '—') : (c.imobiliaria_nome || 'Autônomo');
    const sub = grupo === 'corretor' ? (c.imobiliaria_nome || 'Autônomo') : null;
    const atual = mapa.get(chave) || { chave, nome, sub, valor: 0 };
    atual.valor += 1; mapa.set(chave, atual);
  }
  const lista = [...mapa.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
  const total = lista.reduce((s, x) => s + x.valor, 0);
  return { total, itens: lista.slice(0, limite), restantes: Math.max(0, lista.length - limite) };
}

// Laudos de engenharia aprovados, por data de validade (negativo = vencido)
export function validades(engenharias, agora = new Date()) {
  return engenharias.filter((e) => e.laudo_aprovado && !e.excluida_em)
    .map((e) => { const v = e.validade_em || validadeDoLaudo(e.avaliacao_data); return { e, validade: v, dias: diasParaVencer(v, agora) }; })
    .filter((x) => x.validade).sort((a, b) => a.dias - b.dias);
}

// Certidões com data de emissão (ônus reais, JUCERJA, ITC) perto de vencer ou vencidas
export function alertasValidade({ emissoes = [], tipos = [], clientes = [], rotaCliente, agora = new Date() }) {
  const hoje = R.hojeIso(agora);
  const porCodigo = new Map(tipos.map((t) => [t.codigo, t]));
  const porCliente = new Map(clientes.filter((c) => !c.rascunho && !R.STATUS_FINAIS.includes(c.status)).map((c) => [c.id, c]));
  const itens = [];
  for (const em of emissoes) {
    const t = porCodigo.get(em.tipo_codigo); const c = porCliente.get(em.cliente_id);
    if (!t || !c) continue;
    const v = R.validadeDoDocumento(t, em.emitido_em, hoje);
    if (!v || v.estado === 'ok') continue;
    itens.push({ tipo: 'certidao', tom: v.estado === 'vencido' ? 'alerta' : 'atencao', icone: 'doc', dias: v.restante,
      titulo: `${t.nome.split(' (')[0].replace(/ no endereço .*/, '')} · ${c.nome}`.replace(/^Certidão /, 'Certidão '),
      detalhe: `${em.tipo_codigo.startsWith('VEND_ITC') ? (em.tipo_codigo === 'VEND_ITC_IMOVEL' ? 'ITC do imóvel · ' : 'ITC da residência · ') : ''}emitida em ${R.formatarData(v.emissao)} · vale até ${R.formatarData(v.vencimento)}`,
      quando: v.texto, href: rotaCliente(c) });
  }
  return itens;
}

// Descontos de cartório (imóvel acima do limite) esperando GRERJ ou requerimento
export function pendenciasCartorio(clientes) {
  const ativos = clientes.filter((c) => !c.rascunho && !R.STATUS_FINAIS.includes(c.status));
  const pagar = ativos.filter((c) => R.situacaoDescontoCartorio(c).etapa === 'pagar');
  const req = ativos.filter((c) => R.situacaoDescontoCartorio(c).etapa === 'requerimento');
  return { pagar, req };
}

export function engenhariasPorEtapa(engenharias, etapas) {
  return etapas.map(([codigo, nome]) => ({ codigo, nome, valor: engenharias.filter((e) => e.etapa === codigo && !(e.etapa === 'laudo' && e.laudo_aprovado)).length }));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const quandoDias = (d) => (d < 0 ? `vencido há ${plural(-d, 'dia', 'dias')}` : d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`);

// Lista "Precisa de você" e "Prazos e validades" da equipe
export function pendenciasEquipe({ clientes, engenharias, entrevistas = [], docsConferir = [], verificacoes = [], emissoes = [], tipos = [], limiteParado = 5, agora = new Date() }) {
  const fazer = []; const prazos = [];
  if (docsConferir.length) {
    const maisAntigo = Math.max(...docsConferir.map((d) => R.diasDesde(d.documento?.enviado_em, agora)));
    fazer.push({ tipo: 'docs', tom: maisAntigo >= 2 ? 'alerta' : 'info', icone: 'docCheck', valor: docsConferir.length, titulo: 'Documentos para conferir',
      detalhe: maisAntigo >= 1 ? `o mais antigo espera há ${plural(maisAntigo, 'dia', 'dias')}` : 'todos chegaram hoje', href: '#/painel/docs' });
  }
  const verif = verificacoes.filter((v) => v.status === 'em_analise');
  if (verif.length) fazer.push({ tipo: 'verif', tom: 'alerta', icone: 'escudo', valor: verif.length, titulo: 'Identidades para confirmar', detalhe: 'consumidores esperando o vídeo ser conferido', href: '#/painel/verificacoes' });
  const novosDocsEng = engenharias.filter((e) => e.docs_novos);
  if (novosDocsEng.length) fazer.push({ tipo: 'eng-docs', tom: 'atencao', icone: 'casa', valor: novosDocsEng.length, titulo: 'Engenharias com documentos novos', detalhe: 'anexados depois do envio', href: '#/painel/engenharia' });
  const aguardando = engenharias.filter((e) => e.etapa === 'em_analise');
  if (aguardando.length) fazer.push({ tipo: 'eng-analise', tom: 'info', icone: 'casa', valor: aguardando.length, titulo: 'Engenharias para cadastrar no SIOPI', detalhe: 'enviadas pelos corretores, aguardando a OS', href: '#/painel/engenharia' });
  const cart = pendenciasCartorio(clientes);
  if (cart.pagar.length || cart.req.length) fazer.push({ tipo: 'cartorio', tom: 'atencao', icone: 'cifrao', valor: cart.pagar.length + cart.req.length, titulo: 'Desconto de 50% no cartório',
    detalhe: [cart.pagar.length ? `${plural(cart.pagar.length, 'GRERJ para pagar', 'GRERJs para pagar')}` : null, cart.req.length ? `${plural(cart.req.length, 'requerimento para enviar', 'requerimentos para enviar')}` : null].filter(Boolean).join(' · '), href: '#/painel/clientes' });
  const msgs = clientes.filter((c) => c.conversa_nao_lidas > 0);
  if (msgs.length) fazer.push({ tipo: 'msgs', tom: 'atencao', icone: 'conversa', valor: msgs.reduce((s, c) => s + c.conversa_nao_lidas, 0), titulo: 'Mensagens novas de corretores', detalhe: `em ${plural(msgs.length, 'cliente', 'clientes')}`, href: '#/painel/clientes' });
  const parados = clientes.filter((c) => R.diasParado(c, limiteParado, agora) > 0);
  if (parados.length) {
    const max = Math.max(...parados.map((c) => R.diasParado(c, limiteParado, agora)));
    fazer.push({ tipo: 'parados', tom: 'atencao', icone: 'historico', valor: parados.length, titulo: 'Processos parados', detalhe: `há ${limiteParado}+ dias no mesmo status; o mais antigo, ${max} dias`, href: '#/painel/clientes' });
  }
  // Prazos: entrevistas dos próximos dias e validade dos laudos
  for (const en of entrevistas) {
    const d = Math.floor((inicioDia(new Date(en.entrevista_em)).getTime() - inicioDia(agora).getTime()) / DIA);
    if (d < 0 || d > 7) continue;
    prazos.push({ tipo: 'entrevista', tom: d <= 1 ? 'alerta' : 'info', icone: 'calendario', dias: d, titulo: `Entrevista · ${en.nome}`,
      detalhe: `${new Date(en.entrevista_em).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${en.corretor_nome || ''}`.replace(/ · $/, ''), quando: quandoDias(d), href: `#/painel/clientes/${en.id}` });
  }
  for (const v of validades(engenharias, agora)) {
    if (v.dias > 30) continue;
    prazos.push({ tipo: 'validade', tom: v.dias < 0 ? 'alerta' : v.dias <= 10 ? 'alerta' : 'atencao', icone: 'casa', dias: v.dias, titulo: `Laudo de engenharia · ${v.e.vendedor?.nome || 'vendedor'}`,
      detalhe: `válido até ${v.validade.split('-').reverse().join('/')}`, quando: quandoDias(v.dias), href: `#/painel/engenharia/${v.e.id}` });
  }
  prazos.push(...alertasValidade({ emissoes, tipos, clientes, agora, rotaCliente: (c) => `#/painel/clientes/${c.id}` }));
  prazos.sort((a, b) => a.dias - b.dias);
  return { fazer, prazos };
}

// O mesmo para o corretor: o que depende dele
export function pendenciasCorretor({ clientes, engenharias, entrevistas = [], emissoes = [], tipos = [], limiteParado = 5, agora = new Date() }) {
  const fazer = []; const prazos = [];
  const docs = clientes.filter((c) => !c.rascunho && (Number(c.docs_recusados) > 0 || Number(c.docs_pendentes) > 0) && !R.STATUS_FINAIS.includes(c.status));
  for (const c of docs.sort((a, b) => Number(b.docs_recusados) - Number(a.docs_recusados)).slice(0, 3)) {
    const rec = Number(c.docs_recusados) || 0; const pen = Number(c.docs_pendentes) || 0;
    fazer.push({ tipo: 'doc', tom: rec ? 'alerta' : 'atencao', icone: 'doc', titulo: c.nome, detalhe: [rec ? `${plural(rec, 'documento recusado', 'documentos recusados')}` : null, pen ? `${plural(pen, 'faltando', 'faltando')}` : null].filter(Boolean).join(' · '), href: `#/cliente/${c.id}/documentos` });
  }
  const msgs = clientes.filter((c) => c.conversa_nao_lidas > 0);
  if (msgs.length) fazer.push({ tipo: 'msgs', tom: 'atencao', icone: 'conversa', titulo: 'Mensagens novas da CCA', detalhe: `${plural(msgs.length, 'cliente', 'clientes')} com resposta para você`, href: msgs.length === 1 ? `#/cliente/${msgs[0].id}` : '#/clientes' });
  const rascunhos = clientes.filter((c) => c.rascunho);
  if (rascunhos.length) fazer.push({ tipo: 'rascunho', tom: 'info', icone: 'lapis', titulo: plural(rascunhos.length, 'cadastro não enviado', 'cadastros não enviados'), detalhe: 'termine e envie para a CCA começar a análise', href: `#/cliente/${rascunhos[0].id}/cadastro/1` });
  const boletos = engenharias.filter((e) => e.etapa === 'boleto');
  if (boletos.length) fazer.push({ tipo: 'boleto', tom: 'alerta', icone: 'cifrao', titulo: plural(boletos.length, 'boleto de engenharia para pagar', 'boletos de engenharia para pagar'), detalhe: 'a OS só sai depois do pagamento', href: '#/engenharia' });
  const faltaDoc = engenharias.filter((e) => e.etapa === 'documentacao');
  if (faltaDoc.length) fazer.push({ tipo: 'eng-doc', tom: 'atencao', icone: 'casa', titulo: plural(faltaDoc.length, 'engenharia esperando documentos', 'engenharias esperando documentos'), detalhe: 'anexe e envie para a CCA', href: '#/engenharia' });
  const parados = clientes.filter((c) => R.diasParado(c, limiteParado, agora) > 0);
  if (parados.length) fazer.push({ tipo: 'parados', tom: 'info', icone: 'historico', titulo: plural(parados.length, 'processo sem andamento', 'processos sem andamento'), detalhe: `há ${limiteParado}+ dias no mesmo status`, href: '#/clientes' });
  const meus = new Set(clientes.map((c) => c.id));
  for (const en of entrevistas.filter((x) => meus.has(x.id))) {
    const d = Math.floor((inicioDia(new Date(en.entrevista_em)).getTime() - inicioDia(agora).getTime()) / DIA);
    if (d < 0 || d > 14) continue;
    prazos.push({ tipo: 'entrevista', tom: d <= 1 ? 'alerta' : 'info', icone: 'calendario', dias: d, titulo: `Entrevista · ${en.nome}`,
      detalhe: new Date(en.entrevista_em).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), quando: quandoDias(d), href: `#/cliente/${en.id}` });
  }
  for (const v of validades(engenharias, agora)) {
    if (v.dias > 45) continue;
    prazos.push({ tipo: 'validade', tom: v.dias <= 10 ? 'alerta' : 'atencao', icone: 'casa', dias: v.dias, titulo: `Laudo · ${v.e.vendedor?.nome || 'vendedor'}`, detalhe: `válido até ${v.validade.split('-').reverse().join('/')}`, quando: quandoDias(v.dias), href: '#/engenharia' });
  }
  prazos.push(...alertasValidade({ emissoes, tipos, clientes, agora, rotaCliente: (c) => `#/cliente/${c.id}` }));
  prazos.sort((a, b) => a.dias - b.dias);
  return { fazer, prazos };
}

// Atividade recente: últimas mudanças de status
export function atividadeRecente(clientes, historico, { limite = 6, agora = new Date() } = {}) {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  return (historico || []).filter((x) => porId.has(x.cliente_id)).sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, limite)
    .map((x) => ({ cliente: porId.get(x.cliente_id), para: x.para, paraNome: R.STATUS.find((s) => s.codigo === x.para)?.nome || x.para, dias: R.diasDesde(x.em, agora), em: x.em }));
}

export const quandoCurto = (dias) => (dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`);

export const DICAS_EQUIPE = [
  'Confira primeiro os documentos mais antigos: cada dia parado atrasa o cliente e o corretor.',
  'Laudo de engenharia vale 180 dias. Avise o corretor antes de vencer para não perder a avaliação.',
  'Mensagem na conversa do cliente fica registrada: prefira ela ao WhatsApp solto para não perder o histórico.',
  'Processos parados há 5+ dias aparecem em laranja na lista de clientes. Comece por eles.',
  'Use Ctrl+K para achar qualquer cliente ou tela em segundos.',
  'Antes de recusar um documento, escreva o motivo com clareza: o corretor reenvia certo da primeira vez.',
];
export const DICAS_CORRETOR = [
  'Cadastro completo desde o início chega mais rápido na análise: confira os documentos marcados com ** antes de enviar.',
  'Peça a engenharia do imóvel antes de ter comprador: você já sabe o valor e a estratégia de venda.',
  'Laudo de engenharia vale 180 dias. Planeje a venda dentro desse prazo.',
  'Foto do documento: celular reto, boa luz e documento inteiro. Foto cortada é recusada.',
  'Responda as mensagens da CCA na conversa do cliente: o processo não anda enquanto uma dúvida está aberta.',
  'Use Ctrl+K para abrir qualquer cliente pelo nome ou CPF.',
];
export const dicaDoDia = (lista, agora = new Date()) => lista[Math.floor(agora.getTime() / DIA) % lista.length];

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

// ---------- Metas, aniversários, tempos e demais blocos ----------
const pluralD = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const META_CHAVES = { abertos: 'meta_abertos', minutas: 'meta_minutas', assinados: 'meta_contratos' };

// Andamento das metas do mês: quanto já foi, quanto era esperado até hoje e o ritmo
export function metasDoMes(metas, clientes, historico, agora = new Date()) {
  const diasMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const esperadoPct = Math.round((agora.getDate() / diasMes) * 100);
  return Object.keys(META_CHAVES).map((cod) => {
    const meta = Number(metas?.[cod]) || 0;
    const valor = indicador(cod, 'mes', clientes, historico, agora).valor;
    const pct = meta ? Math.round((valor / meta) * 100) : 0;
    const ritmo = meta ? (valor >= meta ? 'batida' : pct >= esperadoPct - 10 ? 'no_ritmo' : 'atrasada') : 'sem_meta';
    return { cod, nome: METRICAS.find(([k]) => k === cod)[1], meta, valor, pct, esperadoPct, falta: Math.max(0, meta - valor), ritmo };
  });
}

// Clientes que fazem aniversário no mês (ordem do dia)
export function aniversariantes(clientes, agora = new Date()) {
  return clientes.filter((c) => !c.rascunho && c.data_nascimento).map((c) => {
    const [a, m, d] = String(c.data_nascimento).slice(0, 10).split('-').map(Number);
    return { c, dia: d, mes: m - 1, idade: agora.getFullYear() - a };
  }).filter((x) => x.mes === agora.getMonth()).sort((a, b) => a.dia - b.dia || a.c.nome.localeCompare(b.c.nome))
    .map((x) => ({ ...x, hoje: x.dia === agora.getDate(), passou: x.dia < agora.getDate() }));
}

// Média de dias que os processos ficam em cada etapa (entre uma mudança de status e a seguinte)
export function tempoPorEtapa(historico, clientes) {
  const ids = new Set(clientes.filter((c) => !c.rascunho).map((c) => c.id));
  const porCliente = new Map();
  for (const x of historico || []) { if (!ids.has(x.cliente_id)) continue; if (!porCliente.has(x.cliente_id)) porCliente.set(x.cliente_id, []); porCliente.get(x.cliente_id).push(x); }
  const soma = new Map(); const qtd = new Map();
  for (const linhas of porCliente.values()) {
    linhas.sort((a, b) => String(a.em).localeCompare(String(b.em)));
    for (let i = 0; i < linhas.length - 1; i++) {
      const dias = Math.max(0, (new Date(linhas[i + 1].em) - new Date(linhas[i].em)) / DIA);
      soma.set(linhas[i].para, (soma.get(linhas[i].para) || 0) + dias); qtd.set(linhas[i].para, (qtd.get(linhas[i].para) || 0) + 1);
    }
  }
  const lista = R.STATUS.filter((s) => qtd.get(s.codigo)).map((s) => ({ codigo: s.codigo, nome: s.nome, media: Math.round((soma.get(s.codigo) / qtd.get(s.codigo)) * 10) / 10, n: qtd.get(s.codigo) }));
  const total = lista.reduce((s, x) => s + x.media, 0);
  return { itens: lista, total: Math.round(total * 10) / 10, maisLenta: lista.length ? lista.reduce((m, x) => (x.media > m.media ? x : m)) : null };
}

// Motivos de recusa de documentos nos últimos N dias
export function motivosRecusa(docs, { dias = 90, limite = 6, agora = new Date() } = {}) {
  const corte = agora.getTime() - dias * DIA;
  const conta = new Map(); let total = 0;
  for (const d of docs || []) {
    if (!d.motivo_recusa) continue;
    if (d.conferido_em && new Date(d.conferido_em).getTime() < corte) continue;
    conta.set(d.motivo_recusa, (conta.get(d.motivo_recusa) || 0) + 1); total++;
  }
  const itens = [...conta].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  return { total, itens: itens.slice(0, limite), restantes: Math.max(0, itens.length - limite) };
}

// Corretores sem cadastro novo há N dias (ou que nunca enviaram)
export function corretoresInativos(corretores, clientes, { dias = 30, agora = new Date() } = {}) {
  const ultimo = new Map();
  for (const c of clientes) { if (c.rascunho || !c.enviado_em) continue; if (!ultimo.has(c.corretor_id) || c.enviado_em > ultimo.get(c.corretor_id)) ultimo.set(c.corretor_id, c.enviado_em); }
  return (corretores || []).filter((p) => p.papel === 'corretor' && p.ativo !== false && !p.consumidor).map((p) => {
    const u = ultimo.get(p.id); const ref = u || p.criado_em || null;
    const parado = ref ? Math.floor((agora.getTime() - new Date(ref).getTime()) / DIA) : null;
    return { id: p.id, nome: p.nome, imobiliaria: p.imobiliaria_nome || 'Autônomo', whatsapp: p.whatsapp || null, nunca: !u, dias: parado };
  }).filter((x) => x.nunca || x.dias >= dias).sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
}

// Processos enviados por programa (MCMV, SBPE, Pró-Cotista...)
export function porPrograma(clientes) {
  const conta = new Map();
  for (const c of clientes) { if (c.rascunho) continue; const k = c.programa || 'Sem programa'; conta.set(k, (conta.get(k) || 0) + 1); }
  const total = [...conta.values()].reduce((s, n) => s + n, 0);
  return { total, itens: [...conta].map(([nome, valor]) => ({ nome, valor, sub: total ? `${Math.round((valor / total) * 100)}%` : '' })).sort((a, b) => b.valor - a.valor) };
}

// Aniversário de contrato assinado (1 ano, 2 anos...) nos próximos N dias
export function aniversarioContrato(clientes, historico, { janela = 30, agora = new Date() } = {}) {
  const porId = new Map(clientes.filter((c) => !c.rascunho).map((c) => [c.id, c]));
  const hoje = inicioDia(agora); const lista = [];
  for (const ev of eventos('assinados', clientes, historico)) {
    const c = porId.get(ev.cliente_id); if (!c) continue;
    const d0 = new Date(ev.em);
    for (const ano of [hoje.getFullYear(), hoje.getFullYear() + 1]) {
      const anos = ano - d0.getFullYear(); if (anos < 1) continue;
      const dia = new Date(ano, d0.getMonth(), d0.getDate());
      const dias = Math.round((dia.getTime() - hoje.getTime()) / DIA);
      if (dias >= -3 && dias <= janela) { lista.push({ c, anos, dias, data: dia }); break; }
    }
  }
  return lista.sort((a, b) => a.dias - b.dias);
}

// Resumo dos últimos 7 dias (e texto pronto para mandar no WhatsApp)
export function resumoSemana(clientes, historico, { agora = new Date(), limiteParado = 5, nome = '' } = {}) {
  const fim = agora; const ini = new Date(agora.getTime() - 7 * DIA); const antIni = new Date(agora.getTime() - 14 * DIA);
  const conta = (m, a, b) => eventos(m, clientes, historico).filter((e) => entre(e.em, a, b)).length;
  const linhas = METRICAS.map(([cod, rot]) => ({ cod, rot, valor: conta(cod, ini, fim), anterior: conta(cod, antIni, ini) }));
  const parados = clientes.filter((c) => R.diasParado(c, limiteParado, agora) > 0).length;
  const msgs = clientes.filter((c) => c.conversa_nao_lidas > 0).length;
  const dt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const texto = [`*Resumo da semana · ${dt(ini)} a ${dt(fim)}*${nome ? ` (${nome})` : ''}`, '',
    ...linhas.map((l) => `• ${l.rot}: ${l.valor} (semana anterior: ${l.anterior})`),
    '', `Processos parados há ${limiteParado}+ dias: ${parados}`, `Clientes com mensagem sem resposta: ${msgs}`].join('\n');
  return { linhas, parados, msgs, texto };
}
