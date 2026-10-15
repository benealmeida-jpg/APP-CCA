// Fluxograma das etapas (Modelo 2): cinza = ainda não chegou, azul = cumprida, laranja = agora, vermelho = reprovada.
import { h, icone } from './dom.js';
import * as R from './regras.js';
import { ICONE_ETAPA } from './componentes.js';
import * as F from './fluxo-dados.js';

const COR = { feita: '#FFFFFF', atual: '#D88934', futura: '#8C969C', reprovada: '#FFFFFF' };
const diaMes = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const ROTULO = { feita: 'cumprida', atual: 'etapa atual', futura: 'a fazer', reprovada: 'reprovada' };

// cliente: { status, rascunho, status_desde? } · historico: [{ para, em }] · arquivos: tipos do contrato já anexados
export function fluxograma({ cliente, historico = [], arquivos = [], titulo = 'Etapas do processo', quemVe = 'corretor', vez: vezPronta = null }) {
  if (cliente.rascunho) return null;
  const fases = F.etapasDoFluxo(cliente.status, historico, cliente.enviado_em || cliente.criado_em || null);
  const { feitas, total } = F.progresso(cliente.status);
  const encerrado = cliente.status === 'entrevista_reprovada';
  const final = cliente.status === 'credito_liberado';
  const vez = vezPronta || F.vezDaEtapa(cliente.status, arquivos);
  const desde = historico.filter((x) => x.para === cliente.status).map((x) => x.em).sort().pop() || cliente.status_desde || null;
  const dias = desde ? R.diasDesde(desde) : null;
  const ehMinha = (vez.quem === 'cca' && quemVe === 'cca') || (vez.quem === 'corretor' && quemVe === 'corretor') || (vez.quem === 'cliente' && quemVe === 'cliente');

  const agora = encerrado
    ? h('div', { class: 'fluxo-agora reprovado' }, h('b', null, 'Processo encerrado'), h('span', null, F.O_QUE_E.entrevista_reprovada))
    : final
      ? h('div', { class: 'fluxo-agora final' }, h('b', null, 'Processo finalizado'), h('span', null, F.O_QUE_E.credito_liberado))
      : h('div', { class: `fluxo-agora${ehMinha ? ' minha' : ''}` },
        h('div', { class: 'fluxo-agora-topo' }, h('b', null, `Agora: ${R.nomeStatus(cliente.status)}`),
          vez.quem ? h('span', { class: `fluxo-vez vez-${vez.quem}` }, ehMinha ? 'Sua vez' : `Vez ${vez.quem === 'cca' ? 'da' : 'do'} ${F.NOME_QUEM[vez.quem]}`) : null),
        h('span', null, F.O_QUE_E[cliente.status] || ''),
        vez.acao ? h('span', { class: 'fluxo-acao' }, `Próximo passo: ${vez.acao}${dias !== null ? ` · nesta etapa ${dias === 0 ? 'desde hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`}` : ''}`) : null);

  const no = (e, n) => h('li', { class: `fluxo-no ${e.estado}`, 'aria-label': `${n}. ${e.nome}: ${ROTULO[e.estado]}${e.em ? ` em ${diaMes(e.em)}` : ''}` },
    h('span', { class: 'fluxo-bola', 'aria-hidden': 'true' }, icone(e.estado === 'reprovada' ? 'fechar' : e.estado === 'feita' ? (ICONE_ETAPA[e.codigo] || 'check') : (ICONE_ETAPA[e.codigo] || 'andamento'), { tam: 20, traco: 2.2, cor: COR[e.estado] })),
    h('span', { class: 'fluxo-nome' }, e.estado === 'reprovada' ? 'Entrevista reprovada' : e.nome),
    h('span', { class: 'fluxo-data' }, e.estado === 'atual' ? 'Agora' : e.em ? diaMes(e.em) : ''));

  let n = 0;
  return h('section', { class: 'cartao fluxo', id: 'fluxograma' },
    h('div', { class: 'fluxo-cab' },
      h('div', null, h('h3', { class: 'fluxo-titulo' }, titulo), h('span', { class: 'sub' }, `${feitas} de ${total} etapas cumpridas`)),
      h('div', { class: 'fluxo-legenda', 'aria-hidden': 'true' },
        h('span', null, h('i', { class: 'feita' }), 'Cumprida'), h('span', null, h('i', { class: 'atual' }), 'Agora'), h('span', null, h('i', { class: 'futura' }), 'A fazer'))),
    agora,
    h('div', { class: 'fluxo-fases' }, fases.map((f, fi) => {
      const toda = f.itens.every((e) => e.estado === 'feita');
      return h('div', { class: `fluxo-fase${toda ? ' completa' : ''}` },
        h('div', { class: 'fluxo-fase-nome' }, h('span', { class: 'fluxo-fase-num' }, String(fi + 1)), f.nome, toda ? icone('check', { tam: 14, traco: 2.6, cor: '#3D657C' }) : null),
        h('ol', { class: 'fluxo-etapas' }, f.itens.map((e) => no(e, ++n))));
    })));
}
