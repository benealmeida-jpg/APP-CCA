// Busca específica de bens (desconto de 50% no cartório, imóvel acima do limite BIB): GRERJ do começo ao fim.
// CCA gera e anexa as GRERJ → corretor paga SOMENTE no Bradesco e anexa os comprovantes → o app preenche o requerimento →
// requerente assina no gov.br → anexa o assinado → CCA envia ao Cartório Distribuidor de Itaboraí.
import { h, icone, toast, limpar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { aviso, secaoTitulo, escolherArquivo, abrirJanela, perguntarData, perguntarSimNao, abrirGuiaGovbr } from './componentes.js';
import { pessoasDaBusca, situacaoGrerj, pdfRequerimento, VALOR_GRERJ_PADRAO, FINALIDADES_GRERJ } from './docs-preenchidos.js';
import { lerAssinaturasPdf, conferirAssinantes } from './assinatura-pdf.js';
import { baixarArquivo } from './xlsx-simples.js';

const VEZ = { cca: ['Vez da CCA', 'chip-status'], corretor: ['Sua vez', 'chip-alerta'], cartorio: ['No cartório', 'chip-aceito'] };
const abrirUrl = async (pegar) => { const w = window.open('', '_blank'); try { const url = await pegar(); if (w) w.location = url; else location.href = url; } catch (e) { w?.close(); toast(e.message); } };
const rotFin = (f) => (f === 'registro' ? 'Registro (RGI)' : 'Escritura');

// Passo a passo do TJ-RJ (enviado pela CCA)
function guiaTjrj() {
  abrirJanela('Como gerar a GRERJ no TJ-RJ',
    h('ol', { class: 'doc-orient-lista' },
      h('li', null, 'Acesse ', h('a', { href: 'https://www.tjrj.jus.br', target: '_blank', rel: 'noopener' }, 'tjrj.jus.br'), ' → GRERJ → GRERJ eletrônica → Emitir com código de barras.'),
      h('li', null, 'Tipo: Cartório extrajudicial oficializado (atos extrajudiciais). Código do órgão: ', h('b', null, '1558'), '.'),
      h('li', null, 'Informe CPF e nome da pessoa da busca.'),
      h('li', null, 'Emolumentos: ', h('b', null, 'R$ 117,24'), ' e "Calcular percentuais automaticamente" = SIM. Total: ', h('b', null, 'R$ 161,77'), '.'),
      h('li', null, 'Gere uma GRERJ para a escritura e outra para o registro (RGI), para cada pessoa.'),
      h('li', null, 'Salve o PDF de cada guia e anexe aqui com o número e o valor.')),
    aviso('laranja', h('b', null, 'Pagamento SOMENTE no Bradesco. '), 'Guia paga em outro banco não é reconhecida pelo cartório.'));
}

export function blocoBuscaBens({ cliente, participantes = null, equipe = false, aoMudar }) {
  if (R.faixaDescontoCartorio(cliente) !== 'BUSCA') return null;
  const caixa = h('section', { class: 'bloco-secao divisor busca-bens', id: 'secao-busca-bens' }, h('div', { class: 'sub' }, 'Carregando a busca de bens…'));
  Promise.all([api.grerjDoCliente(cliente.id), participantes ? Promise.resolve(participantes) : api.obterCliente(cliente.id).then((d) => d.participantes || []).catch(() => [])])
    .then(([dados, participantes]) => desenhar(caixa, { cliente, participantes, dados, equipe, aoMudar }))
    .catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

function desenhar(caixa, { cliente, participantes, dados, equipe, aoMudar }) {
  limpar(caixa);
  const pessoas = pessoasDaBusca(cliente, participantes);
  const guias = dados.guias || [];
  const esperadas = pessoas.length * 2;
  const sit = situacaoGrerj(guias, { assinadoEm: dados.assinado?.em, enviadoEm: dados.enviado_em, esperadas });
  const [rot, cls] = VEZ[sit.vez] || VEZ.cca;
  const chip = equipe ? (sit.vez === 'corretor' ? ['Com o corretor', 'chip-alerta'] : sit.vez === 'cca' ? ['Sua vez', 'chip-status'] : [rot, cls]) : [rot, cls];
  caixa.append(
    h('div', { class: 'damp-cab' }, secaoTitulo('Busca de bens (desconto de 50%)', `Imóvel de ${R.formatarMoeda(cliente.valor_imovel)} · ${pessoas.length} ${pessoas.length > 1 ? 'pessoas' : 'pessoa'} · ${esperadas} GRERJ`, { pequeno: true, nivel: 'h3', icone: 'cifrao' }),
      h('span', { class: `chip ${chip[1]}` }, chip[0])),
    h('div', { class: 'ajuda', style: { fontWeight: '600' } }, sit.texto));

  const passo = (n, titulo, feito, ...extra) => h('li', { class: feito ? 'feito' : '' }, h('b', null, `${n}. ${titulo}`), feito ? h('span', { class: 'chip chip-aceito' }, 'Feito') : null, ...extra.filter(Boolean));
  const ol = h('ol', { class: 'passos-desconto' });

  // 1 e 2. Guias e pagamento
  const linhas = guias.map((g) => linhaGuia(g, { cliente, equipe, aoMudar, pessoas }));
  ol.append(
    passo(1, 'GRERJ geradas pela CCA no site do TJ-RJ', guias.length >= esperadas && guias.length > 0,
      h('div', { class: 'ajuda' }, '2 GRERJ por pessoa (escritura e registro), R$ 161,77 cada.',
        equipe ? [' ', h('button', { type: 'button', class: 'btn-link', onclick: guiaTjrj }, 'Como gerar no TJ-RJ')] : null),
      linhas.length ? h('div', { class: 'grerj-lista' }, ...linhas) : h('div', { class: 'sub' }, equipe ? 'Nenhuma GRERJ anexada ainda.' : 'A CCA ainda vai gerar as GRERJ.'),
      equipe ? formGuia({ cliente, pessoas, guias, aoMudar }) : null,
      equipe && guias.length ? h('div', { class: 'gest-acoes' },
        h('button', { type: 'button', class: `btn btn-pequeno ${dados.liberado_em ? 'btn-contorno' : 'btn-primario'}`, id: 'grerj-liberar',
          onclick: async (e) => { e.currentTarget.disabled = true; try { await api.grerjLiberar(cliente.id); toast('Corretor avisado na conversa.'); aoMudar(); } catch (er) { toast(er.message); e.currentTarget.disabled = false; } } },
          dados.liberado_em ? 'Avisar o corretor de novo' : 'Avisar o corretor para pagar'),
        dados.liberado_em ? h('span', { class: 'sub' }, `Avisado em ${R.formatarData(dados.liberado_em)}`) : null) : null),
    passo(2, 'Pagar SOMENTE no Bradesco e anexar os comprovantes', guias.length > 0 && guias.every((g) => g.pago_em),
      !equipe && guias.length ? aviso('laranja', h('b', null, 'Pague SOMENTE no Bradesco '), '(app, internet banking ou agência). Guia paga em outro banco não é aceita pelo cartório. Depois anexe o comprovante de cada guia acima.') : null,
      equipe ? h('div', { class: 'ajuda' }, 'O corretor anexa o comprovante de cada guia. A CCA também pode anexar.') : null));

  // 3. Requerimento
  ol.append(passo(3, 'Requerimento preenchido e assinado no gov.br', !!dados.assinado, ...blocoRequerimento({ cliente, pessoas, guias, dados, equipe, aoMudar })));

  // 4. Envio ao cartório
  const email = R.textoRequerimento({ ...cliente, grerj_numero: guias.map((g) => g.numero).filter(Boolean).join(', '), grerj_valor: guias.reduce((s, g) => s + (Number(g.valor) || 0), 0) || null, grerj_pago_em: guias.map((g) => g.pago_em).filter(Boolean).sort().pop() || null });
  const copiar = async () => { try { await navigator.clipboard.writeText(`${email.assunto}\n\n${email.corpo}`); toast('E-mail copiado.'); } catch { toast('Não consegui copiar. Use "Abrir no e-mail".'); } };
  ol.append(passo(4, 'CCA envia ao Cartório Distribuidor de Itaboraí', !!dados.enviado_em,
    dados.enviado_em ? h('div', { class: 'ajuda' }, `Enviado em ${R.formatarData(dados.enviado_em)}.`) : null,
    equipe && dados.assinado ? h('div', { class: 'gest-acoes' },
      h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: copiar }, 'Copiar texto do e-mail'),
      h('a', { class: 'btn btn-pequeno btn-contorno', href: `mailto:?subject=${encodeURIComponent(email.assunto)}&body=${encodeURIComponent(email.corpo)}` }, 'Abrir no e-mail'),
      h('button', { type: 'button', class: `btn btn-pequeno ${dados.enviado_em ? 'btn-link' : 'btn-primario'}`, id: 'grerj-enviado',
        onclick: async () => { try { await api.grerjMarcarEnviado(cliente.id, dados.enviado_em ? null : R.hojeIso()); toast(dados.enviado_em ? 'Envio desfeito.' : 'Marcado como enviado. O corretor foi avisado.'); aoMudar(); } catch (e) { toast(e.message); } } },
        dados.enviado_em ? 'Desfazer envio' : 'Marcar como enviado')) : null,
    !dados.enviado_em && !equipe ? h('div', { class: 'ajuda' }, 'Depois do requerimento assinado, a CCA envia tudo ao cartório.') : null));
  ol.append(passo(5, 'Certidões de busca anexadas no processo', false, h('div', { class: 'ajuda' }, equipe ? 'Quando o cartório emitir, anexe as certidões em Documentos › Imóvel.' : 'A CCA anexa as certidões quando o cartório emitir.')));
  caixa.appendChild(ol);
}

