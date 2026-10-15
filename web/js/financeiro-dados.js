// Financeiro da CCA (Modelo 2): faturamento dos contratos assinados, despesas e fechamento do mês. Regras puras.
// A CCA recebe da Caixa um percentual bruto do valor financiado, só depois do contrato assinado; desse valor sai o imposto.

export const PADRAO = { taxa_bruta: 8, imposto: 18 };

// Quem pode o quê no financeiro. Nível 1 (CEO da CCA) pode tudo; os níveis 2 e 3 seguem o que o nível 1 marcar.
export const PERMISSOES = [
  ['lancar_despesas', 'Lançar despesas'],
  ['lancar_creditos', 'Lançar créditos'],
  ['ver_todos', 'Ver todos os lançamentos (sem isso, vê só os seus)'],
];
export const PERMISSOES_PADRAO = {
  2: { lancar_despesas: true, lancar_creditos: true, ver_todos: true },
  3: { lancar_despesas: true, lancar_creditos: false, ver_todos: false },
};
export function acessoFinanceiro(nivel, permissoes = PERMISSOES_PADRAO) {
  if (nivel === 1) return { faturamento: true, fechamento: true, lancar_despesas: true, lancar_creditos: true, ver_todos: true, permissoes: true };
  const p = { ...(PERMISSOES_PADRAO[nivel] || {}), ...((permissoes || {})[nivel] || {}) };
  return { faturamento: false, fechamento: false, lancar_despesas: !!p.lancar_despesas, lancar_creditos: !!p.lancar_creditos, ver_todos: !!p.ver_todos, permissoes: false };
}
export const podeLancar = (a) => !!(a && (a.lancar_despesas || a.lancar_creditos));

// Categorias dos lançamentos
export const CATEGORIAS = {
  fixa: ['Aluguel', 'Condomínio', 'Energia elétrica', 'Água', 'Internet', 'Telefone', 'Contador', 'Salários', 'Pró-labore', 'Sistemas e assinaturas', 'Impostos e taxas', 'Outras fixas'],
  variavel: ['Material de escritório', 'Transporte e combustível', 'Brindes e campanhas', 'Cartório e certidões', 'Marketing', 'Manutenção', 'Alimentação', 'Outras variáveis'],
  credito: ['Outras receitas', 'Reembolso', 'Aporte', 'Outros créditos'],
};
export const NOME_TIPO = { fixa: 'Despesa fixa', variavel: 'Despesa variável', credito: 'Crédito' };

