// Engenharia: avaliação do imóvel pela Caixa. Mesma tela para o corretor/imobiliária e para a equipe da CCA.
// Sempre em nome do VENDEDOR e sem depender de uma venda. O laudo é confidencial da Caixa: aqui só se lança o resultado.
import { h, limpar, adicionar, icone, toast } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import * as E from './engenharia-regras.js';
import { cabecalho, secaoTitulo, botaoOpcao, aviso, perguntarSimNao, mascaraMoeda } from './componentes.js';
import { MODELO2 } from './config.js';
import { valorEmNumero } from './financeiro-dados.js';
import { botaoArquivo as botaoArquivoRotulo, escolhaDeImovel } from './imoveis.js';
import * as IMD from './imoveis-dados.js';
const emailOk = (x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x || '').trim());
const moedaCampo = (v) => (v == null || v === '' ? '' : R.formatarMoeda(v));
const fmtMoeda = (x) => { const n = R.lerMoeda(x); return n === null ? '' : R.formatarMoeda(n); };
// Modelo 2: botões de tipo (Imóvel novo pergunta também se é FGTS ou SBPE). alvo.tipo guarda o código.
function pilulasTipoM2(alvo, aoMudar) {
  const grupo = E.grupoTipo(alvo.tipo);
  const pil = h('div', { class: 'pilulas' });
  E.TIPOS_M2.forEach(([cod, nome]) => pil.appendChild(botaoOpcao(nome, grupo === cod, () => { alvo.tipo = cod === 'novo' ? (grupo === 'novo' ? alvo.tipo : 'novo_fgts') : cod; aoMudar(); }, 'pilula')));
  if (grupo !== 'novo') return pil;
  const sub = h('div', { class: 'pilulas' });
  [['novo_fgts', 'Com FGTS (MCMV)'], ['novo_sbpe', 'SBPE']].forEach(([cod, nome]) => sub.appendChild(botaoOpcao(nome, alvo.tipo === cod, () => { alvo.tipo = cod; aoMudar(); }, 'pilula')));
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, pil, h('span', { class: 'ajuda' }, 'Imóvel novo: qual a linha? (muda a lista de documentos)'), sub);
}
// Modelo 2: valor desejado e quem acompanha a vistoria (vendedor, corretor, comprador ou outra pessoa)
const telLocal = (t) => { let d = R.soDigitos(t || ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d ? R.formatarCelular(d) : ''; };
export const QUEM_ACOMPANHA = [['vendedor', 'Vendedor'], ['corretor', 'Corretor'], ['comprador', 'Comprador'], ['outro', 'Outro']];
// fontes: { vendedor: () => pessoa|null, corretor: () => pessoa|null, compradores: () => Promise<[cliente]> }  pessoa = { nome, telefone, email }
function blocoAcompanhamento(v, campo, fontes) {
  const area = h('div', { class: 'eng-acomp', 'aria-live': 'polite' });
  const preencher = (p) => { v.acompanhante_nome = p?.nome || ''; v.acompanhante_telefone = telLocal(p?.telefone); v.acompanhante_email = p?.email || ''; };
  const campos = (soFaltando = false) => {
    const faltaTel = R.soDigitos(v.acompanhante_telefone).length < 10; const faltaMail = !emailOk(v.acompanhante_email);
    return h('div', { class: 'form-eng-grade', style: soFaltando ? { maxWidth: '760px' } : null },
      !soFaltando || !v.acompanhante_nome ? campo('eng-anome', 'Nome de quem vai acompanhar', 'acompanhante_nome', { placeholder: 'Quem abre o imóvel para o engenheiro' }) : null,
      !soFaltando || faltaTel ? campo('eng-atel', 'Telefone / WhatsApp de quem acompanha', 'acompanhante_telefone', { inputmode: 'tel', placeholder: '(21) 99999-9999' }, R.formatarCelular) : null,
      !soFaltando || faltaMail ? campo('eng-amail', 'E-mail de quem acompanha', 'acompanhante_email', { inputmode: 'email', type: 'email', placeholder: 'nome@email.com' }) : null);
  };
  const resumo = (rotulo) => {
    const completo = v.acompanhante_nome && R.soDigitos(v.acompanhante_telefone).length >= 10 && emailOk(v.acompanhante_email);
    return [h('div', { class: 'eng-acomp-resumo', 'data-resumo': '1' }, icone('pessoa', { tam: 18, traco: 2 }),
      h('span', null, h('b', null, v.acompanhante_nome || rotulo), [v.acompanhante_telefone, v.acompanhante_email].filter(Boolean).length ? ` · ${[v.acompanhante_telefone, v.acompanhante_email].filter(Boolean).join(' · ')}` : '')),
      completo ? null : h('div', { class: 'ajuda' }, `Faltam dados ${rotulo === 'Corretor' ? 'do corretor' : rotulo === 'Vendedor' ? 'do vendedor' : 'do comprador'}. Complete abaixo:`),
      completo ? null : campos(true)];
  };
  const desenhar = async () => {
    limpar(area);
    const tipo = v.acompanhante_tipo || '';
    const opcoes = QUEM_ACOMPANHA.filter(([c]) => c !== 'corretor' || fontes.corretor?.());
    const pil = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Quem vai acompanhar a vistoria' });
    opcoes.forEach(([c, nome]) => pil.appendChild(botaoOpcao(nome, tipo === c, () => {
      if (v.acompanhante_tipo === c) return;
      v.acompanhante_tipo = c; v.comprador_id = '';
      if (c === 'vendedor') preencher(fontes.vendedor?.());
      else if (c === 'corretor') preencher(fontes.corretor?.());
      else preencher(null);
      desenhar();
    }, 'pilula')));
    adicionar(area, h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, 'Quem vai acompanhar a vistoria?'), pil));
    if (tipo === 'vendedor' || tipo === 'corretor') adicionar(area, ...resumo(tipo === 'vendedor' ? 'Vendedor' : 'Corretor'));
    else if (tipo === 'outro') adicionar(area, h('div', { class: 'ajuda' }, 'Informe quem vai abrir o imóvel para o engenheiro.'), campos());
    else if (tipo === 'comprador') {
      let lista = []; try { lista = (await fontes.compradores?.()) || []; } catch { /* sem lista */ }
      if (v.acompanhante_tipo !== 'comprador') return;
      const sel = h('select', { class: 'entrada', id: 'eng-comprador', onchange: (ev) => {
        v.comprador_id = ev.target.value;
        const c = lista.find((x) => x.id === v.comprador_id);
        preencher(c ? { nome: c.nome, telefone: c.celular, email: c.email } : null);
        desenhar();
      } }, h('option', { value: '' }, lista.length ? 'Escolha o comprador' : 'Nenhum cliente cadastrado'),
        lista.map((c) => h('option', { value: c.id, selected: c.id === v.comprador_id }, `${c.nome}${c.cpf ? ` · ${R.formatarCpf(c.cpf)}` : ''}`)),
        h('option', { value: 'novo', selected: v.comprador_id === 'novo' }, 'Comprador ainda não cadastrado (digitar os dados)'));
      adicionar(area, h('div', { class: 'campo', style: { maxWidth: '520px' } }, h('label', { for: 'eng-comprador' }, 'Qual comprador?'), sel));
      if (v.comprador_id === 'novo') adicionar(area, campos());
      else if (v.comprador_id) adicionar(area, ...resumo('Comprador'));
    }
  };
  desenhar();
  return { redesenhar: desenhar, elementos: [secaoTitulo('Valor desejado e quem acompanha a vistoria', 'O engenheiro da Caixa liga para quem vai abrir o imóvel.', { pequeno: true, nivel: 'h3', icone: 'calendario' }),
    h('div', { style: { maxWidth: '360px' } }, campo('eng-valor', 'Valor desejado na avaliação', 'valor_desejado', { inputmode: 'numeric', placeholder: 'R$ 0,00' }, fmtMoeda)), area] };
}
function validarAcompanhamento(v) {
  if (!(valorEmNumero(v.valor_desejado) > 0)) return 'Informe o valor desejado na avaliação.';
  if (!v.acompanhante_tipo) return 'Escolha quem vai acompanhar a vistoria.';
  if (v.acompanhante_tipo === 'comprador' && !v.comprador_id) return 'Escolha o comprador que vai acompanhar.';
  if (!String(v.acompanhante_nome || '').trim()) return 'Informe quem vai acompanhar a vistoria.';
  if (R.soDigitos(v.acompanhante_telefone).length < 10) return 'Informe o telefone de quem acompanha, com DDD.';
  if (!emailOk(v.acompanhante_email)) return 'Informe um e-mail válido de quem acompanha.';
  return null;
}
const dadosAcompanhamento = (v) => ({ valor_desejado: valorEmNumero(v.valor_desejado), acompanhante_tipo: v.acompanhante_tipo || null, acompanhante_cliente_id: v.acompanhante_tipo === 'comprador' && v.comprador_id && v.comprador_id !== 'novo' ? v.comprador_id : null, acompanhante_nome: String(v.acompanhante_nome || '').trim(), acompanhante_telefone: R.soDigitos(v.acompanhante_telefone), acompanhante_email: String(v.acompanhante_email || '').trim().toLowerCase() });
// Quem faz a parte do corretor: o próprio corretor, ou a CCA quando ela pediu a engenharia em nome próprio (Modelo 2)
const fazCorretor = (e, ctx) => !ctx.daEquipe || !!e.pela_cca;

