// MO / DAMP (Modelo 2): o kit de declarações da Caixa de cada cliente. Regras puras (sem tela).
// Cada modelo tem uma regra (quando vale), quem assina e se é obrigatório (barreira para a Conformidade).
import { textoCaixa } from './mo-pdf.js';

// Modelos oficiais da Caixa já cadastrados (os mesmos que o banco recebe na instalação)
export const MODELOS_PADRAO = [
  { id: 'mo-30844', codigo: 'MO30844', nome: 'Autorização da forma de pagamento, tarifa de avaliação e declarações (SCR)', tipo: 'MO', regra: [], manual: false, assina: 'compradores', obrigatorio: true, oficial: 'MO30844', ordem: 10, ativo: true },
  { id: 'mo-30825', codigo: 'MO30825', nome: 'Proposta de Seguro Habitacional (MIP e DFI)', tipo: 'MO', regra: [], manual: false, assina: 'compradores', obrigatorio: true, oficial: 'MO30825', ordem: 20, ativo: true },
  { id: 'damp-29300', codigo: 'DAMP 29300', nome: 'Declaração de enquadramento e autorização de uso do FGTS (DAMP offline)', tipo: 'DAMP',
    regra: [{ usa_fgts: true }, { programa: 'MCMV' }, { programa: 'Pró-Cotista' }], manual: false, assina: 'cada_comprador', obrigatorio: true, oficial: 'DAMP29300', ordem: 30, ativo: true },
  { id: 'mo-30693', codigo: 'MO30693', nome: 'Autorização ou cancelamento do débito dos encargos e da tarifa de avaliação', tipo: 'MO', regra: [], manual: true, assina: 'compradores', obrigatorio: true, oficial: 'MO30693', ordem: 40, ativo: true },
  { id: 'mo-30679', codigo: 'MO30679', nome: 'Solicitação de consulta pelo CCA e ateste da inviabilidade da renda pelo FGTS', tipo: 'MO', regra: [], manual: true, assina: 'cca', obrigatorio: false, oficial: 'MO30679', ordem: 50, ativo: true },
];

// Condições que o ADM pode marcar (vale se QUALQUER uma bater). Nenhuma marcada = sempre.
export const OPCOES_REGRA = [
  ['usa_fgts', true, 'O cliente usa o FGTS'],
  ['programa', 'MCMV', 'Linha MCMV'],
  ['programa', 'Pró-Cotista', 'Linha Pró-Cotista'],
  ['programa', 'SBPE', 'Linha SBPE'],
];
export const ASSINA = [['compradores', 'Compradores (um só)'], ['cada_comprador', 'Cada comprador'], ['cca', 'A CCA']];

export const regraOk = (cliente, regra = []) => !regra?.length
  || regra.some((alt) => alt && typeof alt === 'object' && Object.entries(alt).every(([k, v]) => (cliente?.[k] ?? null) === v));

export function descreverRegra(m) {
  if (m.manual) return 'Só quando a CCA incluir';
  if (!m.regra?.length) return 'Sempre';
  const nomes = m.regra.map((alt) => {
    const op = OPCOES_REGRA.find(([k, v]) => Object.keys(alt).length === 1 && alt[k] === v);
    return op ? op[2].replace('O cliente usa', 'usa') : Object.entries(alt).map(([k, v]) => `${k} = ${v}`).join(' e ');
  });
  return `Quando: ${nomes.join(', ou ')}`;
}
export const descreverAssina = (m) => (ASSINA.find(([k]) => k === m.assina) || ASSINA[0])[1];

// Pessoas que assinam: o titular (1) e os outros compradores do cadastro (2 a 4)
export const pessoasDoCaso = (cliente, participantes = []) => [{ ordem: 1, nome: cliente.nome, cpf: cliente.cpf },
  ...[...participantes].sort((a, b) => a.ordem - b.ordem).map((p) => ({ ordem: p.ordem, nome: p.nome, cpf: p.cpf }))];

// Itens que faltam no kit (não duplica o que já existe, mesmo dispensado)
export function itensNovosDoKit(cliente, participantes, modelos, existentes = []) {
  const tem = new Set(existentes.map((i) => `${i.modelo_id}:${i.pessoa_ordem}`));
  const novos = [];
  for (const m of [...modelos].sort((a, b) => (a.ordem ?? 50) - (b.ordem ?? 50))) {
    if (m.ativo === false || m.removido || m.manual || !regraOk(cliente, m.regra)) continue;
    const pessoas = m.assina === 'cada_comprador' ? pessoasDoCaso(cliente, participantes) : [{ ordem: 0, nome: null }];
    for (const p of pessoas) if (!tem.has(`${m.id}:${p.ordem}`)) novos.push({ modelo_id: m.id, pessoa_ordem: p.ordem, pessoa_nome: p.nome });
  }
  return novos;
}

// Situação de um item e do kit
export function situacaoItem(item) {
  if (item.dispensado_em) return 'dispensado';
  if (item.lancado_em) return 'lancado';
  if (item.assinado) return 'assinado';
  if (item.parcial) return 'parcial';
  return 'para_assinar';
}

