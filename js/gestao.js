// Gestão da imobiliária: painel do gestor (somente leitura). Mostra o que cada corretor está fazendo.
import { h, limpar, icone, toast } from './dom.js';
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

const textoConvite = ({ nome, link, expira, imobiliaria }) => {
  const ola = nome && String(nome).trim() ? `${R.saudacao()}, ${R.primeiroNome(nome)}!` : `${R.saudacao()}!`;
  return `${ola} Você foi convidado(a) para o Portal do Corretor da Andrade Almeida CCA${imobiliaria ? `, pela ${imobiliaria}` : ''}.\nToque no link, preencha os seus dados e crie a sua senha:\n${link}${expira ? `\n\nO convite vale até ${new Date(expira).toLocaleDateString('pt-BR')}.` : ''}`;
};

export async function conteudoGestao({ perfil, config }) {
  const limiteParado = Number(config?.parametros?.dias_alerta_parado) || R.PARAMETROS_PADRAO.dias_alerta_parado;
  const agora = new Date();
  let clientes = []; let historico = []; let corretores = []; let equipeTodos = []; let convites = [];
  const carregar = async () => {
    [clientes, historico, corretores, equipeTodos, convites] = await Promise.all([api.listarClientes(), api.historicoStatus().catch(() => []), api.corretoresDaImobiliaria().catch(() => []),
      api.equipeDaImobiliaria().catch(() => []), api.listarConvites().catch(() => [])]);
  };
  await carregar();
  const recarregar = async () => { await carregar(); desenhar(); };
  const estado = { corretor: '', convidando: false, gerado: null, desligando: null };
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

    grade.appendChild(h('div', { class: 'ini-col-12' }, cartaoEquipe()));
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

  // Equipe: convidar, desligar e reativar corretores da própria imobiliária
  const cartaoEquipe = () => {
    const botaoConvidar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'gestConvidar', 'aria-expanded': String(estado.convidando),
      onclick: () => { estado.convidando = !estado.convidando; estado.gerado = null; desenhar(); } }, estado.convidando ? 'Fechar' : 'Convidar corretor');
    const painelConvite = () => {
      const nome = h('input', { id: 'gest-nome', class: 'entrada', autocomplete: 'off', placeholder: 'Opcional' });
      const whats = h('input', { id: 'gest-whats', class: 'entrada', inputmode: 'tel', placeholder: '(21) 90000-0000', oninput: (e) => { e.target.value = R.formatarCelular(e.target.value); } });
      const erro = h('div', { class: 'erro-campo', role: 'alert' });
      const gerar = h('button', { type: 'button', class: 'btn btn-primario', id: 'gestGerar' }, 'Gerar convite');
      gerar.onclick = async () => {
        erro.textContent = '';
        if (whats.value && R.soDigitos(whats.value).length < 10) { erro.textContent = 'WhatsApp incompleto.'; return; }
        gerar.disabled = true; gerar.textContent = 'Gerando…';
        try {
          const r = await api.gerarConvite({ tipo: 'corretor', nome: nome.value.trim() || null, whatsapp: whats.value || null });
          estado.gerado = { nome: nome.value, whatsapp: whats.value, link: r.link, expira: r.expira_em };
          await recarregar();
        } catch (e) { erro.textContent = e.message; gerar.disabled = false; gerar.textContent = 'Gerar convite'; }
      };
      if (estado.gerado) {
        const texto = textoConvite({ ...estado.gerado, imobiliaria: perfil.imobiliaria_nome });
        const fone = R.soDigitos(estado.gerado.whatsapp || '');
        return h('div', { class: 'gest-convite' },
          h('strong', null, 'Convite gerado. Mande pelo WhatsApp.'),
          h('div', { class: 'gest-convite-texto' }, texto),
          h('div', { class: 'gest-acoes' },
            h('a', { class: 'btn btn-primario btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone ? (fone.startsWith('55') ? fone : `55${fone}`) : ''}?text=${encodeURIComponent(texto)}` }, 'Enviar pelo WhatsApp'),
            h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await navigator.clipboard.writeText(texto); toast('Mensagem com o convite copiada.'); } catch { toast('Não consegui copiar. Selecione o texto e copie.'); } } }, 'Copiar mensagem'),
            h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { estado.gerado = null; desenhar(); } }, 'Novo convite')));
      }
      return h('div', { class: 'gest-convite' },
        h('p', { class: 'ajuda' }, 'O corretor abre o link, preenche nome, e-mail e WhatsApp e cria a senha. Ele já entra na sua imobiliária.'),
        h('div', { class: 'campo' }, h('label', { for: 'gest-nome' }, 'Nome (para a saudação)'), nome),
        h('div', { class: 'campo' }, h('label', { for: 'gest-whats' }, 'WhatsApp de quem vai receber'), whats), erro, gerar);
    };

    const qtd = (id) => clientes.filter((c) => !c.rascunho && c.corretor_id === id).length;
    const linhas = equipeTodos.map((u) => {
      const euMesmo = u.id === perfil.id; const gestor = u.papel === 'gestor_imobiliaria';
      const n = qtd(u.id);
      const acoes = h('div', { class: 'gest-acoes' });
      if (!euMesmo && !gestor) {
        if (u.ativo) acoes.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'data-desligar': u.id, onclick: () => { estado.desligando = estado.desligando === u.id ? null : u.id; desenhar(); } }, 'Desligar'));
        else acoes.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'data-reativar': u.id, onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await api.gestorAtivarCorretor(u.id, true); toast(`${u.nome} voltou a ter acesso.`); await recarregar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; }
        } }, 'Reativar'));
      }
      const li = h('li', { class: `gest-membro${u.ativo ? '' : ' desligado'}` },
        h('span', { class: 'gest-corretor-nome' }, h('b', null, u.nome), h('small', null, [gestor ? 'Documentação' : 'Corretor', euMesmo ? 'você' : null, n ? `${n} ${n === 1 ? 'cliente' : 'clientes'}` : null].filter(Boolean).join(' · '))),
        h('span', { class: `chip ${u.ativo ? 'chip-aceito' : ''}` }, u.ativo ? 'Ativo' : 'Desligado'), acoes);
      if (estado.desligando === u.id) {
        const outros = equipeTodos.filter((x) => x.ativo && x.id !== u.id);
        const destino = h('select', { class: 'entrada', id: 'gest-destino', 'aria-label': 'Passar os clientes para' },
          h('option', { value: '' }, 'Deixar com a imobiliária (sem passar agora)'), outros.map((x) => h('option', { value: x.id }, x.nome)));
        const confirmar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'gestConfirmarDesligar' }, 'Desligar acesso');
        confirmar.onclick = async () => {
          confirmar.disabled = true;
          try {
            await api.gestorAtivarCorretor(u.id, false);
            let passados = 0; if (destino.value && n) passados = await api.passarClientes(u.id, destino.value);
            estado.desligando = null;
            toast(`${u.nome} não tem mais acesso.${passados ? ` ${passados} ${passados === 1 ? 'cliente passou' : 'clientes passaram'} para ${outros.find((x) => x.id === destino.value)?.nome}.` : ''}`);
            await recarregar();
          } catch (er) { toast(er.message); confirmar.disabled = false; }
        };
        li.appendChild(h('div', { class: 'gest-desligar' },
          h('p', { class: 'ajuda' }, `${u.nome} deixa de entrar no portal. ${n ? `Os ${n} ${n === 1 ? 'cliente continua' : 'clientes continuam'} com a imobiliária.` : 'Nenhum cliente em andamento.'}`),
          n ? h('div', { class: 'campo' }, h('label', { for: 'gest-destino' }, 'Passar os clientes para'), destino) : null, h('div', { class: 'gest-acoes' }, confirmar,
            h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { estado.desligando = null; desenhar(); } }, 'Cancelar'))));
      }
      return li;
    });

    const pendentes = convites.filter((c) => !c.usado_em && !c.cancelado_em && new Date(c.expira_em) > new Date());
    const listaPend = pendentes.length ? h('div', { class: 'gest-pendentes' }, h('div', { class: 'ini-sub' }, 'Convites aguardando'),
      h('ul', { class: 'gest-parados' }, pendentes.map((c) => h('li', { class: 'gest-membro' },
        h('span', { class: 'gest-corretor-nome' }, h('b', null, c.nome || 'Sem nome'), h('small', null, `${c.whatsapp ? `${R.formatarCelular(c.whatsapp)} · ` : ''}vale até ${new Date(c.expira_em).toLocaleDateString('pt-BR')}`)),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.cancelarConvite(c.id); toast('Convite cancelado. O link não funciona mais.'); await recarregar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; } } }, 'Cancelar'))))) : null;

    return caixa('Equipe da imobiliária', 'Quem tem acesso ao portal pela sua imobiliária', botaoConvidar,
      estado.convidando ? painelConvite() : null,
      linhas.length ? h('ul', { class: 'gest-parados gest-equipe' }, linhas) : vazio('Nenhum corretor ainda. Convide o primeiro.', 'pessoas'), listaPend);
  };

  const seletorEl = seletor('Corretor', [['', 'Todos os corretores'], ...corretores.map((u) => [u.id, u.nome])], '', (v) => { estado.corretor = v; desenhar(); });
  const seletorCorretor = seletorEl.querySelector('select');
  desenhar();
  return [cabecalho({ sobre: 'Gestão', titulo: perfil.imobiliaria_nome || 'Gestão da imobiliária', sub: 'Veja em que fase está cada processo e o que cada corretor está fazendo.' }, seletorEl), corpo];
}