// ---------- datas ----------
const doisDig = (n) => String(n).padStart(2, '0');
export const dataLocal = (v) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
};
export const mesDe = (data) => (data ? String(data).slice(0, 7) : null);
export function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${doisDig((t % 12) + 1)}`;
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
export const nomeMesCurto = (mes) => { const [a, m] = mes.split('-'); return `${m}/${a}`; };
export const dataBr = (data) => (data ? data.split('-').reverse().join('/') : '—');

// Páscoa (algoritmo de Meeus), para os feriados móveis
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(ano, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
// Feriados nacionais e dias sem expediente bancário (Carnaval, Sexta-feira Santa, Corpus Christi)
const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
export function feriados(ano) {
  const p = pascoa(ano);
  const desloca = (n) => { const d = new Date(p); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return new Set([...FIXOS.map((x) => `${ano}-${x}`), desloca(-48), desloca(-47), desloca(-2), desloca(60)]);
}
export function diaUtil(data) {
  const [a, m, d] = data.split('-').map(Number);
  const sem = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return sem !== 0 && sem !== 6 && !feriados(a).has(data);
}
// Dia do fechamento: penúltimo dia útil do mês
export function diaFechamento(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const uteis = [];
  for (let d = ultimo; d >= 1 && uteis.length < 2; d--) { const x = `${mes}-${doisDig(d)}`; if (diaUtil(x)) uteis.push(x); }
  return uteis[1] || uteis[0];
}
// Em que mês o contrato entra: assinado até o dia do fechamento, no próprio mês; depois, no mês seguinte.
// Se esse mês já foi fechado sem ele (dado lançado depois), entra no próximo mês aberto.
export function competencia(dataAssinatura, { fechamentos = {}, id = null } = {}) {
  const data = dataLocal(dataAssinatura);
  if (!data) return null;
  let mes = mesDe(data);
  if (data > diaFechamento(mes)) mes = somarMes(mes, 1);
  for (let i = 0; i < 24 && fechamentos[mes] && !(id && (fechamentos[mes].ids || []).includes(id)); i++) mes = somarMes(mes, 1);
  return mes;
}
// Mês aberto hoje (o que vai fechar no próximo fechamento)
export const mesAberto = (hoje = new Date(), fechamentos = {}) => competencia(dataLocal(hoje), { fechamentos });

// ---------- valores ----------
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
export function valorEmNumero(texto) {
  if (texto == null || texto === '') return null;
  if (typeof texto === 'number') return texto;
  const limpo = String(texto).replace(/[^\d,.-]/g, '');
  const n = limpo.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(limpo) ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo);
  return Number.isFinite(n) ? n : null;
}
export function calcular(valorFinanciado, { taxa_bruta = PADRAO.taxa_bruta, imposto = PADRAO.imposto } = {}) {
  const bruto = centavos((Number(valorFinanciado) || 0) * taxa_bruta / 100);
  const imp = centavos(bruto * imposto / 100);
  return { bruto, imposto: imp, liquido: centavos(bruto - imp) };
}

// contratos: [{ id, nome, contrato_numero, valor_financiado, assinado_em, corretor_nome, imobiliaria_nome }]
export function faturamentoDoMes(contratos, mes, { parametros = PADRAO, fechamentos = {} } = {}) {
  const fechado = fechamentos[mes] || null;
  const itens = contratos.filter((c) => (fechado ? (fechado.ids || []).includes(c.id) : competencia(c.assinado_em, { fechamentos, id: c.id }) === mes))
    .map((c) => {
      const taxas = fechado ? { taxa_bruta: fechado.taxa_bruta, imposto: fechado.imposto } : parametros;
      const valor = fechado?.valores?.[c.id] ?? c.valor_financiado;
      return { ...c, valor_financiado: valor, ...calcular(valor, taxas), faltaDados: !valor || !c.contrato_numero };
    })
    .sort((a, b) => String(a.assinado_em).localeCompare(String(b.assinado_em)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const soma = (k) => centavos(itens.reduce((s, x) => s + (Number(x[k]) || 0), 0));
  return {
    mes, fechamento: diaFechamento(mes), fechado, itens,
    totais: { contratos: itens.length, valor: soma('valor_financiado'), bruto: soma('bruto'), imposto: soma('imposto'), liquido: soma('liquido') },
    pendentes: itens.filter((x) => x.faltaDados).length,
    taxas: fechado ? { taxa_bruta: fechado.taxa_bruta, imposto: fechado.imposto } : parametros,
  };
}
// Retrato do mês no fechamento (não muda mais, mesmo que a taxa mude depois)
export function retratoFechamento(fat, { por = null, em = new Date().toISOString() } = {}) {
  return { ids: fat.itens.map((x) => x.id), valores: Object.fromEntries(fat.itens.map((x) => [x.id, x.valor_financiado])), taxa_bruta: fat.taxas.taxa_bruta, imposto: fat.taxas.imposto,
    bruto: fat.totais.bruto, liquido: fat.totais.liquido, em, por, nfe: null, recebido_em: null };
}

// Lançamentos: [{ id, mes, tipo: 'fixa'|'variavel'|'credito', categoria, descricao, valor, data, autor_id }]
export function resumoLancamentos(lancamentos, mes) {
  const doMes = lancamentos.filter((l) => l.mes === mes);
  const soma = (f) => centavos(doMes.filter(f).reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const porCategoria = {};
  doMes.filter((l) => l.tipo !== 'credito').forEach((l) => { porCategoria[l.categoria] = centavos((porCategoria[l.categoria] || 0) + (Number(l.valor) || 0)); });
  const fixas = soma((l) => l.tipo === 'fixa'), variaveis = soma((l) => l.tipo === 'variavel'), creditos = soma((l) => l.tipo === 'credito');
  return { fixas, variaveis, despesas: centavos(fixas + variaveis), creditos, quantidade: doMes.length,
    porCategoria: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]) };
}
// Resultado do mês: líquido da Caixa + outros créditos − despesas
export function resultadoDoMes(fat, resumo) {
  const entradas = centavos(fat.totais.liquido + resumo.creditos);
  return { liquidoCaixa: fat.totais.liquido, creditos: resumo.creditos, entradas, despesas: resumo.despesas, resultado: centavos(entradas - resumo.despesas) };
}
// Despesas fixas do mês anterior que ainda não foram lançadas neste mês (mesma categoria e descrição)
export function fixasParaCopiar(lancamentos, mes) {
  const doMes = lancamentos.filter((l) => l.mes === mes && l.tipo === 'fixa');
  const chave = (l) => `${l.categoria}|${(l.descricao || '').trim().toLowerCase()}`;
  const ja = new Set(doMes.map(chave));
  return lancamentos.filter((l) => l.mes === somarMes(mes, -1) && l.tipo === 'fixa' && !ja.has(chave(l)));
}

// ---------- NF-e e planilha ----------
const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function textoNfe(fat) {
  const numeros = fat.itens.map((x) => x.contrato_numero).filter(Boolean);
  return `Serviços de correspondente Caixa Aqui prestados à Caixa Econômica Federal, competência ${nomeMesCurto(fat.mes)}: `
    + `${fat.totais.contratos} contrato${fat.totais.contratos === 1 ? '' : 's'} de financiamento habitacional assinado${fat.totais.contratos === 1 ? '' : 's'}`
    + `${numeros.length ? ` (${numeros.join(', ')})` : ''}. Valor financiado total: ${reais(fat.totais.valor)}.`;
}
// Planilha do mês (para o Excel): uma linha por contrato e o total
export function planilhaFaturamento(fat) {
  const linhas = fat.itens.map((x) => [x.nome, x.contrato_numero || '', dataLocal(x.assinado_em), [x.corretor_nome, x.imobiliaria_nome].filter(Boolean).join(' / '), x.valor_financiado ?? null, x.bruto, x.imposto, x.liquido]);
  linhas.push(['Total', '', null, `${fat.totais.contratos} contrato${fat.totais.contratos === 1 ? '' : 's'}`, fat.totais.valor, fat.totais.bruto, fat.totais.imposto, fat.totais.liquido]);
  return [{ nome: `Faturamento ${nomeMesCurto(fat.mes).replace('/', '-')}`, titulo: `Faturamento da CCA · ${nomeMes(fat.mes)}${fat.fechado ? ' (fechado)' : ''}`,
    colunas: [{ titulo: 'Cliente', largura: 30 }, { titulo: 'Número do contrato', largura: 22 }, { titulo: 'Assinado em', tipo: 'data', largura: 13 }, { titulo: 'Corretor / imobiliária', largura: 32 },
      { titulo: 'Valor financiado', tipo: 'numero', largura: 17 }, { titulo: `Bruto (${fat.taxas.taxa_bruta}%)`, tipo: 'numero', largura: 14 }, { titulo: `Imposto (${fat.taxas.imposto}%)`, tipo: 'numero', largura: 14 }, { titulo: 'Líquido CCA', tipo: 'numero', largura: 14 }],
    linhas }];
}
