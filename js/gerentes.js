// Configurações → Gerentes da CAIXA: cadastro dos gerentes e do jogo de procurações de cada um.
// A procuração vigente é vinculada sozinha ao contrato quando a CCA escolhe o gerente no cliente.
import { h, toast, limpar } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import * as CC from './contrato-conferencia-dados.js';
import { secaoTitulo, perguntarSimNao, aviso } from './componentes.js';

const ACEITA = '.pdf,.png,.jpg,.jpeg,.p7s';

export async function blocoGerentes() {
  const caixa = h('section', { class: 'cartao', id: 'secao-gerentes', style: { gap: '14px' } });
  let gerentes = [];
  const recarregar = async () => { gerentes = await api.listarGerentes().catch((e) => { toast(e.message); return []; }); desenhar(); };

  const abrir = async (p) => { try { window.open(await api.abrirProcuracao(p), '_blank', 'noopener'); } catch (e) { toast(e.message); } };

  const cartao = (g) => {
    const proc = CC.procuracaoVigente(g);
    const sit = CC.situacaoProcuracao(proc);
    const validade = h('input', { class: 'entrada', type: 'date', 'aria-label': `Validade da procuração de ${g.nome}`, value: proc?.validade || '' });
    const salvarValidade = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Salvar validade');
    salvarValidade.onclick = async () => {
      if (!validade.value) return toast('Informe até quando a procuração vale.');
      try { await api.atualizarProcuracao(proc.id, { validade: validade.value }); toast('Validade salva.'); recarregar(); } catch (e) { toast(e.message); }
    };
    const arquivo = h('input', { type: 'file', accept: ACEITA, style: { display: 'none' }, 'aria-label': `Anexar jogo de procurações de ${g.nome}` });
    const anexar = h('button', { type: 'button', class: `btn ${proc ? 'btn-contorno' : 'btn-primario'} btn-pequeno`, onclick: () => arquivo.click() }, proc ? 'Anexar jogo novo' : 'Anexar jogo de procurações');
    arquivo.onchange = async () => {
      const f = arquivo.files[0]; if (!f) return;
      anexar.disabled = true; anexar.textContent = 'Enviando…';
      try {
        const pid = await api.enviarProcuracao(g.id, f);
        toast('Procuração anexada. Informe a validade.');
        const r = await api.lerComIa('procuracao', { procuracaoId: pid }).catch(() => null);
        if (r && !r.semIa && r.validade) toast(`A IA leu a validade: ${R.formatarData(r.validade)}. Confira.`);
        recarregar();
      } catch (e) { toast(e.message); anexar.disabled = false; anexar.textContent = proc ? 'Anexar jogo novo' : 'Anexar jogo de procurações'; }
    };
    const excluir = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Excluir');
    excluir.onclick = async () => {
      if (!(await perguntarSimNao('Excluir o gerente?', `${g.nome} sai da lista de gerentes. Os contratos já liberados continuam com a procuração deles.`))) return;
      try { await api.excluirGerente(g.id); recarregar(); } catch (e) { toast(e.message); }
    };
    return h('div', { class: 'ger-cartao', 'data-gerente': g.id },
      h('div', { class: 'ger-topo' },
        h('div', null, h('div', { style: { fontWeight: '800' } }, g.nome), h('div', { class: 'sub' }, [g.cpf ? `CPF ${R.formatarCpf(g.cpf)}` : null, g.agencia ? `Agência ${g.agencia}` : null].filter(Boolean).join(' · ') || 'Sem CPF e agência')),
        h('span', { class: `cc-chip cc-${sit.tom}` }, sit.texto)),
      proc ? h('div', { class: 'ger-linha' }, h('span', { class: 'sub' }, proc.nome_original || 'Jogo de procurações'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrir(proc) }, 'Ver')) : null,
      proc ? h('div', { class: 'ger-linha' }, h('span', { class: 'sub' }, 'Válida até'), validade, salvarValidade) : null,
      h('div', { class: 'ger-linha' }, anexar, arquivo, excluir));
  };

  const formNovo = () => {
    const nome = h('input', { class: 'entrada', id: 'ger-nome', placeholder: 'Nome completo' });
    const cpf = h('input', { class: 'entrada', id: 'ger-cpf', inputmode: 'numeric', placeholder: '000.000.000-00', oninput: (e) => { e.target.value = R.formatarCpf(e.target.value); } });
    const agencia = h('input', { class: 'entrada', id: 'ger-agencia', placeholder: 'Ex.: 1234 – Itaboraí' });
    const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'ger-salvar' }, 'Cadastrar gerente');
    salvar.onclick = async () => {
      if (cpf.value && !R.cpfValido(cpf.value)) return toast('CPF inválido. Confira os 11 números.');
      salvar.disabled = true;
      try { await api.salvarGerente({ nome: nome.value, cpf: cpf.value, agencia: agencia.value }); toast('Gerente cadastrado. Anexe o jogo de procurações.'); recarregar(); }
      catch (e) { toast(e.message); salvar.disabled = false; }
    };
    return h('div', { class: 'ger-cartao' }, h('b', null, 'Novo gerente'),
      h('div', { class: 'campo' }, h('label', { for: 'ger-nome' }, 'Nome'), nome),
      h('div', { class: 'campo' }, h('label', { for: 'ger-cpf' }, 'CPF'), cpf),
      h('div', { class: 'campo' }, h('label', { for: 'ger-agencia' }, 'Agência'), agencia),
      salvar);
  };

  const desenhar = () => {
    limpar(caixa);
    caixa.appendChild(secaoTitulo('Gerentes da CAIXA e procurações', 'Cada gerente com o seu jogo de procurações. Ao escolher o gerente no contrato do cliente, a procuração vigente é vinculada sozinha e só é liberada para download depois da conferência.', { pequeno: true }));
    const vencendo = gerentes.filter((g) => ['vencida', 'vence_logo', 'sem', 'sem_validade'].includes(CC.situacaoProcuracao(CC.procuracaoVigente(g)).estado));
    if (vencendo.length) caixa.appendChild(aviso('laranja', h('strong', null, 'Atenção: '), `${vencendo.map((g) => g.nome).join(', ')} ${vencendo.length === 1 ? 'está' : 'estão'} sem procuração válida ou perto de vencer.`));
    caixa.appendChild(h('div', { class: 'ger-lista' }, gerentes.map(cartao), formNovo()));
  };
  await recarregar();
  return caixa;
}
