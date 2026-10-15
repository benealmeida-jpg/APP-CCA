// Gestão da imobiliária: painel do gestor (somente leitura). Mostra o que cada corretor está fazendo.
import { h, limpar, icone } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho, chipStatus } from './componentes.js';
import * as G from './gestao-dados.js';
import { caixa, seletor, barrasHorizontais, vazio, numero, blocoIndicadores, blocoFunil, blocoComparativo, blocoRanking, escolhas } from './inicio.js';

const quando = (iso) => {
  if (!iso) return '—';
  const d = R.diasDesde(iso);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
};
const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function cartaoNumero(rotulo, valor, dica, tom = '') {
  return h('div', { class: `ini-kpi${tom ? ` ${tom}` : ''}`, title: dica }, h('span', { class: 'ini-kpi-nome' }, rotulo), h('span', { class: 'ini-kpi-valor' }, numero(valor)), h('small', { class: 'gest-dica' }, dica));
}

// Conversa de um cliente, só para ler
function conversaSomenteLeitura(clienteId) {
  const area = h('div', { class: 'gest-conversa-corpo' }, h('div', { class: 'sub' }, 'Carregando a conversa…'));
  api.listarConversa(clienteId).then((msgs) => {
    limpar(area);
    if (!msgs.length) { area.appendChild(h('div', { class: 'sub' }, 'Nenhuma mensagem ainda.')); return; }
    msgs.slice(-12).forEach((m) => area.appendChild(h('div', { class: `gest-msg${m.da_equipe ? ' equipe' : ''}` },
      h('div', { class: 'gest-msg-topo' }, h('b', null, m.autor_nome), h('span', null, hora(m.criada_em))), h('p', null, m.texto))));
  }).catch((e) => { limpar(area); area.appendChild(h('div', { class: 'sub' }, e.message)); });
  return area;
}

