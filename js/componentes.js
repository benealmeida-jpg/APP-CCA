// Peças de tela reaproveitadas.
import { h, icone, toast, limpar, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';

export function marcaRegra(regra) {
  if (!regra) return null;
  return h('span', { class: regra === '**' ? 'marca marca-forte' : 'marca', title: regra === '**' ? 'Sem ele o processo não vai para análise' : 'Pode anexar depois' }, ` ${regra}`);
}

// Logo oficial: Andrade Almeida Correspondente Caixa Aqui
export function logo(classe = 'logo-topo', branca = false) {
  return h('img', { class: `logo ${classe}`, src: branca ? 'img/logo-branco.svg' : 'img/logo.svg', alt: 'Andrade Almeida Correspondente Caixa Aqui', width: 618, height: 292, decoding: 'async' });
}

// Cor da etiqueta de status (cadastro recebido, documentação pendente, em análise, aprovado...)
export function chipStatus(codigo, nome) {
  return h('span', { class: `chip chip-status st-${codigo}` }, nome || R.nomeStatus(codigo));
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

export function etapas(atual, comVendedor = true) {
  // [número da etapa, nome curto]; a tela Vendedor some quando a operação não tem vendedor
  const todas = [[1, 'Comprador'], [2, 'Renda'], [3, 'Operação'], [4, 'Imóvel'], [5, 'Vendedor'], [6, 'Docs'], [7, 'Revisão']]
    .filter(([n]) => comVendedor || n !== 5);
  return [
    h('div', { class: 'etapas', 'aria-hidden': 'true' }, todas.map(([n]) => h('span', { class: n <= atual ? 'feita' : '' }))),
    h('div', { class: 'etapas-nomes' }, todas.map(([n, nome]) => h('span', { class: n === atual ? 'atual' : '' }, nome))),
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

// Ícone e cor de cada tipo de documento (leitura visual rápida)
export function iconeDoGrupo(grupo = '') {
  if (/^Vendedor/.test(grupo)) return ['predio', 'laranja'];
  if (/Renda|Renda e/i.test(grupo)) return ['cifrao', 'verde'];
  if (/FGTS/i.test(grupo)) return ['cofre', 'verde'];
  if (/Im[óo]vel/i.test(grupo)) return ['casa', 'laranja'];
  if (/Fator social/i.test(grupo)) return ['pessoas', 'azul'];
  if (/Do cliente|Identif/i.test(grupo)) return ['pessoa', 'azul'];
  return ['doc', 'cinza'];
}

export const ICONE_ETAPA = { cadastro_recebido: 'doc', documentacao_pendente: 'alerta', cadastro_ok: 'docCheck', em_analise: 'busca', cliente_aprovado: 'check', entrevista: 'calendario', conformidade: 'escudo', minuta_em_maos: 'clipe', contrato_assinado: 'docCheck', registro_cartorio: 'doc', conformidade_final: 'escudo', credito_liberado: 'casa' };
// Faixa de progresso do processo: etapa atual e as que já passaram
export function faixaProgresso(todos, codigo) {
  // Entrevista reprovada encerra o processo: fica fora da barra, que para na Entrevista em vermelho
  const reprovado = R.STATUS_ENCERRADOS.includes(codigo);
  const statusLista = todos.filter((x) => !R.STATUS_ENCERRADOS.includes(x.codigo));
  const i = statusLista.findIndex((x) => x.codigo === (reprovado ? 'entrevista' : codigo));
  if (i < 0) return null;
  const n = statusLista.length;
  const nomeAtual = reprovado ? R.nomeStatus(codigo) : statusLista[i].nome;
  return h('div', { class: `faixa-progresso${reprovado ? ' reprovado' : ''}`, role: 'img', 'aria-label': `${reprovado ? 'Processo encerrado' : `Etapa ${i + 1} de ${n}`}: ${nomeAtual}` },
    h('div', { class: 'faixa-progresso-txt' }, h('b', null, nomeAtual), h('span', null, reprovado ? 'Processo encerrado' : `Etapa ${i + 1} de ${n}`)),
    h('div', { class: 'faixa-progresso-barra', 'aria-hidden': 'true' }, statusLista.map((x, k) => h('span', { class: `passo ${k < i ? 'feito' : k === i ? (reprovado ? 'reprovado' : 'agora') : ''}`, title: reprovado && k === i ? nomeAtual : x.nome },
      h('i', { class: 'passo-bola' }, icone(k < i ? 'check' : reprovado && k === i ? 'fechar' : (ICONE_ETAPA[x.codigo] || 'andamento'), { tam: 15, traco: 2.4, cor: '#FFFFFF' })),
      k < statusLista.length - 1 ? h('i', { class: 'passo-elo' }) : null))));
}

// Lista de documentos com anexar / ver / baixar / substituir
// Tela de documentos em páginas: Compradores, Vendedor, Imóvel, Simulação e outros
let abaDocs = 'compradores';
export function paginasDocumentos({ clienteId, vendedorId, necessarios, aoMudar, avisoVendedor, aoVisualizar = null }) {
  const secoes = R.SECOES_DOCS.filter(([cod]) => cod === 'vendedor' ? (necessarios.some((n) => n.secao === 'vendedor') || avisoVendedor) : necessarios.some((n) => n.secao === cod));
  if (!secoes.some(([cod]) => cod === abaDocs)) abaDocs = secoes[0]?.[0] || 'compradores';
  const abas = h('div', { class: 'pilulas abas-docs', role: 'tablist', 'aria-label': 'Páginas de documentos' });
  const corpo = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const desenhar = () => {
    limpar(abas); limpar(corpo);
    for (const [cod, nome] of secoes) {
      const itens = necessarios.filter((n) => n.secao === cod && !n.opcional);
      const falta = itens.filter((n) => ['pendente', 'recusado'].includes(n.situacao)).length;
      const b = botaoOpcao(falta ? `${nome} · ${falta}` : `${nome} ✓`, abaDocs === cod, () => { abaDocs = cod; desenhar(); }, 'pilula');
      b.setAttribute('role', 'tab');
      abas.appendChild(b);
    }
    const itens = necessarios.filter((n) => n.secao === abaDocs);
    if (abaDocs === 'vendedor' && avisoVendedor) corpo.appendChild(avisoVendedor);
    adicionar(corpo, ...listaDocumentos({ clienteId, vendedorId, necessarios: itens, aoMudar, aoVisualizar }));
  };
  desenhar();
  return [abas, corpo];
}

export function listaDocumentos({ clienteId, vendedorId = null, necessarios, aoMudar, aoVisualizar = null }) {
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
      else if (enviado) detalhe = d.nome_original || (n.do_vendedor ? 'Já está com a CCA' : '');
      else if (n.opcional) detalhe = 'Opcional: anexe o que ajudar na análise';
      else detalhe = n.regra === '**' ? 'Obrigatório para análise' : n.regra === '*' ? 'Pode anexar depois' : '';
      const podeAbrir = enviado && !(n.do_vendedor && !d.arquivo_path);
      const ver = () => (aoVisualizar ? aoVisualizar(n, linha) : abrirDoc(d));
      const ehImagem = podeAbrir && /\.(jpe?g|png|webp|gif|svg)$/i.test(d.nome_original || '');

      let botao = null;
      const enviar = async (ev, soltos = null) => {
        botao = ev?.currentTarget?.tagName === 'BUTTON' ? ev.currentTarget : linha.querySelector('.doc-acoes .btn');
        const arquivo = soltos ? soltos[0] : await escolherArquivo();
        if (!arquivo) return;
        if (!/^image\//.test(arquivo.type || '') && arquivo.type !== 'application/pdf') return toast('Envie uma foto ou um PDF.');
        if (!botao) return;
        if (arquivo.size > LIMITE_MB * 1024 * 1024) return toast(`Arquivo maior que ${LIMITE_MB} MB. Tente uma foto menor ou um PDF.`);
        let emitidoEm = null;
        if (n.pede_emissao) {
          emitidoEm = await perguntarData('Data de emissão da certidão',
            `${n.nome.split(' (')[0]}. A validade conta a partir da emissão (${n.validade_dias} ${n.validade_uteis ? 'dias úteis' : 'dias'}). Confira a data no documento.`);
          if (!emitidoEm) return;
        }
        botao.disabled = true; botao.textContent = 'Enviando…';
        try {
          if (n.do_vendedor) await api.enviarDocumentoVendedor(clienteId, vendedorId, n.tipo_codigo, arquivo, emitidoEm);
          else await api.enviarDocumento(clienteId, n.tipo_codigo, arquivo, n.participante_id ?? null, n.dependente_ordem ?? null, emitidoEm);
          toast(enviado ? 'Documento substituído. A versão anterior ficou no histórico.' : 'Documento enviado');
          aoMudar?.();
        } catch (e) {
          toast(e.message); botao.disabled = false; botao.textContent = enviado ? 'Substituir' : 'Anexar';
        }
      };

      // Miniatura do arquivo (só fotos; PDF fica com o ícone). Não entra no registro de acessos.
      const iconeDoc = () => {
        const [ic, cor] = iconeDoGrupo(n.grupo);
        const caixa = h('div', { class: `doc-icone t-${cor}` }, icone(ic, { tam: 26, traco: 1.8 }));
        if (ehImagem) {
          api.abrirDocumento(d, { silencioso: true }).then((url) => {
            const img = h('img', { class: 'doc-mini', alt: `Miniatura de ${n.nome}`, src: url, loading: 'lazy', onclick: ver });
            img.onload = () => { limpar(caixa); caixa.classList.add('com-mini'); caixa.appendChild(img); };
          }).catch(() => {});
        }
        return caixa;
      };
      // No computador: arrastar o arquivo até o documento também envia
      const podeSoltar = !(n.multiplo && enviado);
      const linha = h('div', { class: `doc${recusado ? ' recusado' : ''}`,
        ondragover: podeSoltar ? (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); linha.classList.add('soltar-aqui'); } } : null,
        ondragleave: podeSoltar ? () => linha.classList.remove('soltar-aqui') : null,
        ondrop: podeSoltar ? (e) => { e.preventDefault(); linha.classList.remove('soltar-aqui'); const f = [...(e.dataTransfer?.files || [])]; if (f.length) enviar(null, f); } : null },
        iconeDoc(),
        h('div', { class: 'doc-corpo' },
          h('div', null,
            h('div', { class: 'doc-nome' }, n.nome, marcaRegra(n.regra)),
            h('div', { class: 'doc-linha' }, n.opcional ? null : chipSituacao(n.situacao), chipValidade(n),
              detalhe ? h('span', { class: urgente ? 'forte' : '' }, detalhe) : null,
              d && (d.versao_pessoa ?? d.versao) > 1 ? h('span', null, `· versão ${d.versao_pessoa ?? d.versao}`) : null),
            n.situacao === 'em_conferencia' ? notaIa(d?.ia) : null),
          h('div', { class: 'doc-acoes' },
            podeAbrir ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${n.nome}`, onclick: ver }, icone('olho')) : null,
            podeAbrir ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${n.nome}`, onclick: () => abrirDoc(d, true) }, icone('baixar')) : null,
            n.pede_emissao && enviado && d?.id ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Alterar a data de emissão de ${n.nome}`, title: 'Alterar a data de emissão',
              onclick: async () => {
                const nova = await perguntarData('Data de emissão', 'Corrija a data em que o documento foi emitido.', { valor: d.emitido_em || '' });
                if (!nova) return;
                try { await api.definirEmissao(d.id, !!n.do_vendedor, nova); toast('Data de emissão atualizada'); aoMudar?.(); } catch (e) { toast(e.message); }
              } }, icone('calendario')) : null,
            n.multiplo && enviado ? null : h('button', { type: 'button', class: `btn btn-pequeno empurra ${enviado ? 'btn-contorno' : 'btn-primario'}`, onclick: enviar },
              enviado ? 'Substituir' : [icone('clipe', { tam: 16 }), 'Anexar']))))
      return linha;
    }))));
}

// Quem/onde está cada documento que falta: Compradores (por pessoa), Vendedor, Imóvel, Outros
export function grupoPendencia(n) {
  if (n.secao === 'vendedor') return 'Vendedor';
  if (n.secao === 'imovel') return 'Imóvel';
  if (n.secao === 'outros') return 'Simulação e outros';
  if (n.dependente_ordem) return `Fator social · ${n.pessoa_nome}`;
  return n.pessoa_nome ? `${n.pessoa_nome} · ${R.PAPEL_NOME[n.pessoa_papel] || 'Comprador'}` : 'Compradores';
}

export function listaPendencias(necessarios, { aberta = false } = {}) {
  const faltando = necessarios.filter((n) => !n.opcional && ['pendente', 'recusado'].includes(n.situacao));
  if (!faltando.length) return null;
  const grupos = [];
  for (const n of faltando) {
    const t = grupoPendencia(n);
    let g = grupos.find((x) => x.titulo === t);
    if (!g) grupos.push((g = { titulo: t, itens: [] }));
    g.itens.push(n);
  }
  return h('details', { class: 'pendencias', open: aberta },
    h('summary', null, `Ver quais documentos faltam (${faltando.length})`),
    grupos.map((g) => h('div', { class: 'pendencias-grupo' },
      h('div', { class: 'pendencias-titulo' }, `${g.titulo} · ${g.itens.length}`),
      h('ul', null, g.itens.map((n) => h('li', null,
        h('span', null, n.nome, n.regra === '**' ? h('b', { class: 'forte' }, ' **') : null),
        n.situacao === 'recusado' ? h('span', { class: 'chip chip-recusado' }, 'Recusado') : null))))));
}

export function resumoPorSecao(necessarios) {
  const faltando = necessarios.filter((n) => !n.opcional && ['pendente', 'recusado'].includes(n.situacao));
  return R.SECOES_DOCS.map(([cod, nome]) => [nome, faltando.filter((n) => n.secao === cod).length]).filter(([, q]) => q)
    .map(([nome, q]) => `${nome}: ${q}`).join(' · ');
}

export function avisoDocumentos(necessarios) {
  const r = R.resumoDocumentos(necessarios);
  if (!r.pendente && !r.recusado) return null;
  const partes = [];
  if (r.recusado) partes.push(`${r.recusado} documento${r.recusado > 1 ? 's' : ''} recusado${r.recusado > 1 ? 's' : ''}`);
  if (r.pendente) partes.push(`${r.pendente} pendente${r.pendente > 1 ? 's' : ''}`);
  const faltaForte = r.faltando_obrigatorio.map((n) => n.rotulo || n.nome);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    aviso('laranja',
      h('strong', null, `${partes.join(' e ')}.`), ' ',
      resumoPorSecao(necessarios) ? `${resumoPorSecao(necessarios)}. ` : '',
      r.recusado ? 'Substitua o recusado e anexe o que falta. ' : 'Você pode enviar assim e anexar depois. ',
      faltaForte.length ? `Sem ${faltaForte.join(', ')} (**), o processo não vai para análise.` : ''),
    listaPendencias(necessarios));
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

// Entrevista com o gerente da Caixa: "terça-feira, 20/10, às 14:00"
export function quandoEntrevista(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia}, às ${hora}`;
}
export const nomeModalidadeEntrevista = (m) => (m === 'video' ? 'Videoconferência' : 'Presencial');

// Resultado da entrevista, pela etapa em que o processo está
export function resultadoEntrevista(cliente) {
  if (!cliente?.entrevista_em) return null;
  if (cliente.status === 'entrevista_reprovada') return { tom: 'ruim', texto: 'Entrevista reprovada: processo encerrado' };
  const ordem = R.STATUS.map((s) => s.codigo);
  if (ordem.indexOf(cliente.status) > ordem.indexOf('entrevista')) return { tom: 'bom', texto: 'Entrevista aprovada' };
  return { tom: 'espera', texto: 'Aguardando o resultado' };
}

// Texto pronto da entrevista para o corretor mandar ao cliente (WhatsApp ou e-mail)
export function textoEntrevistaCliente(cliente) {
  const link = /^https?:\/\//i.test(cliente.entrevista_local || '');
  const video = cliente.entrevista_modalidade === 'video';
  const linhas = [`Olá, ${R.primeiroNome(cliente.nome || '')}! Sua entrevista com o gerente da Caixa está marcada:`, '',
    `Data e hora: ${quandoEntrevista(cliente.entrevista_em)}`,
    cliente.entrevista_agencia ? `Agência: ${cliente.entrevista_agencia}` : null,
    cliente.entrevista_gerente ? `Gerente: ${cliente.entrevista_gerente}` : null,
    cliente.entrevista_endereco ? `Endereço: ${cliente.entrevista_endereco}` : null,
    video ? `Videoconferência${cliente.entrevista_local ? `: ${cliente.entrevista_local}` : ''}` : (cliente.entrevista_local && !link ? `Local: ${cliente.entrevista_local}` : null),
    '', video ? 'Fique em um lugar tranquilo, com internet boa e o celular carregado. Tenha o documento original com foto em mãos.'
      : 'Chegue com antecedência e leve o documento original com foto. Deixe o celular carregado.',
    'Qualquer dúvida, é só me chamar.'];
  return linhas.filter((x) => x !== null).join('\n');
}
export function botoesEnviarEntrevista(cliente) {
  const texto = textoEntrevistaCliente(cliente);
  const fone = R.soDigitos(cliente.celular || '');
  const zap = fone.length >= 10 ? `https://wa.me/${R.soDigitos(R.celularInternacional(cliente.celular))}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const email = cliente.email ? `mailto:${cliente.email}?subject=${encodeURIComponent('Sua entrevista com o gerente da Caixa')}&body=${encodeURIComponent(texto)}` : null;
  return h('div', { class: 'entrevista-enviar' },
    h('span', { class: 'sub' }, 'Enviar os dados ao cliente:'),
    h('a', { class: 'btn btn-primario btn-pequeno', href: zap, target: '_blank', rel: 'noopener', id: 'entrevista-whats' }, 'WhatsApp'),
    email ? h('a', { class: 'btn btn-contorno btn-pequeno', href: email, id: 'entrevista-email' }, 'E-mail')
      : h('span', { class: 'sub' }, 'Sem e-mail cadastrado'),
    fone.length >= 10 ? null : h('span', { class: 'sub' }, 'Sem celular cadastrado: escolha o contato no WhatsApp.'));
}

// Faixa para corretor e imobiliária acompanharem e orientarem o cliente
export function blocoEntrevistaCorretor(cliente) {
  if (!cliente?.entrevista_em) return null;
  const passou = new Date(cliente.entrevista_em).getTime() < Date.now() - 3 * 3600 * 1000;
  const link = /^https?:\/\//i.test(cliente.entrevista_local || '');
  const dado = (rotulo, valor) => (valor ? h('div', { class: 'entrevista-dado' }, h('b', null, `${rotulo}: `), valor) : null);
  return h('section', { class: 'entrevista-faixa', 'aria-label': 'Entrevista com o gerente da Caixa' },
    icone('calendario', { tam: 26, traco: 2 }),
    h('div', { style: { minWidth: '0', flex: '1' } },
      h('div', { class: 'entrevista-titulo' }, passou ? 'Entrevista com o gerente da Caixa (já realizada)' : 'Entrevista com o gerente da Caixa'),
      h('div', { class: 'entrevista-quando' }, quandoEntrevista(cliente.entrevista_em)),
      resultadoEntrevista(cliente) ? h('div', { class: `entrevista-resultado ${resultadoEntrevista(cliente).tom}` }, resultadoEntrevista(cliente).texto) : null,
      h('div', { class: 'sub' }, nomeModalidadeEntrevista(cliente.entrevista_modalidade),
        cliente.entrevista_local ? [' · ', link ? h('a', { href: cliente.entrevista_local, target: '_blank', rel: 'noopener' }, 'Abrir o link da reunião') : cliente.entrevista_local] : null),
      dado('Agência', cliente.entrevista_agencia), dado('Gerente', cliente.entrevista_gerente), dado('Endereço', cliente.entrevista_endereco),
      passou ? null : botoesEnviarEntrevista(cliente),
      passou ? null : h('div', { class: 'ajuda' }, 'Oriente o cliente a chegar com antecedência, levar documento original com foto e estar com o celular carregado.')));
}

// Janela de pergunta Sim/Não. Devolve true, false ou null (se fechar sem responder).
export function perguntarSimNao(titulo, texto) {
  return new Promise((resolve) => {
    const fechar = (v) => { fundo.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') fechar(null); };
    const sim = h('button', { type: 'button', class: 'btn btn-primario cheio', onclick: () => fechar(true) }, 'Sim');
    const nao = h('button', { type: 'button', class: 'btn btn-secundario cheio', onclick: () => fechar(false) }, 'Não');
    const fundo = h('div', { class: 'janela-fundo', onclick: (e) => { if (e.target === fundo) fechar(null); } },
      h('div', { class: 'janela', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'janela-titulo' },
        h('h2', { id: 'janela-titulo', style: { fontSize: '19px', fontWeight: '800' } }, titulo),
        texto ? h('p', { style: { margin: '0', fontSize: '15px', lineHeight: '22px', color: '#5A646B' } }, texto) : null,
        h('div', { class: 'linha-botoes' }, nao, sim)));
    document.body.appendChild(fundo);
    document.addEventListener('keydown', esc);
    sim.focus();
  });
}

// Pede uma data (ex.: data de emissão da certidão). Devolve AAAA-MM-DD ou null se cancelar.
export function perguntarData(titulo, texto, { rotulo = 'Data de emissão', valor = '' } = {}) {
  return new Promise((resolve) => {
    const hoje = R.hojeIso();
    const fechar = (v) => { fundo.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') fechar(null); };
    const erro = h('div', { class: 'erro-campo', role: 'alert' });
    const campo = h('input', { id: 'janela-data', class: 'entrada', type: 'date', value: valor, max: hoje, 'aria-label': rotulo });
    const confirmar = () => {
      if (!campo.value) { erro.textContent = 'Informe a data de emissão.'; return; }
      if (campo.value > hoje) { erro.textContent = 'A data não pode ser no futuro.'; return; }
      if (campo.value < '2000-01-01') { erro.textContent = 'Confira o ano da data.'; return; }
      fechar(campo.value);
    };
    const ok = h('button', { type: 'button', class: 'btn btn-primario cheio', onclick: confirmar }, 'Confirmar');
    const cancelar = h('button', { type: 'button', class: 'btn btn-contorno cheio', onclick: () => fechar(null) }, 'Cancelar');
    const fundo = h('div', { class: 'janela-fundo', onclick: (e) => { if (e.target === fundo) fechar(null); } },
      h('div', { class: 'janela', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'janela-titulo' },
        h('h2', { id: 'janela-titulo', style: { fontSize: '19px', fontWeight: '800' } }, titulo),
        texto ? h('p', { style: { margin: '0', fontSize: '15px', lineHeight: '22px', color: '#5A646B' } }, texto) : null,
        h('div', { class: 'campo' }, h('label', { for: 'janela-data' }, rotulo), campo, erro),
        h('div', { class: 'linha-botoes' }, cancelar, ok)));
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
    document.body.appendChild(fundo);
    document.addEventListener('keydown', esc);
    campo.focus();
  });
}

// Chip com a validade de um documento que tem data de emissão
export function chipValidade(n) {
  if (!n.pede_emissao || n.situacao === 'pendente') return null;
  if (!n.validade) return h('span', { class: 'chip chip-alerta' }, 'Informe a data de emissão');
  const tom = n.validade.estado === 'vencido' ? 'chip-recusado' : n.validade.estado === 'atencao' ? 'chip-alerta' : 'chip-aceito';
  return h('span', { class: `chip ${tom}`, title: `Emitida em ${R.formatarData(n.validade.emissao)} · vale até ${R.formatarData(n.validade.vencimento)}` },
    n.validade.estado === 'vencido' ? 'Vencida' : 'Válida', ' · ', n.validade.texto);
}

// ---------- Notificações (push) ----------
function chaveVapid(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const appInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export function notificacoesAtivas() {
  try {
    if (localStorage.getItem('appcca-push') !== 'sim') return false;
    if (api.demo) return true; // demonstração: não pede permissão de verdade
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch { return false; }
}
const ehCelular = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
const aparelho = () => (ehCelular() ? 'celular' : 'computador');
const comPrazo = (promessa, ms, msg) => Promise.race([promessa, new Promise((_, nao) => setTimeout(() => nao(new Error(msg)), ms))]);
const DICA_BLOQUEADO = () => (ehCelular()
  ? 'As notificações estão bloqueadas para o app. Libere nas configurações do celular (Notificações) e tente de novo.'
  : 'As notificações estão bloqueadas neste navegador. Clique no cadeado ao lado do endereço do site → Notificações → Permitir, e tente de novo.');

export async function ativarNotificacoes(vapidPublica) {
  if (api.demo) { await api.inscreverPush(null); try { localStorage.setItem('appcca-push', 'sim'); } catch { /* ok */ } return; }
  if (ehIphone() && !appInstalado()) throw new Error('No iPhone, primeiro adicione o app à tela de início (botão Compartilhar → "Adicionar à Tela de Início") e abra por lá.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') throw new Error('Este navegador não aceita notificações. No computador, use o Chrome ou o Edge.');
  if (!vapidPublica) throw new Error('Notificações ainda não configuradas na CCA.');
  if (Notification.permission === 'denied') throw new Error(DICA_BLOQUEADO());
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? DICA_BLOQUEADO() : 'Para receber os avisos, toque em "Permitir" quando o navegador perguntar.');
  const reg = await comPrazo(navigator.serviceWorker.ready, 10000, 'O app ainda está carregando. Atualize a página (F5) e tente de novo.');
  const sub = (await reg.pushManager.getSubscription()) || await comPrazo(
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(vapidPublica) }), 15000, 'O navegador não respondeu. Tente de novo em instantes.');
  await api.inscreverPush(sub);
  try { localStorage.setItem('appcca-push', 'sim'); localStorage.removeItem('appcca-push-adiado'); } catch { /* ok */ }
}

// Faixa "Receba os avisos": some depois de ativar ou com "Agora não" (volta depois de 14 dias)
function avisosAdiados() {
  try { const t = Number(localStorage.getItem('appcca-push-adiado') || 0); return t && Date.now() - t < 14 * 864e5; } catch { return false; }
}
export function faixaNotificacoes(config) {
  if (config?.parametros?.canal_avisos !== 'push' || notificacoesAtivas() || avisosAdiados()) return null;
  const caixa = h('div', { class: 'aviso aviso-azul faixa-avisos' }, h('img', { class: 'faixa-avisos-arte', src: 'img/arte-avisos.jpg', alt: '', width: 84, height: 63 }));
  const botao = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, `Ativar avisos neste ${aparelho()}`);
  const depois = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno' }, 'Agora não');
  const erro = h('span', { class: 'ajuda', role: 'alert' });
  botao.onclick = async () => {
    botao.disabled = true; botao.textContent = 'Ativando…'; erro.textContent = '';
    try {
      await ativarNotificacoes(config.parametros.vapid_publica);
      toast(`Avisos ativados neste ${aparelho()}.`);
      caixa.remove();
    } catch (e) { erro.textContent = e.message; botao.disabled = false; botao.textContent = `Ativar avisos neste ${aparelho()}`; }
  };
  depois.onclick = () => { try { localStorage.setItem('appcca-push-adiado', String(Date.now())); } catch { /* ok */ } caixa.remove(); toast('Tudo bem. Para ativar depois, toque no seu círculo no topo e escolha Avisos neste aparelho.'); };
  const bloqueado = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  adicionar(caixa,
    h('div', { class: 'faixa-avisos-texto' },
      h('span', null, h('strong', null, 'Receba os avisos da CCA. '), `Mudança de status, documento recusado e mensagens da equipe chegam como notificação neste ${aparelho()}, sem custo.`),
      ehIphone() && !appInstalado() ? h('span', { class: 'ajuda' }, 'No iPhone: toque em Compartilhar → "Adicionar à Tela de Início" e abra o app por lá antes de ativar.') : null,
      bloqueado ? h('span', { class: 'ajuda' }, DICA_BLOQUEADO()) : null,
      erro),
    h('div', { class: 'faixa-avisos-botoes' }, botao, depois));
  return caixa;
}

// Conversa por cliente: corretor/imobiliária <-> equipe da CCA. Quem recebe é avisado (notificação e e-mail).
// lado: 'portal' (corretor) ou 'painel' (equipe). Marca como lida ao abrir.
export function blocoConversa(clienteId, { lado = 'portal', aoLer } = {}) {
  const lista = h('div', { class: 'conversa-lista', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensagens da conversa' }, h('div', { class: 'ajuda' }, 'Carregando a conversa…'));
  const campo = h('textarea', { id: `conversa-${lado}`, class: 'entrada conversa-campo', rows: 2, maxlength: 2000,
    placeholder: lado === 'portal' ? 'Escreva para a equipe da CCA…' : 'Escreva para o corretor…' });
  const enviar = h('button', { type: 'button', class: 'btn btn-primario conversa-enviar' }, 'Enviar');
  const quando = (iso) => {
    const d = new Date(iso);
    const hoje = new Date();
    const ontem = new Date(Date.now() - 864e5);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
    if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
  };
  const desenhar = (msgs) => {
    limpar(lista);
    if (!msgs.length) {
      lista.appendChild(h('div', { class: 'conversa-vazia' }, h('img', { class: 'ilustra-vazio', src: 'img/vazio-conversa.jpg', alt: '', width: 160, height: 120 }), lado === 'portal'
        ? 'Nenhuma mensagem ainda. Dúvida sobre este cliente? Escreva aqui: a equipe da CCA recebe o aviso na hora.'
        : 'Nenhuma mensagem ainda. O corretor recebe o aviso no celular e no e-mail.'));
      return;
    }
    msgs.forEach((m) => lista.appendChild(h('div', { class: `conversa-msg ${m.minha ? 'minha' : ''} ${m.da_equipe ? 'equipe' : 'corretor'}` },
      h('div', { class: 'conversa-autor' }, m.minha ? 'Você' : m.da_equipe ? `${R.primeiroNome(m.autor_nome)} · CCA` : m.autor_nome),
      h('div', { class: 'conversa-texto' }, m.texto),
      h('div', { class: 'conversa-hora' }, quando(m.criada_em)))));
    lista.scrollTop = lista.scrollHeight;
  };
  const carregar = async () => {
    try {
      const msgs = await api.listarConversa(clienteId);
      desenhar(msgs);
      if (msgs.some((m) => !m.minha)) { await api.marcarConversaLida(clienteId).catch(() => {}); aoLer?.(); }
    } catch (e) { limpar(lista); lista.appendChild(h('div', { class: 'ajuda' }, e.message)); }
  };
  enviar.onclick = async () => {
    const t = campo.value.trim();
    if (!t) { campo.focus(); return toast('Escreva a mensagem antes de enviar.'); }
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      await api.enviarConversa(clienteId, t);
      campo.value = '';
      toast(lado === 'portal' ? 'Mensagem enviada. A equipe da CCA foi avisada.' : 'Mensagem enviada. O corretor foi avisado.');
      await carregar();
    } catch (e) { toast(e.message); }
    enviar.disabled = false; enviar.textContent = 'Enviar';
  };
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar.click(); } });
  carregar();
  return h('div', { class: 'conversa' },
    lista,
    h('label', { for: `conversa-${lado}`, class: 'sr' }, lado === 'portal' ? 'Mensagem para a CCA' : 'Mensagem para o corretor'),
    h('div', { class: 'conversa-escrever' }, campo, enviar));
}

// Pré-conferência por IA (sugestão; quem decide é a equipe da CCA)
const SUGESTAO_IA = { aceitar: 'Parece certo', revisar: 'Conferir com atenção', recusar: 'Possível problema' };
export function notaIa(ia, { equipe = false } = {}) {
  if (!ia) return null;
  if (!ia.analisado) {
    if (!equipe) return null;
    return h('div', { class: 'nota-ia neutra' }, h('b', null, 'IA: '), ia.erro || ia.motivo || 'não analisado');
  }
  const tipo = ia.sugestao === 'aceitar' ? 'ok' : ia.sugestao === 'recusar' ? 'problema' : 'atencao';
  if (!equipe) {
    return h('div', { class: `nota-ia ${tipo}` },
      tipo === 'ok' ? 'Conferência automática: parece certo. Agora é com a equipe da CCA.'
        : [h('b', null, 'Conferência automática: '), `${ia.resumo || 'possível problema no arquivo'}. `, 'Se puder, toque em Substituir e envie um arquivo melhor.']);
  }
  const marcas = [
    ia.tipo_confere === false ? `Parece: ${ia.tipo_identificado || 'outro documento'}` : null,
    ia.legivel === false ? 'Pouco legível' : null,
    ia.completo === false ? 'Incompleto ou cortado' : null,
    ia.nome_confere === 'nao' ? 'Nome não confere' : null,
    ia.cpf_confere === 'nao' ? 'CPF não confere' : null,
    ia.validade === 'vencido' ? 'Vencido' : null,
  ].filter(Boolean);
  return h('div', { class: `nota-ia ${tipo}` },
    h('div', { class: 'nota-ia-topo' }, h('span', { class: 'nota-ia-selo' }, `IA · ${SUGESTAO_IA[ia.sugestao] || 'Sugestão'}`),
      ia.data_documento ? h('span', { class: 'sub' }, `Data no documento: ${ia.data_documento}`) : null),
    ia.resumo ? h('div', null, ia.resumo) : null,
    marcas.length ? h('div', { class: 'nota-ia-marcas' }, marcas.map((m) => h('span', null, m))) : null,
    (ia.problemas || []).length && tipo !== 'ok' ? h('ul', null, ia.problemas.map((p) => h('li', null, p))) : null,
    h('div', { class: 'sub' }, 'Sugestão automática. A decisão é da equipe.'));
}

// ---------- Barra superior (igual no painel da equipe e no portal do corretor) ----------
let rolagemMenu = 0; // no celular o menu rola para o lado: guarda a posição entre uma página e outra
function dicaMenu(menu) {
  const sobra = menu.scrollWidth > menu.clientWidth + 2;
  menu.classList.toggle('mais-direita', sobra && menu.scrollLeft + menu.clientWidth < menu.scrollWidth - 4);
  menu.classList.toggle('mais-esquerda', sobra && menu.scrollLeft > 4);
}
function manterMenu() {
  const menu = document.querySelector('.painel-topo .menu-botoes');
  if (!menu) return;
  if (!menu.dataset.dica) { menu.dataset.dica = '1'; menu.addEventListener('scroll', () => dicaMenu(menu), { passive: true }); window.addEventListener('resize', () => dicaMenu(menu)); }
  dicaMenu(menu);
  if (menu.scrollWidth <= menu.clientWidth) return;
  menu.scrollLeft = rolagemMenu;
  const ativo = menu.querySelector('a.ativo');
  if (ativo) {
    const ini = ativo.offsetLeft - menu.offsetLeft;
    const fim = ini + ativo.offsetWidth;
    if (ini < menu.scrollLeft + 8) menu.scrollLeft = Math.max(0, ini - 16);
    else if (fim > menu.scrollLeft + menu.clientWidth - 8) menu.scrollLeft = fim - menu.clientWidth + 16;
  }
  rolagemMenu = menu.scrollLeft;
  dicaMenu(menu);
}
// itens: [{ href, nome, icone, ativo, num, onclick }]; guardar(destino) => handler que pode pedir confirmação antes de sair
export function topoMenu({ inicio, rotulo = 'Menu', itens = [], usuario = '', aoSair, guardar = null, aoBuscar = null, extras = [], foto = null }) {
  setTimeout(() => requestAnimationFrame(manterMenu), 0);
  const proteger = (href, onclick) => (e) => {
    if (onclick) { e.preventDefault(); onclick(e); return; }
    if (guardar) guardar(href.replace(/^#/, ''))(e);
  };
  return h('nav', { class: 'painel-topo', 'aria-label': rotulo },
    h('a', { href: inicio, 'aria-label': 'Início', style: { display: 'flex' }, onclick: guardar ? guardar(inicio.replace(/^#/, '')) : null }, logo('logo-painel')),
    h('div', { class: 'menu-botoes', onscroll: (e) => { rolagemMenu = e.currentTarget.scrollLeft; } },
      itens.map((it) => h('a', { href: it.href || '#', class: it.ativo ? 'ativo' : '', 'aria-current': it.ativo ? 'page' : null, onclick: proteger(it.href || '#', it.onclick) },
        icone(it.icone || 'seta'), it.nome, it.num ? h('span', { class: 'num' }, it.num) : null)),
      aoSair ? h('a', { href: '#/entrar', class: 'sair', title: usuario ? `Sair (${usuario})` : 'Sair', onclick: (e) => { e.preventDefault(); aoSair(); } }, icone('sair'), 'Sair') : null),
    aoBuscar ? h('button', { type: 'button', class: 'busca-botao', 'aria-label': 'Buscar cliente ou tela (Ctrl+K)', title: 'Buscar (Ctrl+K)', onclick: aoBuscar }, icone('busca', { tam: 18, traco: 2.2 }), h('span', { class: 'busca-botao-txt' }, 'Buscar'), h('kbd', null, 'Ctrl K')) : null,
    usuario ? menuUsuario(usuario, aoSair, extras, foto) : null);
}

// Menu do usuário (iniciais no canto): nome, atalhos de teclado e Sair
function menuUsuario(usuario, aoSair, extras = [], foto = null) {
  const [nome, papel] = usuario.split(' · ');
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  let aberto = false;
  const caixa = h('div', { class: 'usuario-menu', role: 'menu', hidden: true },
    h('div', { class: 'usuario-id' }, h('b', null, nome), papel ? h('small', null, papel) : null),
    ...extras.map((x) => h('button', { type: 'button', role: 'menuitem', class: 'usuario-item', onclick: () => { fechar(); x.onclick(); } }, icone(x.icone || 'seta', { tam: 18, traco: 2 }), x.nome)),
    h('button', { type: 'button', role: 'menuitem', class: 'usuario-item so-teclado', onclick: () => { fechar(); import('./busca.js').then((m) => m.abrirAtalhos()); } }, icone('busca', { tam: 18, traco: 2 }), 'Atalhos de teclado', h('kbd', null, '?')),
    aoSair ? h('a', { href: '#/entrar', role: 'menuitem', class: 'usuario-item sair-item', onclick: (e) => { e.preventDefault(); fechar(); aoSair(); } }, icone('sair', { tam: 18, traco: 2 }), 'Sair') : null);
  const botao = h('button', { type: 'button', class: 'usuario-botao', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Menu de ${nome}`, title: usuario, onclick: (e) => { e.stopPropagation(); aberto ? fechar() : abrir(); } }, foto ? h('img', { src: foto, alt: '', class: 'usuario-foto' }) : iniciais);
  const fora = (e) => { if (!caixa.contains(e.target)) fechar(); };
  const esc = (e) => { if (e.key === 'Escape') { fechar(); botao.focus(); } };
  function abrir() { aberto = true; caixa.hidden = false; botao.setAttribute('aria-expanded', 'true'); setTimeout(() => document.addEventListener('click', fora), 0); document.addEventListener('keydown', esc); }
  function fechar() { aberto = false; caixa.hidden = true; botao.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', fora); document.removeEventListener('keydown', esc); }
  return h('div', { class: 'usuario-wrap' }, botao, caixa);
}

// Cabeçalho de página (padrão de todas as telas). Opções: cabecalho({ titulo, sub, sobre, foto }, ...extra)
// foto: true (escritório) ou 'corretor'
const ARTE_POR_TITULO = { 'Convidar': 'arte-convidar', 'Documentos a conferir': 'arte-documentos', 'Mensagens': 'arte-avisos', 'Relatórios': 'arte-relatorios' };
export function cabecalho(titulo, sub, ...extra) {
  const o = typeof titulo === 'object' ? titulo : { titulo, sub, sobre: 'Painel da equipe', arte: ARTE_POR_TITULO[titulo] };
  if (typeof titulo === 'object' && sub) extra = [sub, ...extra];
  extra = extra.filter(Boolean);
  const arte = o.arte || ARTE_POR_TITULO[o.titulo];
  return h('header', { class: `pagina-cab${o.foto ? ' com-foto' : ''}${typeof o.foto === 'string' ? ` foto-${o.foto}` : ''}${arte && !o.foto ? ' com-arte' : ''}` },
    h('div', { class: 'pagina-cab-texto' }, o.sobre ? h('div', { class: 'pagina-sobre' }, o.sobre) : null,
      h('h1', { class: 'pagina-titulo' }, o.titulo), o.sub ? h('p', { class: 'pagina-sub' }, o.sub) : null),
    arte && !o.foto ? h('img', { class: 'pagina-arte', src: `img/${arte}.jpg`, alt: '', width: 220, height: 165 }) : null,
    extra.length ? h('div', { class: 'pagina-cab-extra' }, ...extra) : null);
}

// Título de seção dentro da página (ex.: "Status", "Documentos")
export function secaoTitulo(titulo, sub, { pequeno = false, nivel = 'h2', icone: ic = null } = {}) {
  return h('div', { class: `secao-cab${pequeno ? ' pequeno' : ''}${ic ? ' com-icone' : ''}` },
    ic ? h('span', { class: 'secao-icone', 'aria-hidden': 'true' }, icone(ic, { tam: 20, traco: 2 })) : null,
    h('div', { class: 'secao-cab-texto' }, h(nivel, { class: 'secao-titulo' }, titulo), sub ? h('p', { class: 'secao-sub' }, sub) : null));
}

// Painel de pré-visualização ao lado da lista de documentos (computador)
export function painelPrevia() {
  const el = h('aside', { class: 'lateral previa-doc', 'aria-live': 'polite' });
  let pedido = 0; let marcada = null; let blobAtual = null;
  const vazio = () => {
    limpar(el);
    el.appendChild(h('div', { class: 'cartao previa-vazia' },
      h('img', { class: 'ilustra-vazio', src: 'img/vazio-clientes.jpg', alt: '', width: 200, height: 150 }),
      h('strong', null, 'Escolha um documento'),
      h('span', { class: 'sub' }, 'Clique no olho ou na miniatura de um documento enviado para ver o arquivo aqui, sem sair da lista.')));
  };
  const mostrar = async (n, linha) => {
    const d = n.documento; const meu = ++pedido;
    rolarParaColunas();
    marcada?.classList.remove('selecionado'); marcada = linha; linha?.classList.add('selecionado');
    limpar(el);
    const corpo = h('div', { class: 'previa-corpo' }, h('div', { class: 'sub', style: { padding: '40px 0', textAlign: 'center' } }, 'Abrindo o arquivo…'));
    el.appendChild(h('div', { class: 'cartao previa' },
      h('div', { class: 'previa-topo' },
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'doc-nome' }, n.nome, marcaRegra(n.regra)),
          h('div', { class: 'doc-linha' }, chipSituacao(n.situacao), h('span', null, `${d.nome_original || 'arquivo'}${(d.versao_pessoa ?? d.versao) > 1 ? ` · versão ${d.versao_pessoa ?? d.versao}` : ''}`))),
        h('button', { type: 'button', class: 'painel-fechar', style: { display: 'inline-flex', position: 'static', flex: 'none' }, 'aria-label': 'Fechar a pré-visualização', onclick: () => { marcada?.classList.remove('selecionado'); marcada = null; pedido++; vazio(); } }, icone('fechar', { tam: 18, traco: 2.2 }))),
      corpo,
      h('div', { class: 'previa-acoes' },
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrirDoc(d) }, 'Abrir em nova aba'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrirDoc(d, true) }, icone('baixar', { tam: 16 }), 'Baixar'))));
    try {
      const url = await api.abrirDocumento(d);
      if (meu !== pedido) return;
      limpar(corpo);
      let src = url;
      if (/\.pdf$/i.test(d.nome_original || '')) {
        // O PDF vira um arquivo local (blob) antes de aparecer: assim o navegador mostra o leitor de PDF
        // mesmo que o servidor mande cabeçalhos que impedem exibir dentro de outra página.
        try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); src = URL.createObjectURL(/pdf|octet-stream|^$/.test(b.type) ? new Blob([b], { type: 'application/pdf' }) : b); } } catch { /* usa o endereço direto */ }
        if (meu !== pedido) { if (src !== url) URL.revokeObjectURL(src); return; }
        if (blobAtual) URL.revokeObjectURL(blobAtual);
        blobAtual = src !== url ? src : null;
      }
      corpo.appendChild(/\.pdf$/i.test(d.nome_original || '')
        ? h('iframe', { class: 'previa-pdf', src, title: `Pré-visualização de ${n.nome}` })
        : h('img', { class: 'previa-img', src: url, alt: `Pré-visualização de ${n.nome}`, onerror: (e) => { e.target.replaceWith(h('div', { class: 'sub', style: { padding: '40px 16px', textAlign: 'center' } }, 'Não foi possível mostrar este arquivo aqui. Use Abrir em nova aba.')); } }));
    } catch (e) { if (meu === pedido) { limpar(corpo); corpo.appendChild(h('div', { class: 'aviso aviso-laranja' }, e.message)); } }
  };
  vazio();
  return { el, mostrar };
}

// Computador com tela baixa: ao escolher um cliente, leva a página até a lista + painel, para o painel aparecer inteiro
export function rolarParaColunas() {
  const c = document.querySelector('.painel-colunas');
  if (!c) return;
  const y = c.getBoundingClientRect().top + window.scrollY - 92;
  if (window.scrollY < y - 4) window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