function linhaGuia(g, { cliente, equipe, aoMudar }) {
  const anexarComprovante = async (ev) => {
    const btn = ev.currentTarget;
    const arquivo = await escolherArquivo();
    if (!arquivo) return;
    const data = await perguntarData('Data do pagamento', 'Confira a data no comprovante do Bradesco.', { rotulo: 'Data do pagamento', valor: R.hojeIso() });
    if (!data) return;
    btn.disabled = true; btn.textContent = 'Enviando…';
    try { await api.grerjComprovante(cliente.id, g.id, arquivo, data); toast('Comprovante anexado.'); aoMudar(); } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Anexar comprovante'; }
  };
  return h('div', { class: `grerj-guia${g.pago_em ? ' paga' : ''}` },
    h('div', { class: 'grerj-guia-txt' },
      h('b', null, `${g.pessoa_nome || 'Pessoa'} · ${rotFin(g.finalidade)}`),
      h('span', { class: 'sub' }, `GRERJ nº ${g.numero || '—'} · ${g.valor ? R.formatarMoeda(g.valor) : '—'}`),
      g.pago_em ? h('span', { class: 'chip chip-aceito' }, `Paga em ${R.formatarData(g.pago_em)}`) : h('span', { class: 'chip chip-alerta' }, 'A pagar')),
    h('div', { class: 'grerj-guia-acoes' },
      g.guia_path ? h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: () => abrirUrl(() => api.grerjAbrir(g.guia_path)) }, icone('baixar', { tam: 16 }), 'Guia') : null,
      g.comprovante_path ? h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: () => abrirUrl(() => api.grerjAbrir(g.comprovante_path)) }, icone('olho', { tam: 16 }), 'Comprovante') : null,
      h('button', { type: 'button', class: `btn btn-pequeno ${g.pago_em ? 'btn-link' : 'btn-primario'}`, onclick: anexarComprovante }, g.pago_em ? 'Trocar comprovante' : [icone('clipe', { tam: 16 }), 'Anexar comprovante']),
      equipe ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Excluir a GRERJ ${g.numero || ''}`, title: 'Excluir esta GRERJ',
        onclick: async () => { if (!(await perguntarSimNao('Excluir esta GRERJ?', `${g.pessoa_nome || ''} · ${rotFin(g.finalidade)} · nº ${g.numero || '—'}`))) return; try { await api.grerjExcluirGuia(g.id); toast('GRERJ excluída.'); aoMudar(); } catch (e) { toast(e.message); } } }, icone('lixeira', { tam: 18 })) : null));
}

// CCA: anexar uma GRERJ (já sugere a próxima pessoa/finalidade que falta)
function formGuia({ cliente, pessoas, guias, aoMudar }) {
  const falta = [];
  for (const p of pessoas) for (const [f] of FINALIDADES_GRERJ) if (!guias.some((g) => Number(g.pessoa_ordem) === Number(p.ordem) && g.finalidade === f)) falta.push([p, f]);
  const [pSug, fSug] = falta[0] || [pessoas[0], 'escritura'];
  const selPessoa = h('select', { class: 'entrada', id: 'grerj-pessoa', 'aria-label': 'Pessoa' }, ...pessoas.map((p) => h('option', { value: String(p.ordem), selected: p.ordem === pSug?.ordem }, p.nome || `Pessoa ${p.ordem}`)));
  const selFin = h('select', { class: 'entrada', id: 'grerj-fin', 'aria-label': 'Finalidade' }, ...FINALIDADES_GRERJ.map(([v, t]) => h('option', { value: v, selected: v === fSug }, t)));
  const num = h('input', { class: 'entrada', id: 'grerj-num', 'aria-label': 'Número da GRERJ', placeholder: 'Nº da GRERJ', inputmode: 'numeric' });
  const val = h('input', { class: 'entrada', id: 'grerj-val', 'aria-label': 'Valor', inputmode: 'numeric', value: R.formatarMoeda(VALOR_GRERJ_PADRAO),
    oninput: (e) => { const v = R.lerMoeda(e.target.value); e.target.value = v === null ? '' : R.formatarMoeda(v); } });
  let arquivo = null;
  const nomeArq = h('span', { class: 'sub' }, 'PDF da guia (opcional)');
  const escolher = h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: async () => { arquivo = await escolherArquivo('application/pdf,image/*'); nomeArq.textContent = arquivo ? arquivo.name : 'PDF da guia (opcional)'; } }, icone('clipe', { tam: 16 }), 'Escolher PDF');
  const salvar = h('button', { type: 'button', class: 'btn btn-pequeno btn-primario', id: 'grerj-salvar', onclick: async () => {
    const valor = R.lerMoeda(val.value);
    if (!num.value.trim() && !arquivo) return toast('Informe o número da GRERJ ou anexe o PDF da guia.');
    const p = pessoas.find((x) => String(x.ordem) === selPessoa.value) || pessoas[0];
    salvar.disabled = true;
    try {
      await api.grerjSalvarGuia(cliente.id, { pessoa_ordem: p.ordem, pessoa_nome: p.nome, pessoa_cpf: p.cpf, finalidade: selFin.value, numero: num.value.trim(), valor }, arquivo);
      toast('GRERJ anexada.'); aoMudar();
    } catch (e) { toast(e.message); salvar.disabled = false; }
  } }, 'Anexar GRERJ');
  return h('details', { class: 'mo-incluir', open: guias.length < pessoas.length * 2 },
    h('summary', null, falta.length ? `Anexar GRERJ (faltam ${falta.length})` : 'Anexar outra GRERJ'),
    h('div', { class: 'grerj-campos' }, selPessoa, selFin, num, val),
    h('div', { class: 'gest-acoes' }, escolher, nomeArq, salvar));
}

function blocoRequerimento({ cliente, pessoas, guias, dados, equipe, aoMudar }) {
  const req = { nome: cliente.nome || '', cpf: cliente.cpf || '', rg: cliente.rg_numero || '', orgao: cliente.rg_orgao || '', contato: '', ...(dados.requerente || {}) };
  const campo = (id, rotulo, chave, extra = {}) => {
    const el = h('input', { class: 'entrada', id, value: req[chave] || '', ...extra, oninput: (e) => { req[chave] = e.target.value; } });
    return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), el);
  };
  const salvarReq = async () => { await api.grerjSalvarRequerente(cliente.id, req); };
  const pagas = guias.length > 0 && guias.every((g) => g.pago_em);
  const baixar = h('button', { type: 'button', class: 'btn btn-pequeno btn-primario', id: 'grerj-baixar-req', onclick: async () => {
    if (!req.nome.trim() || !R.soDigitos(req.cpf)) return toast('Informe nome e CPF do requerente.');
    try { await salvarReq(); } catch (e) { return toast(e.message); }
    const bytes = pdfRequerimento({ requerente: req, pessoas, guias, data: new Date() });
    baixarArquivo(new Blob([bytes], { type: 'application/pdf' }), `Requerimento busca de bens - ${cliente.nome || 'cliente'}.pdf`);
    toast('Requerimento baixado. Assine no gov.br e anexe aqui.');
  } }, icone('baixar', { tam: 16 }), 'Baixar requerimento preenchido');
  const anexar = h('button', { type: 'button', class: `btn btn-pequeno ${dados.assinado ? 'btn-link' : 'btn-contorno'}`, id: 'grerj-anexar-req', onclick: async () => {
    const arquivo = await escolherArquivo('application/pdf');
    if (!arquivo) return;
    let leitura = { pdf: false, digital: false, nomes: [] };
    try { leitura = lerAssinaturasPdf(new Uint8Array(await arquivo.arrayBuffer())); } catch { /* segue */ }
    const enviar = async () => {
      try { await api.grerjRequerimentoAssinado(cliente.id, arquivo, { assinantes: leitura.nomes, digital: leitura.pdf ? leitura.digital : false }); toast(equipe ? 'Requerimento anexado.' : 'Requerimento anexado. A CCA foi avisada.'); aoMudar(); } catch (e) { toast(e.message); }
    };
    const fechar = () => document.querySelector('.janela-fundo')?.remove();
    if (!leitura.digital) {
      return abrirJanela('Sem assinatura digital', h('p', null, 'Este PDF não tem assinatura digital do gov.br. O cartório pode recusar requerimento sem assinatura.'),
        h('div', { class: 'gest-acoes' },
          h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: () => { fechar(); enviar(); } }, 'Anexar mesmo assim'),
          h('button', { type: 'button', class: 'btn-link', onclick: () => { fechar(); abrirGuiaGovbr(); } }, 'Como assinar no gov.br')));
    }
    const { faltam } = conferirAssinantes([{ nome: req.nome, papel: 'requerente' }], leitura.nomes);
    if (faltam.length) {
      return abrirJanela('Assinatura de outra pessoa', h('p', null, `O requerente é ${req.nome}, mas o PDF foi assinado por: ${leitura.nomes.join(', ') || 'nome não encontrado'}.`),
        h('div', { class: 'gest-acoes' }, h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: () => { fechar(); enviar(); } }, 'Anexar mesmo assim')));
    }
    toast(`Assinado por: ${leitura.nomes.join(', ')}.`);
    enviar();
  } }, dados.assinado ? 'Trocar o assinado' : [icone('clipe', { tam: 16 }), 'Anexar requerimento assinado']);
  return [
    h('div', { class: 'ajuda' }, 'O app preenche o requerimento com as GRERJ e os dados de cada pessoa. O requerente assina no gov.br. Confira os dados de quem vai assinar:'),
    h('details', { class: 'mo-incluir', open: !dados.requerente && !dados.assinado },
      h('summary', null, `Requerente: ${req.nome || '—'}`),
      h('div', { class: 'grerj-campos' }, campo('greq-nome', 'Nome', 'nome'), campo('greq-cpf', 'CPF', 'cpf', { inputmode: 'numeric' }),
        campo('greq-rg', 'RG', 'rg'), campo('greq-orgao', 'Órgão emissor', 'orgao'), campo('greq-contato', 'Telefone de contato', 'contato', { inputmode: 'tel' })),
      h('button', { type: 'button', class: 'btn-link', onclick: async () => { try { await salvarReq(); toast('Dados do requerente salvos.'); } catch (e) { toast(e.message); } } }, 'Salvar dados do requerente')),
    !pagas ? h('div', { class: 'sub' }, 'O requerimento sai com os números de todas as GRERJ. Melhor baixar depois de pagar todas.') : null,
    h('div', { class: 'gest-acoes' }, baixar, anexar,
      dados.assinado ? h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: () => abrirUrl(() => api.grerjAbrir(dados.assinado.path)) }, icone('olho', { tam: 16 }), 'Ver assinado') : null,
      h('button', { type: 'button', class: 'btn-link', onclick: abrirGuiaGovbr }, 'Como assinar no gov.br')),
    dados.assinado ? h('div', { class: 'ajuda' }, `Anexado em ${R.formatarData(dados.assinado.em)}${dados.assinado.digital === false ? ' · sem assinatura digital' : dados.assinado.assinantes?.length ? ` · assinado por ${dados.assinado.assinantes.join(', ')}` : ''}.`) : null,
  ];
}