const nomePessoa = (e) => `${e.criado_por_nome}${e.criado_por_apelido ? ` (${e.criado_por_apelido})` : ''}${e.pela_cca ? ' · CCA' : e.pedido_por_cca ? ` (solicitação feita pelo(a) CCA: ${e.pedido_por_cca})` : ''}`;
// Modelo 2: "Solicitação feita pelo(a) CCA: Ebenézer" / "pelo(a) corretor(a): João Alves"
const quemSolicitou = (e) => (e.pela_cca ? `pelo(a) CCA: ${e.criado_por_nome}` : e.pedido_por_cca ? `pelo(a) CCA: ${e.pedido_por_cca}, em nome do(a) corretor(a) ${e.criado_por_nome}` : `pelo(a) corretor(a): ${e.criado_por_nome}${e.criado_por_apelido ? ` (${e.criado_por_apelido})` : ''}`);
const enderecoCurto = (e) => [e.imovel_endereco, [e.imovel_cidade, e.imovel_uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || 'Endereço não informado';

function chipEtapa(e) {
  if (e.etapa === 'laudo') {
    if (e.laudo_aprovado) return h('span', { class: 'chip chip-aceito' }, 'Aprovado');
    return h('span', { class: 'chip chip-alerta' }, 'Reprovado (PEPT)');
  }
  return h('span', { class: 'chip chip-em_conferencia' }, E.nomeEtapaEngenharia(e.etapa));
}

function validadeTexto(e) {
  const v = e.validade_em || E.validadeDoLaudo(e.avaliacao_data);
  if (!v) return null;
  const dias = E.diasParaVencer(v);
  return { v, dias, texto: dias < 0 ? `vencida há ${-dias} dia${-dias === 1 ? '' : 's'}` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}` };
}

function escolherArquivo(aoEscolher) {
  const i = h('input', { type: 'file', accept: 'application/pdf,image/*,.xls,.xlsx', style: { display: 'none' }, onchange: () => { const f = i.files[0]; i.remove(); if (f) aoEscolher(f); } });
  document.body.appendChild(i); i.click();
}

async function abrir(doc, baixar = false) {
  const janela = baixar ? null : window.open('', '_blank');
  try {
    const url = await api.abrirDocEngenharia(doc, { baixar });
    if (baixar) { const a = h('a', { href: url, download: doc.nome_original || 'documento' }); document.body.appendChild(a); a.click(); a.remove(); }
    else if (janela) janela.location = url; else location.href = url;
  } catch (e) { janela?.close(); toast(e.message); }
}

// ---------- Lista ----------
async function excluirPedido(e, depois) {
  const ok = await perguntarSimNao('Excluir este pedido de engenharia?', `${e.vendedor?.nome || 'Vendedor'} · ${enderecoCurto(e)}. Os documentos anexados também saem da lista.`);
  if (!ok) return;
  try { await api.excluirEngenharia(e.id); toast('Pedido excluído.'); depois(); } catch (er) { toast(er.message); }
}
const podeExcluir = (e, daEquipe) => daEquipe || ['documentacao', 'em_analise'].includes(e.etapa);

function listaEngenharias(lista, { daEquipe, base, recarregar }) {
  const cab = daEquipe ? ['Imóvel', 'Vendedor', 'Tipo', 'Quem pediu', 'Situação', ''] : ['Imóvel', 'Vendedor', 'Tipo', 'Situação', ''];
  const linhas = lista.map((e) => {
    const val = e.laudo_aprovado ? validadeTexto(e) : null;
    const cels = [
      h('div', null, h('b', null, enderecoCurto(e)), e.matricula ? h('div', { class: 'sub' }, `Matrícula ${e.matricula}`) : null),
      h('div', null, h('b', null, e.vendedor?.nome || '—'), e.vendedor?.responsavel_nome ? h('div', { class: 'sub' }, e.vendedor.responsavel_nome) : null),
      E.nomeTipoEngenharia(e.tipo),
    ];
    if (daEquipe) cels.push(h('div', null, nomePessoa(e), e.imobiliaria_nome ? h('div', { class: 'sub' }, e.imobiliaria_nome) : null));
    cels.push(h('div', null, chipEtapa(e), daEquipe && e.docs_novos ? h('span', { class: 'chip chip-alerta', style: { marginLeft: '6px' } }, 'Documentos novos') : null,
      e.laudo_aprovado ? h('div', { class: 'sub' }, `${E.moeda(e.avaliacao_valor)} · válida até ${E.dataBR(val?.v)} (${val?.texto})`) : null,
      e.laudo_aprovado === false && e.pepts?.some((p) => !p.resolvida_em) ? h('div', { class: 'sub' }, 'Pendência para resolver') : null));
    cels.push(podeExcluir(e, daEquipe) ? h('button', { type: 'button', class: 'btn-icone', title: 'Excluir pedido', 'aria-label': `Excluir pedido de ${e.vendedor?.nome || 'vendedor'}`,
      onclick: (ev) => { ev.stopPropagation(); excluirPedido(e, recarregar); }, onkeydown: (ev) => ev.stopPropagation() }, icone('lixeira', { tam: 18, traco: 2 })) : '');
    return cels;
  });
  if (!linhas.length) return h('div', { class: 'cartao' }, h('div', { class: 'subtitulo' }, daEquipe ? 'Nenhuma solicitação de engenharia ainda.' : 'Você ainda não pediu nenhuma engenharia. Use "Nova solicitação".'));
  return h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, cab.map((c) => h('th', null, c)))),
    h('tbody', null, linhas.map((cels, i) => h('tr', { class: 'linha-clicavel', tabindex: '0', onclick: () => { location.hash = `${base}/${lista[i].id}`; },
      onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `${base}/${lista[i].id}`; } }, cels.map((c, j) => h('td', { 'data-rotulo': cab[j], class: cab[j] ? null : 'col-acao' }, c)))))));
}

// ---------- Nova solicitação (corretor / imobiliária) ----------
function formNova({ base, daEquipe = false }) {
  const st = { tipo: 'usado', quem_paga: '', vendedor: null, achou: null, para: '', imoveis: [], imovel: undefined };
  const pre = MODELO2 ? IMD.pedidoDeEngenharia.imovel : null; if (MODELO2) IMD.pedidoDeEngenharia.imovel = null;
  const v = { doc: '', nome: '', responsavel: '', telefone: '', email: '', endereco: '', cidade: '', uf: '', matricula: '', cartorio: '', valor_desejado: '', acompanhante_tipo: '', comprador_id: '', acompanhante_nome: '', acompanhante_telefone: '', acompanhante_email: '' };
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const campo = (id, rotulo, chave, attrs = {}, fmt) => h('div', { class: 'campo' }, h('label', { for: id }, rotulo),
    h('input', { id, class: 'entrada', value: v[chave], autocomplete: 'off', ...attrs, oninput: (ev) => { if (fmt) ev.target.value = fmt(ev.target.value); v[chave] = ev.target.value; } }));
  const areaVend = h('div', { class: 'form-eng-grade' });
  const areaTipo = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const desenharTipo = () => {
    limpar(areaTipo);
    const pil = MODELO2 ? pilulasTipoM2(st, desenharTipo) : h('div', { class: 'pilulas' });
    if (!MODELO2) E.TIPOS_ENGENHARIA.forEach((t) => pil.appendChild(botaoOpcao(t.nome, st.tipo === t.codigo, () => { st.tipo = t.codigo; desenharTipo(); }, 'pilula')));
    const pag = h('div', { class: 'pilulas' });
    E.QUEM_PAGA.forEach(([c, r]) => pag.appendChild(botaoOpcao(r, st.quem_paga === c, () => { st.quem_paga = st.quem_paga === c ? '' : c; desenharTipo(); }, 'pilula')));
    adicionar(areaTipo,
      h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, MODELO2 ? 'Tipo de engenharia' : 'Tipo de imóvel'), pil),
      (() => {
        if (!(MODELO2 && st.imovel)) return h('div', { class: 'ajuda' }, `Documentos que você vai anexar: ${E.DOCS_POR_TIPO[st.tipo].map((c) => E.DOCS_ENGENHARIA[c]).join(', ')}.`);
        const lista = IMD.docsParaEngenharia(st.tipo, st.imovel.docs);
        const tem = lista.filter((x) => x.doc).map((x) => x.nome); const falta = lista.filter((x) => !x.doc).map((x) => x.nome);
        if (!falta.length) return h('div', { class: 'ajuda', 'data-docs-imovel': '1' }, h('b', null, `Todos os documentos já estão no cadastro do imóvel: ${tem.join(', ')}.`));
        return h('div', { class: 'ajuda', 'data-docs-imovel': '1' }, tem.length ? h('b', null, `Já estão no cadastro do imóvel: ${tem.join(', ')}. `) : null, `Você vai anexar: ${falta.join(', ')}.`);
      })(),
      h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, 'Quem vai pagar o boleto? (pode combinar depois)'), pag));
  };
  const desenharVend = () => {
    limpar(areaVend);
    const doc = R.soDigitos(v.doc);
    adicionar(areaVend, campo('eng-doc', 'CPF ou CNPJ do vendedor do imóvel', 'doc', { inputmode: 'numeric', placeholder: 'Quem é o dono do imóvel', 'aria-describedby': 'eng-doc-aj' },
      (x) => { const d = R.soDigitos(x); return d.length <= 11 ? R.formatarCpf(d) : R.formatarCnpj(d); }));
    areaVend.appendChild(h('div', { class: 'ajuda', id: 'eng-doc-aj' }, 'A engenharia é sempre em nome do vendedor, nunca do comprador.'));
    const contato = () => [campo('eng-vtel', 'Telefone / WhatsApp do vendedor', 'telefone', { inputmode: 'tel', placeholder: '(21) 99999-9999' }, R.formatarCelular),
      campo('eng-vmail', 'E-mail do vendedor', 'email', { inputmode: 'email', type: 'email', placeholder: 'nome@email.com' })];
    if (st.achou === true) {
      adicionar(areaVend, aviso('azul', h('strong', null, 'Vendedor encontrado: '), st.vendedor.nome, st.vendedor.responsavel_nome ? ` (${st.vendedor.responsavel_nome})` : ''));
      if (st.vendedor.telefone && st.vendedor.email) adicionar(areaVend, h('div', { class: 'ajuda' }, `Contato: ${R.formatarCelular(st.vendedor.telefone)} · ${st.vendedor.email}`));
      else adicionar(areaVend, h('div', { class: 'ajuda' }, 'Falta o contato deste vendedor. Informe o telefone e o e-mail.'), ...contato());
    }
    if (st.achou === false) adicionar(areaVend, h('div', { class: 'ajuda' }, 'Vendedor novo: informe os dados para cadastrar.'),
      campo('eng-vnome', doc.length === 11 ? 'Nome completo do vendedor' : 'Razão social do vendedor', 'nome'),
      campo('eng-vresp', 'Proprietário / responsável (nome da pessoa)', 'responsavel'), ...contato());
  };
  const selMun = h('select', { id: 'eng-cid', class: 'entrada', disabled: true, onchange: (ev) => { v.cidade = ev.target.value; } }, h('option', { value: '' }, 'Escolha a UF'));
  const selUf = h('select', { id: 'eng-uf', class: 'entrada', onchange: async (ev) => {
    v.uf = ev.target.value; v.cidade = '';
    limpar(selMun); selMun.disabled = true;
    selMun.appendChild(h('option', { value: '' }, v.uf ? 'Carregando…' : 'Escolha a UF'));
    if (!v.uf) return;
    let lista = []; try { lista = await api.municipios(v.uf); } catch { /* sem conexão */ }
    if (v.uf !== ev.target.value) return;
    limpar(selMun); selMun.appendChild(h('option', { value: '' }, 'Escolha o município'));
    lista.forEach((nome) => selMun.appendChild(h('option', { value: nome }, nome)));
    selMun.disabled = false;
  } }, h('option', { value: '' }, 'UF'), R.UFS.map((uf) => h('option', { value: uf }, uf)));
  let ultimo = '';
  const buscar = async () => {
    const doc = R.soDigitos(v.doc);
    const valido = doc.length === 11 ? R.cpfValido(doc) : doc.length === 14 ? R.cnpjValido(doc) : false;
    if (!valido || doc === ultimo) return;
    ultimo = doc;
    try { const a = await api.buscarVendedor(doc); st.achou = !!a; st.vendedor = a; desenharVend(); document.getElementById(a ? 'eng-doc' : 'eng-vnome')?.focus(); carregarImoveis(); } catch (e) { toast(e.message); }
  };
  const caixaDoc = h('div', { onkeyup: buscar, oninput: buscar }, areaVend);
  // Modelo 2: imóveis já cadastrados deste vendedor
  const areaEscolhaImovel = h('div');
  const gradeEndereco = h('div', { class: 'form-eng-grade' },
      h('div', { class: 'campo-largo' }, campo('eng-end', 'Endereço do imóvel', 'endereco', { placeholder: 'Rua, número, bairro' })),
      h('div', { style: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '12px' } },
        h('div', { class: 'campo' }, h('label', { for: 'eng-uf' }, 'UF'), selUf), h('div', { class: 'campo' }, h('label', { for: 'eng-cid' }, 'Município'), selMun)),
      campo('eng-mat', 'Matrícula (nº)', 'matricula'),
      h('div', { class: 'campo-largo' }, campo('eng-rgi', 'Cartório de registro (RGI)', 'cartorio', { placeholder: 'Ex.: Segundo Ofício RGI, Primeira Circunscrição de Itaboraí, RJ' })));
  const desenharImovel = () => {
    limpar(areaEscolhaImovel);
    const escolha = MODELO2 ? escolhaDeImovel(st.imoveis, st, () => { desenharImovel(); desenharTipo(); }) : null;
    if (escolha) areaEscolhaImovel.appendChild(escolha);
    gradeEndereco.style.display = MODELO2 && st.imovel ? 'none' : '';
    if (MODELO2 && st.imoveis.length && st.imovel === null) areaEscolhaImovel.appendChild(h('div', { class: 'ajuda' }, 'Cadastre o outro imóvel abaixo. Ele fica guardado no cadastro deste vendedor.'));
  };
  const carregarImoveis = async () => {
    st.imoveis = []; st.imovel = undefined;
    if (MODELO2 && st.achou && st.vendedor?.id) {
      try { st.imoveis = await api.listarImoveis({ vendedorId: st.vendedor.id }); } catch { st.imoveis = []; }
      if (pre?.id) { st.imovel = st.imoveis.find((i) => i.id === pre.id) || undefined; }
      if (!st.imoveis.length) st.imovel = null;
    } else st.imovel = null;
    desenharImovel(); desenharTipo();
  };
  const criar = h('button', { type: 'button', class: 'btn btn-primario' }, 'Criar solicitação');
  criar.onclick = async () => {
    erro.textContent = '';
    const doc = R.soDigitos(v.doc);
    if (st.achou === null) { erro.textContent = 'Informe um CPF ou CNPJ válido do vendedor.'; return; }
    if (st.achou === false && !v.nome.trim()) { erro.textContent = 'Informe o nome do vendedor.'; return; }
    const faltaContato = !(st.achou && st.vendedor.telefone && st.vendedor.email);
    if (faltaContato) {
      if (R.soDigitos(v.telefone).length < 10) { erro.textContent = 'Informe o telefone do vendedor com DDD.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) { erro.textContent = 'Informe um e-mail válido do vendedor.'; return; }
    }
    if (MODELO2 && st.imovel === undefined) { erro.textContent = 'Escolha o imóvel deste vendedor ou "Outro imóvel".'; return; }
    if (!(MODELO2 && st.imovel)) {
      if (!v.endereco.trim()) { erro.textContent = 'Informe o endereço do imóvel.'; return; }
      if (!v.uf || !v.cidade) { erro.textContent = 'Escolha a UF e o município do imóvel.'; return; }
    }
    const faltaAcomp = MODELO2 ? validarAcompanhamento(v) : null;
    if (faltaAcomp) { erro.textContent = faltaAcomp; return; }
    criar.disabled = true;
    try {
      const vendedorId = faltaContato || !st.achou ? await api.cadastrarVendedorBasico({ cpf_cnpj: doc, nome: v.nome, responsavel_nome: v.responsavel, telefone: v.telefone, email: v.email }) : st.vendedor.id;
      const id = await api.criarEngenharia({ ...(daEquipe ? { para_corretor_id: st.para || null } : {}), ...(MODELO2 ? dadosAcompanhamento(v) : {}), ...(MODELO2 && st.imovel ? { imovel_id: st.imovel.id } : {}), vendedor_id: vendedorId, tipo: st.tipo, imovel_endereco: v.endereco, imovel_cidade: v.cidade, imovel_uf: v.uf, matricula: v.matricula, cartorio_rgi: v.cartorio, quem_paga: st.quem_paga });
      toast(daEquipe && st.para ? 'Solicitação criada. Ela aparece no portal do corretor para ele anexar os documentos.' : 'Solicitação criada. Agora anexe os documentos.'); location.hash = `${base}/${id}`;
    } catch (e) { erro.textContent = e.message; criar.disabled = false; }
  };
  desenharVend(); desenharTipo();
  if (pre?.vendedor_doc) { const dd = R.soDigitos(pre.vendedor_doc); v.doc = dd.length <= 11 ? R.formatarCpf(dd) : R.formatarCnpj(dd); desenharVend(); setTimeout(buscar, 0); }
  // Modelo 2: quem acompanha a vistoria. Corretor = o responsável pela venda (quem pede, ou o corretor escolhido pela CCA)
  let eu = null; let corretores = [];
  const acomp = MODELO2 ? blocoAcompanhamento(v, campo, {
    vendedor: () => { const vend = st.achou ? st.vendedor : null; return { nome: vend ? (vend.responsavel_nome || vend.nome) : (v.responsavel || v.nome), telefone: vend?.telefone || v.telefone, email: vend?.email || v.email }; },
    corretor: () => { const c = daEquipe ? corretores.find((u) => u.id === st.para) : eu; return c ? { nome: c.nome, telefone: c.whatsapp || c.telefone, email: c.email_contato || c.email } : null; },
    compradores: async () => (await api.listarClientes()).filter((c) => !daEquipe || !st.para || c.corretor_id === st.para).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }) : null;
  if (acomp && !daEquipe) api.sessao().then((p) => { eu = p; acomp.redesenhar(); }).catch(() => {});
  if (acomp && daEquipe) api.listarCorretores().then((l) => { corretores = l; }).catch(() => {});
  // CCA (Modelo 2): pede em nome próprio (cliente direto) ou em nome de um corretor parceiro
  const blocoPara = daEquipe ? (() => {
    const sel = h('select', { id: 'eng-para', class: 'entrada', onchange: (ev) => { st.para = ev.target.value; if (acomp && ['corretor', 'comprador'].includes(v.acompanhante_tipo)) { v.acompanhante_tipo = ''; v.comprador_id = ''; } acomp?.redesenhar(); ajuda.textContent = st.para ? 'O corretor vê o pedido no portal dele e anexa os documentos e o comprovante.' : 'A CCA faz tudo: anexa os documentos, o boleto e o comprovante.'; } },
      h('option', { value: '' }, 'A própria CCA (cliente direto, sem corretor)'));
    const ajuda = h('div', { class: 'ajuda' }, 'A CCA faz tudo: anexa os documentos, o boleto e o comprovante.');
    api.listarCorretores().then((l) => l.filter((u) => u.ativo !== false && !u.consumidor).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .forEach((u) => sel.appendChild(h('option', { value: u.id }, `${u.nome} · ${u.imobiliaria_nome}`)))).catch(() => {});
    return [secaoTitulo('Para quem é o pedido', null, { pequeno: true, nivel: 'h3', icone: 'predio' }), h('div', { class: 'campo' }, h('label', { for: 'eng-para' }, 'Pedido em nome de'), sel), ajuda];
  })() : [];
  return h('section', { class: 'cartao form-eng', 'aria-label': 'Nova solicitação de engenharia' }, ...blocoPara,
    secaoTitulo('Vendedor do imóvel', null, { pequeno: true, nivel: 'h3', icone: 'pessoa' }), caixaDoc,
    secaoTitulo('Imóvel', null, { pequeno: true, nivel: 'h3', icone: 'casa' }),
    areaEscolhaImovel, gradeEndereco,
    areaTipo,
    ...(acomp ? acomp.elementos : []),
    erro, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, criar, h('a', { class: 'btn btn-contorno', href: base }, 'Cancelar')));
}

// ---------- Detalhe ----------
function faixaEtapas(e) {
  const idx = E.ETAPAS_ENGENHARIA.findIndex((x) => x.codigo === e.etapa);
  return h('ol', { class: 'eng-etapas', 'aria-label': 'Andamento da engenharia' }, E.ETAPAS_ENGENHARIA.map((x, i) =>
    h('li', { class: i < idx ? 'feito' : i === idx ? 'agora' : '', 'aria-current': i === idx ? 'step' : null }, h('i', { class: 'eng-bola' }, i < idx ? icone('check', { tam: 14, traco: 3 }) : String(i + 1)), h('span', null, x.nome))));
}

// Anexar: rótulo + campo de arquivo (abre a escolha do arquivo em qualquer navegador, inclusive celular)
const botaoArquivo = (rotulo, aoEnviar, op = {}) => botaoArquivoRotulo(rotulo, aoEnviar, op);

function secaoDocumentos(e, ctx) {
  const { daEquipe, recarregar } = ctx;
  const obrig = E.DOCS_POR_TIPO[e.tipo];
  const doTipo = (t) => e.docs.filter((d) => d.tipo === t);
  const podeEnviar = fazCorretor(e, ctx) && ['documentacao', 'em_analise'].includes(e.etapa);
  const linhas = obrig.map((cod) => {
    const d = doTipo(cod).slice(-1)[0];
    const nome = E.DOCS_ENGENHARIA[cod];
    const ehImg = d && /\.(jpe?g|png|webp|gif)$/i.test(d.nome_original || '');
    const botao = podeEnviar ? botaoArquivoRotulo(d ? 'Substituir' : 'Anexar', async (f) => { await api.enviarDocEngenharia(e.id, cod, f); toast(d ? 'Documento substituído.' : `${nome} anexado.`); recarregar(); }, { principal: !d, classe: 'empurra' }) : null;
    return h('div', { class: 'doc' },
      h('div', { class: 'doc-icone t-azul' }, icone(cod === 'MATRICULA' ? 'casa' : 'doc', { tam: 26, traco: 1.8 })),
      h('div', { class: 'doc-corpo' },
        h('div', null, h('div', { class: 'doc-nome' }, nome),
          h('div', { class: 'doc-linha' }, d ? h('span', { class: 'chip chip-em_conferencia' }, 'Enviado') : h('span', { class: `chip chip-pendente` }, 'Pendente'),
            h('span', { class: d ? '' : 'forte' }, d ? d.nome_original : 'Obrigatório para pedir a engenharia'),
            d?.do_imovel ? h('span', { class: 'chip chip-aceito', title: 'Este documento está no cadastro do imóvel e vale para as outras engenharias e vendas dele' }, 'Do cadastro do imóvel') : null)),
        h('div', { class: 'doc-acoes' },
          d ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${nome}`, onclick: () => abrir(d) }, icone('olho')) : null,
          d ? h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Baixar ${nome}`, onclick: () => abrir(d, true) }, icone('baixar')) : null,
          botao)));
  });
  const faltam = E.docsFaltando(e.tipo, e.docs);
  const jaEnviado = e.etapa === 'em_analise';
  const enviar = fazCorretor(e, ctx) && ['documentacao', 'em_analise'].includes(e.etapa) ? h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
    (() => { const b = h('button', { type: 'button', class: 'btn btn-primario', disabled: faltam.length > 0 }, daEquipe ? (jaEnviado ? 'Atualizar documentos' : 'Documentos completos: seguir') : 'Enviar para a CCA');
      b.onclick = async () => {
        b.disabled = true;
        try {
          if (jaEnviado) { await api.reenviarEngenharia(e.id); toast(daEquipe ? 'Documentos atualizados.' : 'A CCA foi avisada dos documentos.'); } else { await api.enviarEngenharia(e.id); toast(daEquipe ? 'Pronto. Agora cadastre a engenharia no SIOPI e anexe o boleto.' : 'Enviado. A CCA vai cadastrar a engenharia na Caixa.'); }
          recarregar();
        } catch (er) { toast(er.message); b.disabled = false; }
      }; return b; })(),
    faltam.length ? h('span', { class: 'ajuda' }, `Faltam ${faltam.length}: ${faltam.map((c) => E.DOCS_ENGENHARIA[c]).join(', ')}.`)
      : h('span', { class: 'ajuda' }, jaEnviado ? 'Anexou algo novo? Toque para avisar a CCA.' : 'Tudo anexado.')) : null;
  const faltaDepois = fazCorretor(e, ctx) && e.etapa === 'em_analise' && faltam.length ? aviso('laranja', h('strong', null, 'Faltam documentos: '), `${faltam.map((c) => E.DOCS_ENGENHARIA[c]).join(', ')}. Anexe abaixo para a CCA seguir com o pedido.`) : null;
  return h('section', { class: 'cartao', style: { gap: '12px' } },
    secaoTitulo('Documentos para Solicitar Engenharia', `Lista da Caixa para: ${E.nomeTipoEngenharia(e.tipo)}.`, { pequeno: true, nivel: 'h3', icone: 'doc' }),
    MODELO2 && e.imovel_id ? h('div', { class: 'ajuda' }, 'Os documentos ficam no cadastro do imóvel: enviados uma vez, valem para as próximas engenharias e para as vendas. ', h('a', { href: `${ctx.daEquipe ? '#/painel/imoveis' : '#/imoveis'}/${e.imovel_id}`, 'data-ver-imovel': '1' }, 'Ver o cadastro do imóvel')) : null,
    faltaDepois, h('div', { class: 'cartao-lista' }, linhas), enviar);
}

function secaoBoletoEPagamento(e, ctx) {
  const { daEquipe, recarregar } = ctx;
  const boleto = e.docs.filter((d) => d.tipo === 'BOLETO').slice(-1)[0];
  const comp = e.docs.filter((d) => d.tipo === 'COMPROVANTE').slice(-1)[0];
  if (e.etapa === 'documentacao') return null;
  const quem = E.QUEM_PAGA.find(([c]) => c === e.quem_paga)?.[1];
  const itens = [secaoTitulo('Boleto e pagamento', quem ? `Quem paga: ${quem}.` : 'Quem paga: combinar entre as partes.', { pequeno: true, nivel: 'h3', icone: 'cifrao' })];
  if (!boleto) {
    itens.push(daEquipe ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { class: 'ajuda' }, 'Depois de cadastrar no SIOPI, anexe o boleto. O corretor é avisado.'),
      h('div', null, botaoArquivo('Anexar boleto', async (f) => { await api.enviarDocEngenharia(e.id, 'BOLETO', f); await api.engenhariaAvancar(e.id, { etapa: 'boleto' }); toast('Boleto anexado. O corretor foi avisado.'); recarregar(); }, { principal: true })))
      : h('div', { class: 'ajuda' }, 'A CCA está cadastrando a engenharia na Caixa. Quando o boleto sair, ele aparece aqui.'));
  } else {
    itens.push(h('div', { class: 'eng-doc' }, h('span', { class: 'eng-doc-ic ok' }, icone('check', { tam: 18, traco: 2.4 })), h('span', { class: 'eng-doc-nome' }, 'Boleto da engenharia'),
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => abrir(boleto) }, icone('olho', { tam: 16 }), ' Abrir')));
    if (comp) itens.push(h('div', { class: 'eng-doc' }, h('span', { class: 'eng-doc-ic ok' }, icone('check', { tam: 18, traco: 2.4 })), h('span', { class: 'eng-doc-nome' }, 'Comprovante de pagamento', h('span', { class: 'sub' }, ` · ${comp.nome_original}`)),
      h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Visualizar comprovante', onclick: () => abrir(comp) }, icone('olho', { tam: 18 }))));
    else if (fazCorretor(e, ctx) && e.etapa === 'boleto') itens.push(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', { class: 'ajuda' }, 'Pague o boleto e anexe o comprovante. Normalmente a OS chega no dia seguinte.'),
      h('div', null, botaoArquivo('Anexar comprovante de pagamento', async (f) => { await api.enviarDocEngenharia(e.id, 'COMPROVANTE', f); await api.engenhariaInformarPagamento(e.id); toast('Pagamento informado. A CCA vai acompanhar a OS.'); recarregar(); }, { principal: true }))));
    else if (daEquipe && !e.pela_cca && e.etapa === 'boleto') itens.push(h('div', { class: 'ajuda' }, 'Aguardando o corretor anexar o comprovante de pagamento.'));
  }
  return h('section', { class: 'cartao', style: { gap: '12px' } }, ...itens);
}

function secaoOS(e, ctx) {
  const { daEquipe, recarregar } = ctx;
  if (!['pago', 'os_recebida', 'laudo'].includes(e.etapa) && !e.os_numero) return null;
  const itens = [secaoTitulo('Ordem de serviço (OS)', null, { pequeno: true, nivel: 'h3', icone: 'andamento' })];
  if (e.os_numero) itens.push(h('div', null, h('b', null, `OS ${e.os_numero}`), e.os_data ? h('span', { class: 'sub' }, ` · recebida em ${E.dataBR(e.os_data)}`) : null));
  else if (daEquipe) {
    const num = h('input', { class: 'entrada', id: 'os-num', placeholder: 'Ex.: 7891.3307.000927006/2026.01.01', 'aria-label': 'Número da OS' });
    const dt = h('input', { class: 'entrada', id: 'os-data', type: 'date', 'aria-label': 'Data em que a OS chegou', value: new Date().toISOString().slice(0, 10) });
    const bt = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Registrar OS');
    bt.onclick = async () => { if (!num.value.trim()) { toast('Informe o número da OS.'); return; } bt.disabled = true; try { await api.engenhariaAvancar(e.id, { etapa: 'os_recebida', os_numero: num.value, os_data: dt.value }); toast('OS registrada.'); recarregar(); } catch (er) { toast(er.message); bt.disabled = false; } };
    itens.push(h('div', { class: 'campo' }, h('label', { for: 'os-num' }, 'Número da OS (vem no e-mail da Caixa)'), num), h('div', { class: 'campo' }, h('label', { for: 'os-data' }, 'Data'), dt), h('div', null, bt));
  } else itens.push(h('div', { class: 'ajuda' }, 'Ainda não chegou. Normalmente chega no dia seguinte ao pagamento.'));
  return h('section', { class: 'cartao', style: { gap: '12px' } }, ...itens);
}

function formLaudo(e, { recarregar }) {
  const st = { aprovado: true };
  const valor = h('input', { class: 'entrada', id: 'lau-valor', inputmode: 'numeric', placeholder: 'R$ 0,00', 'aria-label': 'Valor de avaliação', oninput: mascaraMoeda });
  const data = h('input', { class: 'entrada', id: 'lau-data', type: 'date', 'aria-label': 'Data da avaliação' });
  const motivos = h('textarea', { class: 'entrada', id: 'lau-pept', rows: 4, placeholder: 'Um motivo por linha, como veio na PEPT', 'aria-label': 'Motivos da reprovação (PEPT)' });
  const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const pil = h('div', { class: 'pilulas' });
  const desenhar = () => {
    limpar(pil); [[true, 'Aprovado'], [false, 'Reprovado']].forEach(([v, r]) => pil.appendChild(botaoOpcao(r, st.aprovado === v, () => { st.aprovado = v; desenhar(); }, 'pilula')));
    limpar(area);
    if (st.aprovado) adicionar(area, h('div', { class: 'campo' }, h('label', { for: 'lau-valor' }, 'Valor de avaliação (R$)'), valor), h('div', { class: 'campo' }, h('label', { for: 'lau-data' }, 'Data da avaliação'), data),
      h('div', { class: 'ajuda' }, 'A validade é calculada sozinha: 180 dias depois da data da avaliação.'));
    else adicionar(area, h('div', { class: 'campo' }, h('label', { for: 'lau-pept' }, 'Motivos da reprovação (PEPT)'), motivos));
  };
  desenhar();
  const bt = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar resultado');
  bt.onclick = async () => {
    erro.textContent = '';
    const v = R.lerMoeda(valor.value) ?? NaN;
    if (st.aprovado && (!v || !data.value)) { erro.textContent = 'Informe o valor e a data da avaliação.'; return; }
    const lista = motivos.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!st.aprovado && !lista.length) { erro.textContent = 'Informe pelo menos um motivo (PEPT).'; return; }
    bt.disabled = true;
    try { await api.engenhariaLancarLaudo(e.id, { aprovado: st.aprovado, valor: v, data: data.value, motivos: lista }); toast('Resultado salvo. O corretor foi avisado.'); recarregar(); }
    catch (er) { erro.textContent = er.message; bt.disabled = false; }
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { class: 'ajuda' }, 'O laudo é confidencial da Caixa e não é anexado: lance só o resultado.'), pil, area, erro, h('div', null, bt));
}

function secaoResultado(e, ctx) {
  const { daEquipe, recarregar } = ctx;
  if (!['os_recebida', 'laudo'].includes(e.etapa)) return null;
  const itens = [secaoTitulo('Resultado da vistoria', null, { pequeno: true, nivel: 'h3', icone: 'escudo' })];
  if (e.etapa === 'os_recebida') itens.push(daEquipe ? formLaudo(e, ctx) : h('div', { class: 'ajuda' }, 'A OS foi recebida. Quando o vistoriador da Caixa liberar o laudo, a CCA lança o resultado aqui.'));
  else if (e.laudo_aprovado) {
    const v = validadeTexto(e);
    itens.push(h('div', { class: 'eng-resultado ok' }, icone('check', { tam: 22, traco: 2.6 }), h('div', null, h('div', { class: 'eng-res-titulo' }, 'Laudo aprovado'),
      h('div', null, 'Valor de avaliação: ', h('b', null, E.moeda(e.avaliacao_valor))), h('div', null, 'Data da avaliação: ', h('b', null, E.dataBR(e.avaliacao_data))),
      h('div', null, 'Válida até: ', h('b', null, E.dataBR(v.v)), ` (${v.texto})`))));
    if (v.dias < 0) itens.push(aviso('laranja', 'A validade da engenharia venceu. Será preciso pedir uma nova.'));
    else if (v.dias <= 30) itens.push(aviso('laranja', `A validade vence em ${v.dias} dia${v.dias === 1 ? '' : 's'}.`));
    if (e.contestacao) itens.push(aviso('azul', h('strong', null, e.contestacao === 'reavaliacao' ? 'Reavaliação pedida. ' : 'Segunda instância pedida. '),
      e.contestacao === 'reavaliacao' ? `${E.linksDeAnuncios(e.links_anuncios).length} links de anúncios parecidos enviados.` : 'A CCA vai encaminhar para a segunda instância da engenharia.',
      daEquipe && e.contestacao === 'reavaliacao' ? h('div', { class: 'eng-links' }, E.linksDeAnuncios(e.links_anuncios).map((l) => h('a', { href: l, target: '_blank', rel: 'noopener' }, l))) : null));
    else if (fazCorretor(e, ctx)) itens.push(formContestar(e, ctx));
    if (daEquipe) itens.push(h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: '700', fontSize: '14px', minHeight: '32px' } }, 'Lançar novo resultado (depois de reavaliação)'), formLaudo(e, ctx)));
  } else {
    itens.push(h('div', { class: 'eng-resultado nao' }, icone('alerta', { tam: 22, traco: 2.4 }), h('div', null, h('div', { class: 'eng-res-titulo' }, 'Laudo reprovado: pendências (PEPT)'),
      h('div', { class: 'ajuda' }, daEquipe ? 'Corretor anexa o que falta; você envia ao engenheiro e marca como resolvida.' : 'Anexe os documentos que faltam. A CCA envia ao engenheiro, que reavalia.'))));
    e.pepts.forEach((p) => {
      const anexos = e.docs.filter((d) => d.pept_id === p.id);
      itens.push(h('div', { class: `eng-pept${p.resolvida_em ? ' resolvida' : ''}` },
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' } },
          h('div', null, h('b', null, p.motivo), h('div', { class: 'sub' }, `Registrada em ${new Date(p.registrada_em).toLocaleDateString('pt-BR')}${p.resolvida_em ? ' · enviada ao engenheiro' : ''}`)),
          p.resolvida_em ? h('span', { class: 'chip chip-aceito' }, 'Resolvida') : h('span', { class: 'chip chip-alerta' }, 'Pendente')),
        ...anexos.map((d) => h('div', { class: 'eng-doc' }, h('span', { class: 'eng-doc-ic ok' }, icone('clipe', { tam: 16, traco: 2.2 })), h('span', { class: 'eng-doc-nome' }, d.nome_original),
          h('button', { type: 'button', class: 'btn-icone', 'aria-label': `Visualizar ${d.nome_original}`, onclick: () => abrir(d) }, icone('olho', { tam: 18 })))),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          fazCorretor(e, ctx) && !p.resolvida_em ? botaoArquivo('Anexar documento', async (f) => { await api.enviarDocEngenharia(e.id, 'PEPT_DOC', f, p.id); toast('Documento anexado.'); recarregar(); }) : null,
          daEquipe ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await api.engenhariaResolverPept(p.id, !p.resolvida_em); recarregar(); } catch (er) { toast(er.message); } } }, p.resolvida_em ? 'Reabrir' : 'Marcar como resolvida (enviada ao engenheiro)') : null)));
    });
    if (daEquipe) itens.push(h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: '700', fontSize: '14px', minHeight: '32px' } }, 'Lançar novo resultado da reavaliação'), formLaudo(e, ctx)));
  }
  return h('section', { class: 'cartao', style: { gap: '12px' } }, ...itens);
}

function formContestar(e, { recarregar }) {
  const st = { tipo: '' };
  const links = h('textarea', { class: 'entrada', id: 'cont-links', rows: 5, placeholder: 'Cole de 5 a 10 links de anúncios de imóveis parecidos, um por linha', 'aria-label': 'Links de anúncios' });
  const area = h('div'); const erro = h('div', { class: 'erro-campo', role: 'alert' }); const pil = h('div', { class: 'pilulas' });
  let desenhar = () => {
    limpar(pil); [['reavaliacao', 'Pedir reavaliação'], ['segunda_instancia', 'Pedir segunda instância']].forEach(([v, r]) => pil.appendChild(botaoOpcao(r, st.tipo === v, () => { st.tipo = v; desenhar(); }, 'pilula')));
    limpar(area);
    if (st.tipo === 'reavaliacao') adicionar(area, h('div', { class: 'ajuda' }, 'A reavaliação usa um formulário específico e pede de 5 a 10 links de anúncios de imóveis parecidos com o seu.'), links);
    if (st.tipo === 'segunda_instancia') adicionar(area, h('div', { class: 'ajuda' }, 'Último recurso: a CCA encaminha para a segunda instância da engenharia.'));
  };
  const bt = h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno' }, 'Enviar pedido');
  const desenharBase = desenhar;
  desenhar = () => { desenharBase(); bt.style.display = st.tipo ? '' : 'none'; };
  desenhar();
  bt.onclick = async () => {
    erro.textContent = '';
    const ls = E.linksDeAnuncios(links.value); const r = E.contestacaoValida(st.tipo, ls);
    if (!r.ok) { erro.textContent = r.erro; return; }
    bt.disabled = true;
    try { await api.engenhariaContestar(e.id, { tipo: st.tipo, links: [...new Set(ls)].join('\n') }); toast('Pedido enviado à CCA.'); recarregar(); } catch (er) { erro.textContent = er.message; bt.disabled = false; }
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #EFECE6', paddingTop: '12px' } },
    h('b', null, 'Não concorda com o valor?'), pil, area, erro, h('div', null, bt));
}


function cartaoDados(e, ctx) {
  const v = e.vendedor;
  const podeEditar = ctx.daEquipe || ['documentacao', 'em_analise', 'boleto'].includes(e.etapa);
  const caixa = h('div');
  const ver = () => {
    limpar(caixa);
    const cabCartao = h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      secaoTitulo('Imóvel e vendedor', null, { pequeno: true, nivel: 'h3', icone: 'casa' }),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        podeEditar ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: editar }, icone('lapis', { tam: 16, traco: 2.2 }), ' Editar dados') : null,
        podeExcluir(e, ctx.daEquipe) ? h('button', { type: 'button', class: 'btn btn-perigo btn-pequeno', onclick: () => excluirPedido(e, () => { location.hash = ctx.base; }) }, icone('lixeira', { tam: 16, traco: 2.2 }), ' Excluir pedido') : null));
    adicionar(caixa, cabCartao,
      h('div', null, h('b', null, 'Vendedor: '), v ? `${v.nome} · ${v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)}` : '—', v?.responsavel_nome ? h('span', { class: 'sub' }, ` · responsável ${v.responsavel_nome}`) : null),
      h('div', null, h('b', null, 'Telefone: '), v?.telefone ? R.formatarCelular(v.telefone) : '—', h('span', null, '  '), h('b', null, 'E-mail: '), v?.email ? h('a', { href: `mailto:${v.email}` }, v.email) : '—'),
      h('div', null, h('b', null, 'Endereço: '), enderecoCurto(e)),
      MODELO2 && e.valor_desejado ? h('div', null, h('b', null, 'Valor desejado: '), E.moeda(e.valor_desejado)) : null,
      MODELO2 && e.acompanhante_nome ? h('div', { 'data-acompanhante': '1' }, h('b', null, 'Acompanha a vistoria: '), e.acompanhante_nome, e.acompanhante_tipo ? ` · ${QUEM_ACOMPANHA.find(([c]) => c === e.acompanhante_tipo)?.[1] || ''}` : '',
        e.acompanhante_telefone ? ` · ${R.formatarCelular(e.acompanhante_telefone)}` : '', e.acompanhante_email ? [' · ', h('a', { href: `mailto:${e.acompanhante_email}` }, e.acompanhante_email)] : '') : null,
      MODELO2 && !e.acompanhante_nome ? h('div', { class: 'ajuda' }, 'Falta informar quem acompanha a vistoria. Toque em Editar dados.') : null,
      e.matricula ? h('div', null, h('b', null, 'Matrícula: '), e.matricula, e.cartorio_rgi ? ` · ${e.cartorio_rgi}` : '') : null,
      ctx.daEquipe ? h('div', null, h('b', null, 'Serviço no SIOPI: '), e.codigo_servico) : null,
      ctx.daEquipe ? (MODELO2 ? h('div', { 'data-solicitante': '1' }, h('b', null, `Solicitação feita ${quemSolicitou(e).split(': ')[0]}: `), quemSolicitou(e).split(': ').slice(1).join(': '), e.imobiliaria_nome ? ` · ${e.imobiliaria_nome}` : e.pela_cca ? '' : ' · Autônomo')
        : h('div', null, h('b', null, 'Pedido por: '), nomePessoa(e), e.imobiliaria_nome ? ` · ${e.imobiliaria_nome}` : e.pela_cca ? '' : ' · Autônomo')) : null);
  };
  const editar = () => {
    limpar(caixa);
    const d = { tipo: e.tipo, imovel_endereco: e.imovel_endereco || '', imovel_uf: e.imovel_uf || '', imovel_cidade: e.imovel_cidade || '', matricula: e.matricula || '', cartorio_rgi: e.cartorio_rgi || '',
      quem_paga: e.quem_paga || '', valor_desejado: moedaCampo(e.valor_desejado), acompanhante_tipo: e.acompanhante_tipo || (e.acompanhante_nome ? 'outro' : ''), comprador_id: e.acompanhante_cliente_id || (e.acompanhante_tipo === 'comprador' ? 'novo' : ''), acompanhante_nome: e.acompanhante_nome || '', acompanhante_telefone: e.acompanhante_telefone ? R.formatarCelular(e.acompanhante_telefone) : '', acompanhante_email: e.acompanhante_email || '', vnome: v?.nome || '', vdoc: v ? (v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)) : '', vresp: v?.responsavel_nome || '', telefone: v?.telefone ? R.formatarCelular(v.telefone) : '', email: v?.email || '' };
    const erro = h('div', { class: 'erro-campo', role: 'alert' });
    const campo = (id, rotulo, chave, attrs = {}, fmt) => h('div', { class: 'campo' }, h('label', { for: id }, rotulo),
      h('input', { id, class: 'entrada', value: d[chave], autocomplete: 'off', ...attrs, oninput: (ev) => { if (fmt) ev.target.value = fmt(ev.target.value); d[chave] = ev.target.value; } }));
    const selMun = h('select', { id: 'ed-cid', class: 'entrada', onchange: (ev) => { d.imovel_cidade = ev.target.value; } });
    const carregar = async (uf, manter) => {
      limpar(selMun); selMun.disabled = true; selMun.appendChild(h('option', { value: '' }, uf ? 'Carregando…' : 'Escolha a UF'));
      if (!uf) return;
      let lista = []; try { lista = await api.municipios(uf); } catch { /* sem conexão */ }
      if (manter && !lista.includes(manter)) lista = [manter, ...lista];
      limpar(selMun); selMun.appendChild(h('option', { value: '' }, 'Escolha o município'));
      lista.forEach((n) => selMun.appendChild(h('option', { value: n, selected: n === manter }, n))); selMun.disabled = false;
    };
    const selUf = h('select', { id: 'ed-uf', class: 'entrada', onchange: (ev) => { d.imovel_uf = ev.target.value; d.imovel_cidade = ''; carregar(d.imovel_uf, ''); } },
      h('option', { value: '' }, 'UF'), R.UFS.map((u) => h('option', { value: u, selected: u === d.imovel_uf }, u)));
    carregar(d.imovel_uf, d.imovel_cidade);
    const tipoMuda = true;
    const areaTipo = h('div', { class: 'pilulas' });
    const pagar = h('div', { class: 'pilulas' });
    const desenhar = () => {
      limpar(areaTipo); limpar(pagar);
      if (MODELO2) areaTipo.appendChild(pilulasTipoM2(d, desenhar));
      else E.TIPOS_ENGENHARIA.forEach((t) => { if (tipoMuda || t.codigo === d.tipo) areaTipo.appendChild(botaoOpcao(t.nome, d.tipo === t.codigo, () => { d.tipo = t.codigo; desenhar(); }, 'pilula')); });
      E.QUEM_PAGA.forEach(([c, r]) => pagar.appendChild(botaoOpcao(r, d.quem_paga === c, () => { d.quem_paga = d.quem_paga === c ? '' : c; desenhar(); }, 'pilula')));
    };
    desenhar();
    const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar alterações');
    salvar.onclick = async () => {
      erro.textContent = '';
      if (!d.imovel_endereco.trim()) { erro.textContent = 'Informe o endereço do imóvel.'; return; }
      if (!d.imovel_uf || !d.imovel_cidade) { erro.textContent = 'Escolha a UF e o município.'; return; }
      if (d.telefone && R.soDigitos(d.telefone).length < 10) { erro.textContent = 'Telefone do vendedor com DDD.'; return; }
      if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) { erro.textContent = 'E-mail do vendedor inválido.'; return; }
      const faltaAcomp = MODELO2 ? validarAcompanhamento(d) : null;
      if (faltaAcomp) { erro.textContent = faltaAcomp; return; }
      if (MODELO2) Object.assign(d, dadosAcompanhamento(d));
      salvar.disabled = true;
      try { if (ctx.daEquipe && v) await api.equipeEditarVendedor(v.id, { nome: d.vnome, cpf_cnpj: d.vdoc, responsavel_nome: d.vresp }); await api.editarEngenharia(e.id, d); toast('Dados atualizados.'); ctx.recarregar(); } catch (er) { erro.textContent = er.message; salvar.disabled = false; }
    };
    adicionar(caixa, secaoTitulo('Editar dados do pedido', ctx.daEquipe ? 'Como equipe da CCA, você também corrige o nome e o CPF/CNPJ do vendedor.' : `Vendedor: ${v?.nome || '—'} (CPF/CNPJ e nome só a CCA altera).`, { pequeno: true, nivel: 'h3', icone: 'casa' }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' } },
        ...(ctx.daEquipe ? [campo('ed-vnome', 'Nome do vendedor / razão social', 'vnome'), campo('ed-vdoc', 'CPF ou CNPJ do vendedor', 'vdoc', { inputmode: 'numeric' }, (x) => { const g = R.soDigitos(x); return g.length <= 11 ? R.formatarCpf(g) : R.formatarCnpj(g); }), campo('ed-vresp', 'Proprietário / responsável', 'vresp')] : []),
        campo('ed-tel', 'Telefone / WhatsApp do vendedor', 'telefone', { inputmode: 'tel' }, R.formatarCelular), campo('ed-mail', 'E-mail do vendedor', 'email', { inputmode: 'email', type: 'email' }),
        campo('ed-end', 'Endereço do imóvel', 'imovel_endereco'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '12px' } }, h('div', { class: 'campo' }, h('label', { for: 'ed-uf' }, 'UF'), selUf), h('div', { class: 'campo' }, h('label', { for: 'ed-cid' }, 'Município'), selMun)),
        campo('ed-mat', 'Matrícula (nº)', 'matricula'), campo('ed-rgi', 'Cartório de registro (RGI)', 'cartorio_rgi', { placeholder: 'Ex.: Segundo Ofício RGI, Primeira Circunscrição de Itaboraí, RJ' }),
        ...(MODELO2 ? blocoAcompanhamento(d, campo, {
          vendedor: () => (v ? { nome: v.responsavel_nome || v.nome, telefone: v.telefone, email: v.email } : null),
          corretor: () => (e.pela_cca ? null : { nome: e.criado_por_nome, telefone: e.criado_por_telefone, email: e.criado_por_email }),
          compradores: async () => (await api.listarClientes()).filter((c) => e.pela_cca || c.corretor_id === e.criado_por).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        }).elementos : []),
        h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, MODELO2 ? 'Tipo de engenharia' : 'Tipo de imóvel'), areaTipo, e.etapa === 'documentacao' ? null : h('div', { class: 'ajuda' }, 'Se mudar o tipo, a lista de documentos muda. Anexe os que passarem a ser exigidos e envie de novo para a CCA.')),
        h('div', { class: 'campo' }, h('span', { style: { fontWeight: '600', fontSize: '15px' } }, 'Quem vai pagar o boleto?'), pagar),
        erro, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, salvar, h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: ver }, 'Cancelar'))));
  };
  ver();
  return h('section', { class: 'cartao', style: { gap: '6px' } }, caixa);
}

function detalhe(e, ctx) {
  const v = e.vendedor;
  return [
    h('a', { class: 'voltar-link', href: ctx.base }, icone('voltar', { tam: 20, traco: 2.4 }), 'Engenharia'),
    cabecalho({ sobre: ctx.daEquipe ? 'Painel da equipe' : 'Portal do corretor', titulo: v?.nome || 'Engenharia', sub: `${E.nomeTipoEngenharia(e.tipo)} · ${enderecoCurto(e)}`, foto: ctx.daEquipe ? undefined : 'corretor' }, chipEtapa(e)),
    faixaEtapas(e),
    ctx.daEquipe && e.docs_novos ? aviso('laranja', h('strong', null, 'Documentos novos: '), `${nomePessoa(e)} anexou documentos depois do envio. Confira a lista abaixo.`) : null,
    cartaoDados(e, ctx),
    secaoDocumentos(e, ctx), secaoBoletoEPagamento(e, ctx), secaoOS(e, ctx), secaoResultado(e, ctx),
  ].filter(Boolean);
}

// Ponto de entrada: devolve a tela (lista, nova solicitação ou detalhe)
export async function conteudoEngenharia({ daEquipe, id, recarregar }) {
  const base = daEquipe ? '#/painel/engenharia' : '#/engenharia';
  if (id === 'nova' && !daEquipe) return [h('a', { class: 'voltar-link', href: base }, icone('voltar', { tam: 20, traco: 2.4 }), 'Engenharia'),
    cabecalho({ sobre: 'Portal do corretor', titulo: 'Nova engenharia', sub: 'Peça a avaliação de um imóvel. Sempre em nome do vendedor.', foto: 'corretor' }), formNova({ base })];
  if (id === 'nova' && daEquipe && MODELO2) return [h('a', { class: 'voltar-link', href: base }, icone('voltar', { tam: 20, traco: 2.4 }), 'Engenharia'),
    cabecalho({ sobre: 'Painel da equipe', titulo: 'Nova engenharia', sub: 'A CCA também pede engenharia: para um cliente direto ou em nome de um corretor parceiro. Sempre em nome do vendedor.' }), formNova({ base, daEquipe: true })];
  const lista = await api.listarEngenharias();
  if (id) {
    const e = lista.find((x) => x.id === id);
    if (!e) return [h('a', { class: 'voltar-link', href: base }, icone('voltar', { tam: 20, traco: 2.4 }), 'Engenharia'), h('div', { class: 'cartao' }, 'Solicitação não encontrada.')];
    const tela = detalhe(e, { daEquipe, recarregar, base });
    if (daEquipe && e.docs_novos) api.verEngenharia(e.id).catch(() => {});
    return tela;
  }
  const abertas = lista.filter((e) => !(e.etapa === 'laudo' && e.laudo_aprovado && !e.contestacao));
  const nova = !daEquipe || MODELO2 ? h('a', { class: 'btn btn-primario btn-pequeno', id: 'novaEngenharia', href: `${base}/nova` }, icone('mais', { tam: 18, traco: 2.4 }), 'Nova solicitação') : null;
  const sub = daEquipe ? 'Avaliações de imóveis pedidas por corretores e imobiliárias. A engenharia é sempre em nome do vendedor.' : 'Peça a avaliação do imóvel antes de ter um comprador, para saber o valor e definir a estratégia de venda.';
  return [cabecalho(daEquipe ? { sobre: 'Painel da equipe', titulo: 'Engenharia', sub } : { sobre: 'Portal do corretor', titulo: 'Engenharia', sub, foto: 'corretor' }, nova),
    secaoTitulo('Solicitações', `${lista.length} no total${abertas.length !== lista.length ? `, ${abertas.length} em andamento` : ''}.`),
    listaEngenharias(lista, { daEquipe, base, recarregar })];
}