export async function conteudoGestao({ perfil, config }) {
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const [clientes, historico, corretores] = await Promise.all([api.listarClientes(), api.historicoStatus().catch(() => []), api.corretoresDaImobiliaria().catch(() => [])]);
  const agora = new Date();
  const estado = { corretor: '' };
  const corpo = h('div', { class: 'gest-corpo' });

  const desenhar = () => {
    limpar(corpo);
    const doCorretor = estado.corretor ? clientes.filter((c) => c.corretor_id === estado.corretor) : clientes;
    const hist = estado.corretor ? historico.filter((x) => doCorretor.some((c) => c.id === x.cliente_id)) : historico;
    const r = G.resumoGestao(clientes, { limiteParado, agora, corretorId: estado.corretor || null });
    const linhas = G.porCorretor(clientes, corretores, { limiteParado, agora });
    const parados = G.processosParados(clientes, { limiteParado, agora, corretorId: estado.corretor || null });
    const conversas = G.conversasDaImobiliaria(clientes, { corretorId: estado.corretor || null });

    corpo.appendChild(h('div', { class: 'ini-kpis gest-kpis' },
      cartaoNumero('Em andamento', r.andamento, 'Do cadastro até a entrevista'),
      cartaoNumero('Em finalização', r.finalizacao, 'Da conformidade ao registro'),
      cartaoNumero('Finalizados', r.finalizados, 'Crédito liberado'),
      cartaoNumero('Parados', r.parados, `${limiteParado} dias ou mais na mesma etapa`, r.parados ? 'alerta' : 'suave'),
      cartaoNumero('Com pendência', r.pendencias, 'Documento faltando ou recusado', r.pendencias ? 'alerta' : 'suave'),
      cartaoNumero('Mensagens novas', r.naoLidas, 'Conversas com a CCA', 'suave')));

    corpo.appendChild(blocoIndicadores(doCorretor, hist, { titulo: estado.corretor ? 'Desempenho do corretor' : 'Desempenho da imobiliária' }));

    const grade = h('div', { class: 'ini-grade' });
    // Corretores
    const lista = h('div', { class: 'gest-corretores' }, linhas.length ? linhas.map((l) => h('button', { type: 'button', class: `gest-corretor${estado.corretor === l.id ? ' ativo' : ''}`, 'aria-pressed': estado.corretor === l.id ? 'true' : 'false',
      onclick: () => { estado.corretor = estado.corretor === l.id ? '' : l.id; seletorCorretor.value = estado.corretor; desenhar(); } },
      h('span', { class: 'gest-corretor-nome' }, h('b', null, l.nome), h('small', null, l.antigo ? 'Não está mais na imobiliária' : l.gestor ? 'Documentação' : l.total ? `Última atividade ${quando(l.ultima)}` : 'Ainda sem clientes')),
      h('span', { class: 'gest-num', title: 'Em andamento' }, h('b', null, l.andamento), h('small', null, 'andamento')),
      h('span', { class: 'gest-num', title: 'Em finalização' }, h('b', null, l.finalizacao), h('small', null, 'finalização')),
      h('span', { class: 'gest-num', title: 'Finalizados' }, h('b', null, l.finalizados), h('small', null, 'finalizados')),
      h('span', { class: `gest-num${l.parados ? ' alerta' : ''}`, title: 'Parados' }, h('b', null, l.parados), h('small', null, 'parados')),
      h('span', { class: `gest-num${l.pendencias ? ' atencao' : ''}`, title: 'Com pendência de documentos' }, h('b', null, l.pendencias), h('small', null, 'pendências')))) : vazio('Nenhum corretor na imobiliária ainda.', 'pessoas'));
    grade.appendChild(h('div', { class: 'ini-col-12' }, caixa('Corretores', 'Toque em um corretor para ver só os clientes dele', null, lista)));

    grade.appendChild(h('div', { class: 'ini-col-5' }, blocoFunil(doCorretor, 'Processos em cada etapa')));
    const itensParados = parados.length ? h('ul', { class: 'gest-parados' }, parados.map((p) => h('li', null, h('a', { href: `#/cliente/${p.id}` },
      h('span', { class: 'gest-parado-nome' }, h('b', null, p.nome), h('small', null, p.corretor)), chipStatus(p.status), h('span', { class: 'ini-chip tom-atencao' }, `${p.dias} dias`)))))
      : vazio('Nenhum processo parado. Tudo andando.');
    grade.appendChild(h('div', { class: 'ini-col-7' }, caixa('Processos parados', `${limiteParado} dias ou mais na mesma etapa`, null, itensParados)));

    const itensConversa = conversas.length ? h('ul', { class: 'gest-conversas' }, conversas.map((c) => {
      const detalhe = h('div', { class: 'gest-conversa', hidden: true });
      const botao = h('button', { type: 'button', class: 'gest-conversa-linha', 'aria-expanded': 'false', onclick: () => {
        const abrir = detalhe.hidden; detalhe.hidden = !abrir; botao.setAttribute('aria-expanded', String(abrir));
        if (abrir && !detalhe.childNodes.length) { detalhe.appendChild(h('div', { class: 'gest-leitura' }, icone('olho', { tam: 14, traco: 2.2 }), 'Somente leitura')); detalhe.appendChild(conversaSomenteLeitura(c.id)); }
      } }, h('span', { class: 'gest-parado-nome' }, h('b', null, c.nome), h('small', null, `${c.corretor} · ${quando(c.ultima)}`)), c.naoLidas ? h('span', { class: 'ini-chip tom-atencao' }, `${c.naoLidas} nova${c.naoLidas > 1 ? 's' : ''}`) : null, icone('baixo', { tam: 16, traco: 2.2 }));
      return h('li', null, botao, detalhe);
    })) : vazio('Nenhuma conversa com a CCA ainda.', 'conversa');
    grade.appendChild(h('div', { class: 'ini-col-12' }, caixa('Conversas com a CCA', 'Só leitura. Para responder, o corretor abre o cliente', null, itensConversa)));

    grade.appendChild(h('div', { class: 'ini-col-7' }, blocoComparativo(doCorretor, hist, 'Comparativo dos últimos meses')));
    escolhas.rankGrupo = 'corretor';
    grade.appendChild(h('div', { class: 'ini-col-5' }, blocoRanking(clientes, historico, { titulo: 'Disputa entre os corretores', grupos: [['corretor', 'Corretores']] })));
    corpo.appendChild(grade);
  };

  const seletorEl = seletor('Corretor', [['', 'Todos os corretores'], ...corretores.map((u) => [u.id, u.nome])], '', (v) => { estado.corretor = v; desenhar(); });
  const seletorCorretor = seletorEl.querySelector('select');
  desenhar();
  return [cabecalho({ sobre: 'Gestão', titulo: perfil.imobiliaria_nome || 'Gestão da imobiliária', sub: 'Veja em que fase está cada processo e o que cada corretor está fazendo.' }, seletorEl), corpo];
}
