// Fluxograma das etapas (Modelo 2): cinza = ainda não chegou, azul = cumprida, laranja = agora, vermelho = reprovada.
import { h, icone } from './dom.js';
import * as R from './regras.js';
import { ICONE_ETAPA, abrirJanela } from './componentes.js';
import * as F from './fluxo-dados.js';

const COR = { feita: '#FFFFFF', atual: '#D88934', futura: '#8C969C', reprovada: '#FFFFFF' };
const diaMes = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const ROTULO = { feita: 'cumprida', atual: 'etapa atual', futura: 'a fazer', reprovada: 'reprovada' };

// cliente: { status, rascunho, status_desde? } · historico: [{ para, em }] · arquivos: tipos do contrato já anexados
export function fluxograma({ cliente, historico = [], arquivos = [], titulo = 'Etapas do processo', quemVe = 'corretor', vez: vezPronta = null, temGestor = false }) {
  if (cliente.rascunho) return null;
  const fases = F.etapasDoFluxo(cliente.status, historico, cliente.enviado_em || cliente.criado_em || null);
  const { feitas, total } = F.progresso(cliente.status);
  const encerrado = cliente.status === 'entrevista_reprovada';
  const final = cliente.status === 'credito_liberado';
  const vez0 = vezPronta || F.vezDaEtapa(cliente.status, arquivos);
  const vez = temGestor && vez0.quem === 'corretor' ? { ...vez0, quem: 'gestor' } : vez0;
  const desde = historico.filter((x) => x.para === cliente.status).map((x) => x.em).sort().pop() || cliente.status_desde || null;
  const dias = desde ? R.diasDesde(desde) : null;
  const ehMinha = !!vez.quem && vez.quem === quemVe;

  const agora = encerrado
    ? h('div', { class: 'fluxo-agora reprovado' }, h('b', null, 'Processo encerrado'), h('span', null, F.textoReprovada({ doCliente: quemVe === 'cliente', em: desde })))
    : final
      ? h('div', { class: 'fluxo-agora final' }, h('b', null, 'Processo finalizado'), h('span', null, F.O_QUE_E.credito_liberado))
      : h('div', { class: `fluxo-agora${ehMinha ? ' minha' : ''}` },
        h('div', { class: 'fluxo-agora-topo' }, h('b', null, `Agora: ${R.nomeStatus(cliente.status)}`),
          vez.quem ? h('span', { class: `fluxo-vez vez-${vez.quem}` }, ehMinha ? 'Sua vez' : `Vez ${['cca', 'caixa'].includes(vez.quem) ? 'da' : 'do'} ${F.NOME_QUEM[vez.quem]}`) : null),
        h('span', null, F.O_QUE_E[cliente.status] || ''),
        vez.acao ? h('span', { class: 'fluxo-acao' }, `Próximo passo: ${vez.acao}${dias !== null ? ` · nesta etapa ${dias === 0 ? 'desde hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`}` : ''}`) : null);

  const no = (e, n) => h('li', { class: `fluxo-no ${e.estado}` }, h('button', { type: 'button', class: 'fluxo-toque', 'aria-label': `${n}. ${e.nome}: ${ROTULO[e.estado]}${e.em ? ` em ${diaMes(e.em)}` : ''}. Toque para ver detalhes.`,
      onclick: () => detalheEtapa(e, { cliente, quemVe, vez }) },
    h('span', { class: 'fluxo-bola', 'aria-hidden': 'true' }, icone(e.estado === 'reprovada' ? 'fechar' : e.estado === 'feita' ? (ICONE_ETAPA[e.codigo] || 'check') : (ICONE_ETAPA[e.codigo] || 'andamento'), { tam: 20, traco: 2.2, cor: COR[e.estado] })),
    h('span', { class: 'fluxo-nome' }, e.estado === 'reprovada' ? 'Entrevista reprovada' : e.nome),
    h('span', { class: 'fluxo-data' }, e.estado === 'atual' ? 'Agora' : e.em ? diaMes(e.em) : '')));

  let n = 0;
  return h('section', { class: 'cartao fluxo', id: 'fluxograma' },
    h('div', { class: 'fluxo-cab' },
      h('div', null, h('h3', { class: 'fluxo-titulo' }, titulo), h('span', { class: 'sub' }, `${feitas} de ${total} etapas cumpridas`)),
      h('div', { class: 'fluxo-legenda', 'aria-hidden': 'true' }, h('span', { class: 'fluxo-dica' }, 'Toque numa etapa para ver os detalhes'),
        h('span', null, h('i', { class: 'feita' }), 'Cumprida'), h('span', null, h('i', { class: 'atual' }), 'Agora'), h('span', null, h('i', { class: 'futura' }), 'A fazer'))),
    agora,
    h('div', { class: 'fluxo-fases' }, fases.map((f, fi) => {
      const toda = f.itens.every((e) => e.estado === 'feita');
      return h('div', { class: `fluxo-fase${toda ? ' completa' : ''}` },
        h('div', { class: 'fluxo-fase-nome' }, h('span', { class: 'fluxo-fase-num' }, String(fi + 1)), f.nome, toda ? icone('check', { tam: 14, traco: 2.6, cor: '#3D657C' }) : null),
        h('ol', { class: 'fluxo-etapas', style: { gridTemplateColumns: `repeat(${f.itens.length}, minmax(0, 1fr))` } }, f.itens.map((e) => no(e, ++n))));
    })));
}

// Janela da etapa: duas mensagens diferentes, conforme o momento.
// Ainda não concluída (a fazer ou agora): caixa verde explicando do que se trata a etapa (+ o que já se sabe dela).
// Concluída: o que foi feito, as informações e orientações, e o encaminhamento para a próxima etapa.
const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
function detalheEtapa(e, { cliente, quemVe, vez }) {
  const doCliente = quemVe === 'cliente';
  const reprovada = e.estado === 'reprovada';
  const linha = (rotulo, valor) => (valor ? h('div', { class: 'etapa-dado' }, h('span', null, rotulo), h('b', null, valor)) : null);
  const dadosDaEntrevista = (en) => h('div', { class: 'etapa-dados' },
    linha('Data', en.data), linha('Hora', en.hora), linha('Como', en.modalidade), linha('Gerente', en.gerente), linha('Agência', en.agencia),
    linha(cliente.entrevista_modalidade === 'video' ? 'Link ou local' : 'Endereço', en.endereco));
  const corpo = [];

  if (reprovada) {
    corpo.push(h('span', { class: 'etapa-situacao reprovada' }, `Reprovada${e.em ? ` em ${dataLonga(e.em)}` : ''}`),
      h('div', { class: 'etapa-caixa reprovada' }, h('p', null, F.textoReprovada({ doCliente, em: e.em }))));
    abrirJanela('Entrevista reprovada', corpo);
    return;
  }

  if (e.estado === 'feita') {
    // ---------- Mensagem de etapa concluída ----------
    const prox = F.proximaEtapa(e.codigo);
    const festa = doCliente && ['cliente_aprovado', 'entrevista', 'credito_liberado'].includes(e.codigo);
    corpo.push(h('span', { class: 'etapa-situacao feita' }, icone('check', { tam: 14, traco: 2.6 }), `Concluída${e.em ? ` em ${dataLonga(e.em)}` : ''}`));
    corpo.push(h('div', { class: `etapa-caixa feita${festa ? ' festa' : ''}` },
      h('div', { class: 'etapa-caixa-tit' }, festa ? '🎉 ' : '', 'O que foi feito'),
      h('p', null, doCliente ? F.CONCLUIDA_CLIENTE[e.codigo] : `${F.O_QUE_E[e.codigo] || ''} Etapa cumprida.`)));
    if (e.codigo === 'entrevista') { const en = F.dadosEntrevista(cliente); if (en) corpo.push(dadosDaEntrevista(en)); }
    if (prox && e.codigo !== 'credito_liberado') {
      corpo.push(h('div', { class: 'etapa-proxima' }, h('span', null, 'Próxima etapa'), h('b', null, prox.nome),
        h('p', null, doCliente ? F.ANTES_CLIENTE[prox.codigo] : F.O_QUE_E[prox.codigo])));
    }
    abrirJanela(e.nome, corpo);
    return;
  }

  // ---------- Mensagem de etapa ainda não concluída (a fazer ou acontecendo agora) ----------
  corpo.push(h('span', { class: `etapa-situacao ${e.estado}` }, e.estado === 'atual' ? `Acontecendo agora${e.em ? `, desde ${dataLonga(e.em)}` : ''}` : 'Ainda vai acontecer'));
  corpo.push(h('div', { class: 'etapa-caixa antes' }, h('div', { class: 'etapa-caixa-tit' }, 'Do que se trata'),
    h('p', null, (doCliente ? F.ANTES_CLIENTE[e.codigo] : F.O_QUE_E[e.codigo]) || '')));
  if (e.estado === 'atual' && vez?.quem && !doCliente) corpo.push(h('p', { class: 'etapa-texto' }, h('b', null, `Vez ${['cca', 'caixa'].includes(vez.quem) ? 'da' : 'do'} ${F.NOME_QUEM[vez.quem]}: `), vez.acao));
  if (e.codigo === 'entrevista') {
    corpo.push(h('div', { class: 'etapa-caixa importante' }, h('div', { class: 'etapa-caixa-tit' }, 'Muito importante'),
      h('p', null, doCliente ? 'Se o gerente não aprovar a entrevista, o processo inteiro é encerrado. Ela fica registrada no sistema da Caixa e uma nova tentativa só é possível depois de 180 dias. Por isso, vá preparado(a) e responda com calma e sinceridade.'
        : 'Se o gerente reprovar, o processo inteiro é encerrado e a entrevista fica registrada no sistema da Caixa: nova tentativa só depois de 180 dias. Prepare o cliente antes.')));
    const en = e.estado === 'atual' ? F.dadosEntrevista(cliente) : null;
    if (en) {
      corpo.push(h('div', { class: 'etapa-caixa-tit' }, doCliente ? 'Sua entrevista está marcada' : 'Entrevista marcada'), dadosDaEntrevista(en));
      if (en.endereco && cliente.entrevista_modalidade !== 'video') corpo.push(h('a', { class: 'btn btn-contorno btn-pequeno', target: '_blank', rel: 'noopener', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(en.endereco)}` }, 'Ver no mapa'));
      if (doCliente) corpo.push(h('p', { class: 'etapa-dica' }, 'Leve documento original com foto, chegue 15 minutos antes e esteja com o celular carregado.'));
    } else if (doCliente) {
      corpo.push(h('p', { class: 'etapa-dica' }, 'Ainda não foi agendada. Quando a CCA agendar, você recebe a data, a hora, o nome do gerente e o endereço da agência.'));
    }
  }
  if (doCliente && e.codigo === 'assinaturas') corpo.push(h('p', { class: 'etapa-dica' }, 'Para assinar, use a sua conta gov.br (nível prata ou ouro), pelo app gov.br no celular. Se tiver dúvida, fale com o(a) seu(sua) corretor(a) ou com a CCA.'));
  if (doCliente && e.codigo === 'documentacao_pendente' && e.estado === 'atual' && cliente.id) {
    corpo.push(h('a', { class: 'btn btn-primario btn-pequeno', href: `#/cliente/${cliente.id}/documentos`, onclick: () => document.querySelector('.janela-fundo')?.remove() }, 'Ver e enviar os meus documentos'));
  }
  if (doCliente) corpo.push(h('p', { class: 'etapa-rodape' }, 'Quando esta etapa for concluída, você recebe um aviso por e-mail e aqui no app.'));
  abrirJanela(e.nome, corpo);
}