// Quem precisa assinar cada formulário: compradores (todos ou um) e, quando o modelo pede, os vendedores
export function esperadosDoItem(item, { cliente, participantes = [], vendedores = [] } = {}) {
  const m = item.modelo || {};
  const lista = [];
  if (m.assina === 'cada_comprador') { if (item.pessoa_nome) lista.push({ nome: item.pessoa_nome, papel: 'comprador' }); }
  else if (m.assina !== 'cca' && cliente) pessoasDoCaso(cliente, participantes).forEach((p) => p.nome && lista.push({ nome: p.nome, papel: 'comprador' }));
  if (m.vendedor_assina) vendedores.forEach((v) => v.nome && lista.push({ nome: v.nome, papel: 'vendedor' }));
  return lista;
}

// Conta gov.br: assinar exige nível prata ou ouro
export const NIVEIS_GOVBR = [['ouro', 'Ouro'], ['prata', 'Prata'], ['bronze', 'Bronze'], ['nao_tem', 'Não tem conta'], ['nao_sei', 'Não sei']];
export const govbrNaoAssina = (nivel) => ['bronze', 'nao_tem'].includes(nivel);
const contam = (itens) => itens.filter((i) => !i.dispensado_em && i.modelo?.obrigatorio !== false && !i.modelo?.removido);
export function situacaoKit(itens = []) {
  const v = contam(itens);
  if (!v.length) return 'sem_modelo';
  if (v.some((i) => !i.assinado)) return 'para_assinar';
  if (v.some((i) => !i.lancado_em)) return 'assinada';
  return 'lancada';
}
export const nomeItem = (i) => `${i.modelo?.codigo || '?'}${i.pessoa_nome ? ` (${i.pessoa_nome})` : ''}`;
export const pendentes = (itens = []) => contam(itens).filter((i) => !i.assinado).map(nomeItem).join(', ') || null;

// Mantido para o modelo antigo de situação (lista de clientes)
export function situacaoDamp(registro) {
  if (!registro) return 'sem_modelo';
  if (registro.lancada_em) return 'lancada';
  if (registro.assinada) return 'assinada';
  return 'para_assinar';
}

