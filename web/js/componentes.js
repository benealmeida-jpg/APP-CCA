// Peças de tela reaproveitadas.
import { h, icone, toast } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';

export function marcaRegra(regra) {
  if (!regra) return null;
  return h('span', { class: regra === '**' ? 'marca marca-forte' : 'marca', title: regra === '**' ? 'Sem ele o processo não vai para análise' : 'Pode anexar depois' }, ` ${regra}`);
}

export function chipSituacao(situacao) {
  return h('span', { class: `chip chip-${situacao}` }, R.SITUACAO_NOME[situacao] || situacao);
}

export function aviso(tipo, ...conteudo) {
  return h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'laranja' ? 'alert' : null },
    icone(tipo === 'laranja' ? 'alerta' : 'info', { cor: tipo === 'laranja' ? '#8A4E12' : '#2C4B5D' }),
    h('span', null, ...conteudo));
}

export function legendaAsteriscos() {
  return h('div', { class: 'legenda' },
    h('span', null, h('b', null, '*'), ' Pode enviar o cadastro sem ele e anexar depois.'),
    h('span', null, h('b', { class: 'forte' }, '**'), ' Pode enviar, mas sem ele o processo não vai para análise.'));
}

export function etapas(atual) {
  const nomes = ['Cliente', 'Operação', 'Renda', 'Docs', 'Revisão'];
  return [
    h('div', { class: 'etapas', 'aria-hidden': 'true' }, nomes.map((_, i) => h('span', { class: i < atual ? 'feita' : '' }))),
    h('div', { class: 'etapas-nomes' }, nomes.map((n, i) => h('span', { class: i === atual - 1 ? 'atual' : '' }, n))),
  ];
}

export function botaoOpcao(texto, selecionado, aoClicar, classe = 'opcao') {
  return h('button', { type: 'button', class: classe, 'aria-pressed': selecionado ? 'true' : 'false', onclick: aoClicar }, texto);
}

// Abre o documento (visualizar) ou baixa
export async function abrirDoc(doc, baixar = false) {
  const janela = baixar ? null : window.open('', '_blank');
  try {
    const url = await api.abrirDocumento(doc, { baixar });
    if (baixar) {
      const a = h('a', { href: url, download: doc.nome_original || 'documento' });
      document.body.appendChild(a); a.click(); a.remove();
    } else if (janela) janela.location = url;
    else location.href = url;
  } catch (e) {
    janela?.close();
    toast(e.message);
  }
}

export function escolherArquivo() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*,application/pdf', style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

const LIMITE_MB = 15;

// Lista de documentos com anexar / ver / baixar / substituir
export function listaDocumentos({ clienteId, necessarios, aoMudar }) {
  const grupos = R.agruparPorGrupo(necessarios);
  return grupos.map((g) => h('section', null,
    h('h2', { class: 'grupo-titulo' }, g.titulo),
    h('div', { class: 'cartao-lista' }, g.itens.map((n) => {
      const d = n.documento;
      const enviado = n.situacao !== 'pendente';
      const recusado = n.situacao === 'recusado';
      const urgente = recusado || (!enviado && n.regra === '**');
      let detalhe = '';
      if (recusado) detalhe = [d.motivo_recusa, d.observacao_recusa].filter(Boolean).join(': ');
      else if (enviado) detalhe = d.nome_original || '';
      else detalhe = n.regra === '**' ? 'Obrigatório para análise' : n.regra === '*' ? 'Pode anexar depois' : '';

      const enviar = async (ev) => {
        const botao = ev.currentTarget;
        const arquivo = await escolherArquivo();
        if (!arquivo) return;
        if (arquivo.size > LIMITE_MB * 1024 * 1024) return toast(`Arquivo maior que ${LIMITE_MB} MB. Tente uma foto menor ou um PDF.`);
        botao.disabled = true; botao.textContent = 'Enviando…';
        try {
          await api.enviarDocumento(clienteId, n.tipo_codigo, arquivo);
          toast(enviado ? 'Documento substituído. A versão anterior ficou no histórico.' : 'Documento enviado');
          aoMudar?.();
        } catch (e) {
          toast(e.message); botao.disabled = false; botao.textContent = enviado ? 'Substituir' : 'Anexar';
        }
      };

      return h('div', { class: `doc${recusado ? ' recusado' : ''}` },
        h('div', null,
          h('div', { class: 'doc-nome' }, n.nome, marcaRegra(n.regra)),
          h('div', { class: 'doc-linha' }, chipSituacao(n.situacao),
            detalhe ? h('span', { class: urgente ? 'forte' : '' }, detalhe) : null,
            d && d.versao > 1 ? h('span', null, `· versão ${d.versao}`) : null)),
        h('div', { class: 'doc-acoes' },
          enviado ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${n.nome}`, onclick: () => abrirDoc(d) }, icone('olho')) : null,
          enviado ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${n.nome}`, onclick: () => abrirDoc(d, true) }, icone('baixar')) : null,
          h('button', { type: 'button', class: `btn btn-pequeno empurra ${urgente ? 'btn-primario' : 'btn-contorno'}`, onclick: enviar },
            enviado ? 'Substituir' : [icone('clipe', { tam: 16 }), 'Anexar'])));
    }))));
}

export function avisoDocumentos(necessarios) {
  const r = R.resumoDocumentos(necessarios);
  if (!r.pendente && !r.recusado) return null;
  const partes = [];
  if (r.recusado) partes.push(`${r.recusado} documento${r.recusado > 1 ? 's' : ''} recusado${r.recusado > 1 ? 's' : ''}`);
  if (r.pendente) partes.push(`${r.pendente} pendente${r.pendente > 1 ? 's' : ''}`);
  const faltaForte = r.faltando_obrigatorio.map((n) => n.nome);
  return aviso('laranja',
    h('strong', null, `${partes.join(' e ')}.`), ' ',
    r.recusado ? 'Substitua o recusado e anexe o que falta. ' : 'Você pode enviar assim e anexar depois. ',
    faltaForte.length ? `Sem ${faltaForte.join(', ')} (**), o processo não vai para análise.` : '');
}

export function barraProgresso(necessarios) {
  const r = R.resumoDocumentos(necessarios);
  const pct = r.total ? Math.round((r.enviados / r.total) * 100) : 0;
  return [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600' } },
      h('span', null, `${r.enviados} de ${r.total} enviados`),
      (r.pendente || r.recusado) ? h('span', { style: { color: '#8A4E12' } },
        [r.recusado ? `${r.recusado} recusado` : null, r.pendente ? `${r.pendente} pendente${r.pendente > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')) : null),
    h('div', { class: 'barra', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { style: { width: `${pct}%` } })),
  ];
}

export function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
