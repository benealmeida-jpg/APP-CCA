// Relatórios do painel: filtros, números e tabelas, e o botão para baixar em Excel.
import { h, limpar, adicionar, toast, icone } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { botaoOpcao, chipStatus } from './componentes.js';
import { calcularRelatorio, planilhasDoRelatorio, intervaloPeriodo } from './relatorios-dados.js';
import { gerarXlsx, baixarArquivo } from './xlsx-simples.js';

const filtros = { periodo: 'tudo', de: '', ate: '', imobiliaria: '', corretor: '' };
const PERIODOS = [['mes', 'Este mês'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['personalizado', 'Escolher datas']];

const porcento = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const dias = (x) => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')} dia${x === 1 ? '' : 's'}`);
const dataBr = (d) => d.toLocaleDateString('pt-BR');

export async function secaoRelatorios(ctx, { cabecalho, secaoTitulo, tabela }) {
  if (!R.pode(ctx.perfil, 'ver_relatorios')) return [cabecalho('Relatórios', 'Seu perfil não vê relatórios.')];
  const [clientes, historico] = await Promise.all([api.listarClientes(), api.historicoStatus().catch(() => [])]);
  const enviados = clientes.filter((c) => !c.rascunho);
  const limiteParado = Number(ctx.config.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;

  // Opções dos filtros (a partir dos clientes que a pessoa vê)
  const imobs = [...new Map(enviados.map((c) => [c.imobiliaria_id || 'autonomo', c.imobiliaria_nome || 'Autônomo'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const corretoresDe = () => [...new Map(enviados.filter((c) => !filtros.imobiliaria || (c.imobiliaria_id || 'autonomo') === filtros.imobiliaria)
    .map((c) => [c.corretor_id, c.corretor_nome || '—'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

  const caixaFiltros = h('section', { class: 'cartao filtros-relatorio' });
  const corpo = h('div', { class: 'relatorio' });
  let atual = null;

  const descricao = () => {
    const per = PERIODOS.find(([p]) => p === filtros.periodo)?.[1] || 'Tudo';
    const { ini, fim } = intervaloPeriodo(filtros.periodo, filtros);
    const txtPer = filtros.periodo === 'personalizado'
      ? `${ini ? dataBr(ini) : 'início'} a ${fim ? dataBr(new Date(fim.getTime() - 864e5)) : 'hoje'}`
      : per;
    const imob = filtros.imobiliaria ? imobs.find(([k]) => k === filtros.imobiliaria)?.[1] : null;
    const cor = filtros.corretor ? enviados.find((c) => c.corretor_id === filtros.corretor)?.corretor_nome : null;
    return [txtPer, imob, cor].filter(Boolean).join(' · ');
  };

  const selecao = (id, rotulo, opcoes, valor, aoMudar) => h('div', { class: 'campo' },
    h('label', { for: id }, rotulo),
    h('select', { id, class: 'entrada', onchange: (e) => aoMudar(e.target.value) },
      opcoes.map(([v, nome]) => h('option', { value: v, selected: v === valor }, nome))));

  const desenharFiltros = () => {
    limpar(caixaFiltros);
    adicionar(caixaFiltros,
      h('div', { class: 'rotulo' }, 'Período (data de envio do cadastro)'),
      h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Período' },
        PERIODOS.map(([p, nome]) => botaoOpcao(nome, filtros.periodo === p, () => { filtros.periodo = p; desenharFiltros(); desenhar(); }, 'pilula'))),
      filtros.periodo === 'personalizado' ? h('div', { class: 'filtros-linha' },
        h('div', { class: 'campo' }, h('label', { for: 'rel-de' }, 'De'), h('input', { id: 'rel-de', class: 'entrada', type: 'date', value: filtros.de, onchange: (e) => { filtros.de = e.target.value; desenhar(); } })),
        h('div', { class: 'campo' }, h('label', { for: 'rel-ate' }, 'Até'), h('input', { id: 'rel-ate', class: 'entrada', type: 'date', value: filtros.ate, onchange: (e) => { filtros.ate = e.target.value; desenhar(); } }))) : null,
      h('div', { class: 'filtros-linha' },
        selecao('rel-imob', 'Imobiliária', [['', 'Todas'], ...imobs], filtros.imobiliaria, (v) => {
          filtros.imobiliaria = v;
          if (filtros.corretor && !corretoresDe().some(([k]) => k === filtros.corretor)) filtros.corretor = '';
          desenharFiltros(); desenhar();
        }),
        selecao('rel-corretor', 'Corretor', [['', 'Todos'], ...corretoresDe()], filtros.corretor, (v) => { filtros.corretor = v; desenhar(); })));
  };

  const kpi = (valor, rotulo, cor = '') => h('div', { class: `kpi ${cor}` }, h('b', null, valor), h('span', null, rotulo));

  const desenhar = () => {
    atual = calcularRelatorio({ clientes, historico, status: ctx.config.status, filtros, limiteParado });
    const r = atual.resumo;
    limpar(corpo);
    if (!r.enviados) {
      corpo.appendChild(h('div', { class: 'cartao' }, h('div', { class: 'subtitulo' }, 'Nenhum cadastro enviado com estes filtros.')));
      return;
    }
    adicionar(corpo,
      h('div', { class: 'kpis', role: 'group', 'aria-label': 'Resumo' },
        kpi(r.enviados, 'cadastros enviados'),
        kpi(r.aprovados, 'aprovados', 'verde'),
        kpi(porcento(r.taxa), 'taxa de aprovação', 'verde'),
        kpi(r.andamento, 'em andamento', 'azul'),
        kpi(r.parados, `parados há ${limiteParado}+ dias`, r.parados ? 'laranja' : ''),
        kpi(r.mediaDiasAprovacao === null ? '—' : String(r.mediaDiasAprovacao).replace('.', ','), 'dias em média até aprovar')),
      h('div', { class: 'relatorio-grade' },
        h('section', null, secaoTitulo('Por status', null, { pequeno: true }),
          tabela(['Status', 'Clientes', '%'], atual.porStatus.filter((s) => s.qtd).map((s) => [chipStatus(s.codigo, s.nome), s.qtd,
            h('div', { class: 'barra-pct' }, h('i', { style: { width: `${Math.round(s.pct * 100)}%` } }), h('span', null, porcento(s.pct)))]), '')),
        h('section', null, secaoTitulo('Tempo em cada etapa', 'Média de dias entre entrar e sair do status.', { pequeno: true }),
          tabela(['Etapa', 'Média', 'Maior', 'Nela agora'], atual.porEtapa.map((e) => [h('b', null, e.nome), dias(e.mediaDias), dias(e.maiorDias),
            e.agora ? `${e.agora} (média ${dias(e.mediaDiasAgora)})` : '—']), ''))),
      h('section', null, secaoTitulo('Por imobiliária', null, { pequeno: true }),
        tabela(['Imobiliária', 'Enviados', 'Em andamento', 'Aprovados', 'Taxa', 'Parados', 'Até aprovar'], atual.porImobiliaria.map((g) => [h('b', null, g.nome), g.enviados, g.andamento, g.aprovados, porcento(g.taxa), g.parados || '—', dias(g.mediaDiasAprovacao)]), '')),
      h('section', null, secaoTitulo('Por corretor', null, { pequeno: true }),
        tabela(['Corretor', 'Imobiliária', 'Enviados', 'Em andamento', 'Aprovados', 'Taxa', 'Parados', 'Até aprovar'], atual.porCorretor.map((g) => [h('b', null, g.nome), g.extra || 'Autônomo', g.enviados, g.andamento, g.aprovados, porcento(g.taxa), g.parados || '—', dias(g.mediaDiasAprovacao)]), '')));
  };

  const baixar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, icone('baixar', { tam: 18, cor: '#1C2B36' }), 'Baixar Excel');
  baixar.onclick = () => {
    if (!atual?.resumo.enviados) return toast('Nada para baixar com estes filtros.');
    try {
      const blob = gerarXlsx(planilhasDoRelatorio(atual, { descricaoFiltro: descricao() }));
      const hoje = new Date();
      baixarArquivo(blob, `relatorio-app-cca-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}.xlsx`);
      toast('Relatório baixado. Abra no Excel ou no Google Planilhas.');
    } catch (e) { console.error(e); toast('Não consegui gerar o Excel. Tente de novo.'); }
  };

  desenharFiltros();
  desenhar();
  return [
    cabecalho({ titulo: 'Relatórios', sobre: 'Números da operação', sub: 'Cadastros, aprovações e tempo de cada etapa. Filtre e baixe em Excel com todas as abas.' }, baixar),
    caixaFiltros,
    corpo,
  ];
}
