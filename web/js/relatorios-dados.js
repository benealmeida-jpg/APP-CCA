// Cálculos dos relatórios do painel (sem tela: dá para testar no Node).
import * as R from './regras.js';

export const STATUS_APROVADOS = ['cliente_aprovado', 'conformidade', 'minuta_em_maos', 'contrato_assinado'];
const DIA = 864e5;
const um = (n) => Math.round(n * 10) / 10;
const media = (xs) => (xs.length ? um(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

// Período pela data de envio do cadastro
export function intervaloPeriodo(periodo, { de, ate } = {}, agora = new Date()) {
  const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hoje = inicioDia(agora);
  if (periodo === 'mes') return { ini: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: null };
  if (periodo === '30') return { ini: new Date(hoje.getTime() - 29 * DIA), fim: null };
  if (periodo === '90') return { ini: new Date(hoje.getTime() - 89 * DIA), fim: null };
  if (periodo === 'ano') return { ini: new Date(hoje.getFullYear(), 0, 1), fim: null };
  if (periodo === 'personalizado') {
    const p = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    const fim = p(ate);
    return { ini: p(de), fim: fim ? new Date(fim.getTime() + DIA) : null }; // até o fim do dia escolhido
  }
  return { ini: null, fim: null };
}

// Linha do tempo de cada cliente: [{ status, desde, ate }]
export function linhaDoTempo(cliente, historico, agora = new Date()) {
  const eventos = historico.filter((h) => h.cliente_id === cliente.id).sort((a, b) => String(a.em).localeCompare(String(b.em)));
  const inicio = cliente.enviado_em || cliente.criado_em;
  const trechos = [];
  let status = eventos[0]?.de || cliente.status;
  let desde = inicio ? new Date(inicio) : (eventos[0] ? new Date(eventos[0].em) : null);
  for (const e of eventos) {
    const em = new Date(e.em);
    if (desde && em >= desde) trechos.push({ status, desde, ate: em });
    status = e.para; desde = em;
  }
  if (desde) trechos.push({ status, desde, ate: null, aberto: true, agora });
  return trechos;
}

export function calcularRelatorio({ clientes, historico = [], status = R.STATUS, filtros = {}, limiteParado = R.PARAMETROS_PADRAO.dias_alerta_parado, agora = new Date() }) {
  const { ini, fim } = intervaloPeriodo(filtros.periodo || 'tudo', filtros, agora);
  const base = clientes.filter((c) => !c.rascunho).filter((c) => {
    const env = new Date(c.enviado_em || c.criado_em || c.atualizado_em);
    if (ini && env < ini) return false;
    if (fim && env >= fim) return false;
    if (filtros.imobiliaria === 'autonomo' && c.imobiliaria_id) return false;
    if (filtros.imobiliaria && filtros.imobiliaria !== 'autonomo' && c.imobiliaria_id !== filtros.imobiliaria) return false;
    if (filtros.corretor && c.corretor_id !== filtros.corretor) return false;
    return true;
  });

  const nomeStatus = Object.fromEntries(status.map((s) => [s.codigo, s.nome]));
  const linhas = base.map((c) => {
    const tempo = linhaDoTempo(c, historico, agora);
    const aprov = historico.filter((h) => h.cliente_id === c.id && STATUS_APROVADOS.includes(h.para)).map((h) => h.em).sort()[0] || null;
    const envio = c.enviado_em || c.criado_em;
    const diasAprov = aprov && envio ? um(Math.max(0, (new Date(aprov) - new Date(envio)) / DIA)) : null;
    return { c, tempo, aprovadoEm: aprov, diasAteAprovar: diasAprov, aprovado: STATUS_APROVADOS.includes(c.status),
      diasNoStatus: R.diasDesde(c.status_desde || envio, agora), parado: R.diasParado(c, limiteParado, agora) };
  });

  const resumo = {
    enviados: linhas.length,
    aprovados: linhas.filter((l) => l.aprovado).length,
    andamento: linhas.filter((l) => !l.aprovado).length,
    contratos: linhas.filter((l) => l.c.status === 'contrato_assinado').length,
    parados: linhas.filter((l) => l.parado > 0).length,
    pendentes: linhas.filter((l) => l.c.docs_pendentes > 0 || l.c.docs_recusados > 0).length,
    mediaDiasAprovacao: media(linhas.map((l) => l.diasAteAprovar).filter((x) => x !== null)),
  };
  resumo.taxa = resumo.enviados ? resumo.aprovados / resumo.enviados : null;

  const porStatus = status.map((s) => {
    const n = linhas.filter((l) => l.c.status === s.codigo).length;
    return { codigo: s.codigo, nome: s.nome, qtd: n, pct: linhas.length ? n / linhas.length : 0 };
  });

  const agrupar = (chave, nome) => {
    const m = new Map();
    for (const l of linhas) {
      const k = chave(l.c);
      if (!m.has(k)) m.set(k, { chave: k, nome: nome(l.c), extra: l.c.imobiliaria_nome, enviados: 0, aprovados: 0, andamento: 0, parados: 0, dias: [] });
      const g = m.get(k);
      g.enviados++; if (l.aprovado) g.aprovados++; else g.andamento++;
      if (l.parado) g.parados++;
      if (l.diasAteAprovar !== null) g.dias.push(l.diasAteAprovar);
    }
    return [...m.values()].map(({ dias, ...g }) => ({ ...g, taxa: g.enviados ? g.aprovados / g.enviados : 0, mediaDiasAprovacao: media(dias) }))
      .sort((a, b) => b.enviados - a.enviados || a.nome.localeCompare(b.nome, 'pt-BR'));
  };
  const porImobiliaria = agrupar((c) => c.imobiliaria_id || 'autonomo', (c) => c.imobiliaria_nome || 'Autônomo');
  const porCorretor = agrupar((c) => c.corretor_id, (c) => c.corretor_nome || '—');

  // Tempo em cada etapa: passagens concluídas (entrou e saiu) e quem está nela agora
  const porEtapa = status.map((s) => {
    const feitos = []; const abertos = [];
    for (const l of linhas) for (const t of l.tempo) {
      if (t.status !== s.codigo) continue;
      if (t.ate) feitos.push((t.ate - t.desde) / DIA);
      else abertos.push((agora - t.desde) / DIA);
    }
    return { codigo: s.codigo, nome: s.nome, passagens: feitos.length, mediaDias: media(feitos), maiorDias: feitos.length ? um(Math.max(...feitos)) : null,
      agora: abertos.length, mediaDiasAgora: media(abertos) };
  });

  return { filtrados: linhas, resumo, porStatus, porImobiliaria, porCorretor, porEtapa, nomeStatus };
}

const pct = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

// Planilhas do Excel a partir do relatório
export function planilhasDoRelatorio(rel, { descricaoFiltro = '', geradoEm = new Date() } = {}) {
  const r = rel.resumo;
  return [
    { nome: 'Resumo', titulo: `Relatório APP CCA · ${descricaoFiltro}`, colunas: [{ titulo: 'Indicador', largura: 42 }, { titulo: 'Valor', largura: 16 }],
      linhas: [
        ['Gerado em', geradoEm.toLocaleString('pt-BR')],
        ['Cadastros enviados', r.enviados],
        ['Aprovados (de Cliente Aprovado em diante)', r.aprovados],
        ['Taxa de aprovação', r.taxa === null ? '—' : `${Math.round(r.taxa * 100)}%`],
        ['Em andamento', r.andamento],
        ['Contratos assinados', r.contratos],
        ['Com documento pendente ou recusado', r.pendentes],
        ['Parados agora', r.parados],
        ['Tempo médio do envio até a aprovação (dias)', r.mediaDiasAprovacao ?? '—'],
      ] },
    { nome: 'Clientes', colunas: [
      { titulo: 'Cliente', largura: 30 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Corretor', largura: 24 }, { titulo: 'Imobiliária', largura: 26 },
      { titulo: 'Programa', largura: 14 }, { titulo: 'Operação', largura: 30 }, { titulo: 'Imóvel', largura: 12 }, { titulo: 'Status', largura: 24 },
      { titulo: 'Enviado em', tipo: 'data', largura: 13 }, { titulo: 'No status desde', tipo: 'data', largura: 15 }, { titulo: 'Dias no status', tipo: 'numero', largura: 14 },
      { titulo: 'Parado', largura: 9 }, { titulo: 'Docs pendentes', tipo: 'numero', largura: 15 }, { titulo: 'Docs recusados', tipo: 'numero', largura: 15 },
      { titulo: 'Aprovado em', tipo: 'data', largura: 13 }, { titulo: 'Dias até aprovar', tipo: 'dias', largura: 16 }],
    linhas: rel.filtrados.map((l) => [l.c.nome, R.formatarCpf(l.c.cpf || ''), l.c.corretor_nome, l.c.imobiliaria_nome, l.c.programa || '', l.c.modalidade || '', l.c.imovel || '',
      rel.nomeStatus[l.c.status] || l.c.status_nome || l.c.status, l.c.enviado_em || l.c.criado_em, l.c.status_desde || null, l.diasNoStatus,
      l.parado ? 'Sim' : 'Não', l.c.docs_pendentes || 0, l.c.docs_recusados || 0, l.aprovadoEm, l.diasAteAprovar]) },
    { nome: 'Por status', colunas: [{ titulo: 'Status', largura: 26 }, { titulo: 'Clientes', tipo: 'numero' }, { titulo: '% do total', tipo: 'percentual', largura: 12 }],
      linhas: rel.porStatus.map((s) => [s.nome, s.qtd, pct(s.pct)]) },
    { nome: 'Por imobiliária', colunas: [{ titulo: 'Imobiliária', largura: 30 }, { titulo: 'Enviados', tipo: 'numero' }, { titulo: 'Em andamento', tipo: 'numero', largura: 14 },
      { titulo: 'Aprovados', tipo: 'numero', largura: 11 }, { titulo: 'Taxa de aprovação', tipo: 'percentual', largura: 18 }, { titulo: 'Parados', tipo: 'numero' }, { titulo: 'Dias médios até aprovar', tipo: 'dias', largura: 22 }],
      linhas: rel.porImobiliaria.map((g) => [g.nome, g.enviados, g.andamento, g.aprovados, pct(g.taxa), g.parados, g.mediaDiasAprovacao]) },
    { nome: 'Por corretor', colunas: [{ titulo: 'Corretor', largura: 26 }, { titulo: 'Imobiliária', largura: 26 }, { titulo: 'Enviados', tipo: 'numero' }, { titulo: 'Em andamento', tipo: 'numero', largura: 14 },
      { titulo: 'Aprovados', tipo: 'numero', largura: 11 }, { titulo: 'Taxa de aprovação', tipo: 'percentual', largura: 18 }, { titulo: 'Parados', tipo: 'numero' }, { titulo: 'Dias médios até aprovar', tipo: 'dias', largura: 22 }],
      linhas: rel.porCorretor.map((g) => [g.nome, g.extra || 'Autônomo', g.enviados, g.andamento, g.aprovados, pct(g.taxa), g.parados, g.mediaDiasAprovacao]) },
    { nome: 'Tempo por etapa', colunas: [{ titulo: 'Etapa (status)', largura: 26 }, { titulo: 'Passagens concluídas', tipo: 'numero', largura: 20 }, { titulo: 'Dias em média', tipo: 'dias', largura: 14 },
      { titulo: 'Maior tempo (dias)', tipo: 'dias', largura: 18 }, { titulo: 'Clientes nela agora', tipo: 'numero', largura: 19 }, { titulo: 'Dias em média (agora)', tipo: 'dias', largura: 21 }],
      linhas: rel.porEtapa.map((e) => [e.nome, e.passagens, e.mediaDias, e.maiorDias, e.agora, e.mediaDiasAgora]) },
  ];
}