// ---------- Dados que vão nos documentos ----------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const so = (v) => String(v ?? '').replace(/\D/g, '');
export const cpfFmt = (v) => { const d = so(v); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v ?? ''); };
const pisFmt = (v) => { const d = so(v); return d.length === 11 ? d.replace(/(\d{3})(\d{5})(\d{2})(\d)/, '$1.$2.$3-$4') : ''; };
const dataFmt = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const reaisFmt = (v) => (v == null || v === '' ? '' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Chaves usadas pelos campos dos modelos (mo-oficiais.js). Pessoa > 0: o documento é de uma pessoa só.
export function dadosMo({ cliente, participantes = [], pessoa = 0, hoje = new Date() }) {
  const todas = pessoasDoCaso(cliente, participantes);
  const pessoas = pessoa > 0 ? todas.filter((p) => p.ordem === pessoa) : todas;
  const titular = pessoas[0] || todas[0];
  const local = cliente.imovel_municipio || '';
  const d = {
    titular_nome: titular?.nome || '', titular_cpf: cpfFmt(titular?.cpf),
    local, dia: String(hoje.getDate()).padStart(2, '0'), mes_extenso: MESES[hoje.getMonth()], ano: String(hoje.getFullYear()),
    contrato_numero: cliente.contrato_numero || '', telefone: cliente.celular || '',
  };
  d.local_data = textoCaixa(`${local ? `${local}, ` : ''}${d.dia} de ${d.mes_extenso} de ${d.ano}`);
  pessoas.slice(0, 4).forEach((p, i) => { d[`p${i + 1}_nome`] = p.nome || ''; d[`p${i + 1}_cpf`] = cpfFmt(p.cpf); });
  return d;
}

// Valores de cada campo: o que já foi conferido > o padrão do modelo (marcas) > os dados do cadastro
export function valoresIniciais(oficial, dados, salvos = {}) {
  const v = {};
  for (const c of oficial.campos) {
    if (c.tipo === 'fora') continue;
    if (salvos[c.n] != null) v[c.n] = salvos[c.n];
    else if (c.tipo === 'marca') v[c.n] = c.padrao || '';
    else v[c.n] = c.chave && dados[c.chave] != null ? String(dados[c.chave]) : '';
  }
  return v;
}

// ---------- DAMP 29300 (página offline da própria Caixa): o que o app já deixa preenchido ----------
const ESTADO_CIVIL = { 'Casado(a)': 'casado', 'Solteiro(a)': 'solteiro', 'União estável': 'solteiro', 'Viúvo(a)': 'viuvo', 'Divorciado(a)': 'divorciado', 'Separado(a)': 'divorciado' };
const REGIME = (r = '') => (/parcial/i.test(r) ? 'parcial' : /universal/i.test(r) ? 'universal' : /separa/i.test(r) ? 'separacao' : /aquestos/i.test(r) ? 'aquestos' : '');
export function modalidadeDamp(cliente) {
  const m = cliente.modalidade || '';
  if (/Terreno e Constru/i.test(m)) return 3;
  if (/Terreno Pr[oó]prio/i.test(m)) return 4;
  if (/Reforma|Amplia/i.test(m)) return 5;
  if (/T[ée]rmino|Conclus/i.test(m)) return 6;
  if (/Aquisi/i.test(m)) return /planta|constru/i.test(cliente.imovel || '') ? 2 : 1;
  return 0;
}
export function enquadramentoDamp(cliente) {
  if (cliente.programa === 'MCMV') return 1;
  if (cliente.programa === 'Pró-Cotista') return 2;
  if (cliente.programa === 'SBPE' && cliente.usa_fgts) return 5;
  return 0;
}

// Dados da pessoa (titular = 1; outros compradores = 2..4) no formato da página da Caixa
export function dadosDamp({ cliente, participantes = [], pessoa = 1, hoje = new Date() }) {
  const p = pessoa > 1 ? participantes.find((x) => x.ordem === pessoa) || {} : cliente;
  const ano = hoje.getFullYear();
  const mod = modalidadeDamp(cliente);
  return {
    textos: {
      text_nome: textoCaixa(p.nome), text_data1: dataFmt(p.data_nascimento), text_cpf: cpfFmt(p.cpf), text_pis: pisFmt(p.pis),
      text_logradouro2: textoCaixa(cliente.imovel_municipio), text_uf2: textoCaixa(cliente.imovel_uf),
      ...(mod ? { [`text_enquad${mod}`]: reaisFmt(cliente.valor_imovel) } : {}),
      ...(p.declara_ir === true ? { text_irano2: String(ano - 1), text_irexerc2: String(ano) } : p.declara_ir === false ? { text_irano1: String(ano - 1), text_irexerc1: String(ano) } : {}),
      local_assin: textoCaixa(cliente.imovel_municipio),
    },
    estadoCivil: ESTADO_CIVIL[p.estado_civil] || '',
    regime: p.estado_civil === 'Casado(a)' ? REGIME(p.regime_bens) : '',
    marcar: [
      p.estado_civil === 'União estável' ? 'chkuniaoestavel1' : ESTADO_CIVIL[p.estado_civil] && ESTADO_CIVIL[p.estado_civil] !== 'casado' ? 'chkuniaoestavel2' : null,
      p.declara_ir === true ? 'chkir2' : p.declara_ir === false ? 'chkir1' : null,
      mod ? `chkmodalidade${mod}` : null,
      enquadramentoDamp(cliente) ? `chkenquadramento${enquadramentoDamp(cliente)}` : null,
      enquadramentoDamp(cliente) === 1 && cliente.cotista_fgts != null ? (cliente.cotista_fgts ? 'sn_1' : 'sn_2') : null,
      cliente.usa_fgts === true ? 'sn_11' : cliente.usa_fgts === false ? 'sn_12' : null,
    ].filter(Boolean),
    data: { dia: String(hoje.getDate()).padStart(2, '0'), mes: textoCaixa(MESES[hoje.getMonth()]), ano: String(ano) },
  };
}

// Script que a página da Caixa roda ao abrir: preenche e deixa o resto para o corretor conferir e completar
export function scriptDamp(dados) {
  const json = JSON.stringify(dados).replace(/</g, '\\u003c');
  return `<script>(function(){var D=${json};
function preencher(){var $=window.jQuery;if(!$)return;
Object.keys(D.textos).forEach(function(id){var v=D.textos[id];if(!v)return;var e=document.getElementById(id);if(!e)return;e.value=v;$(e).trigger('input').trigger('keyup').trigger('change');});
if(D.estadoCivil){$('#selectEstCiv').val(D.estadoCivil).trigger('change');}
if(D.regime){$('#selectRegime').val(D.regime).trigger('change');}
D.marcar.forEach(function(id){var e=document.getElementById(id);if(e&&!e.checked)e.click();});
var cs=document.querySelectorAll('#campoassinatura input');if(cs.length>3){cs[1].value=D.data.dia;cs[2].value=D.data.mes;cs[3].value=D.data.ano;}
var aviso=document.createElement('div');aviso.setAttribute('style','position:sticky;top:0;z-index:9999;background:#FBE8D3;color:#6E3D0C;padding:10px 14px;font:14px/1.4 Arial,sans-serif;border-bottom:1px solid #E8C9A6');
aviso.textContent='APP CCA: dados do cadastro já preenchidos. Confira tudo, complete o que falta (ocupação, residência, usufruto e o que mais estiver em branco) e use o botão Imprimir no fim da página para salvar em PDF.';
document.body.insertBefore(aviso,document.body.firstChild);}
if(document.readyState==='complete')setTimeout(preencher,300);else window.addEventListener('load',function(){setTimeout(preencher,300);});})();</script>`;
}
export const htmlDampPreenchido = (html, dados) => html.replace(/<\/body>/i, `${scriptDamp(dados)}</body>`);
