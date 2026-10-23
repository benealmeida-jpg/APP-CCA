// Documentos que o app preenche e gera em PDF: requerimento da busca de bens (GRERJ) e declaração de dependente.
// Os textos seguem os modelos enviados pela CCA (Requerimento_GRERJ_2026.docx e Declaração Dependente Caixa).
import { gerarPdfTexto } from './pdf-simples.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const dataExtenso = (d = new Date()) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const cpfFmt = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '___.___.___-__'); };
const moeda = (v) => (Number(v) > 0 ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ ______');
const ou = (v, vazio) => (String(v ?? '').trim() ? String(v).trim() : vazio);

// ---------- Busca de bens: GRERJ ----------
export const VALOR_GRERJ_PADRAO = 161.77; // emolumentos R$ 117,24 + percentuais (TJ-RJ, código do órgão 1558)
export const FINALIDADES_GRERJ = [['escritura', 'Escritura (tabelionato)'], ['registro', 'Registro (RGI)']];

// Pessoas da busca: titular + demais participantes; 2 GRERJ por pessoa (escritura e registro)
export function pessoasDaBusca(cliente, participantes = []) {
  return [{ ordem: 1, nome: cliente?.nome || '', cpf: cliente?.cpf || '' },
    ...[...(participantes || [])].filter((p) => p && (p.nome || p.cpf)).sort((a, b) => a.ordem - b.ordem).map((p) => ({ ordem: p.ordem, nome: p.nome || '', cpf: p.cpf || '' }))];
}
// Situação da busca: o que falta e de quem é a vez
export function situacaoGrerj(guias = [], { assinadoEm = null, enviadoEm = null, esperadas = 0 } = {}) {
  const comArquivo = guias.filter((g) => g.guia_path || g.numero);
  if (!comArquivo.length) return { etapa: 'gerar', vez: 'cca', texto: 'A CCA gera as GRERJ no site do TJ-RJ e anexa aqui.' };
  if (esperadas && comArquivo.length < esperadas) return { etapa: 'gerar', vez: 'cca', texto: `A CCA anexou ${comArquivo.length} de ${esperadas} GRERJ.` };
  const faltaPagar = comArquivo.filter((g) => !g.pago_em);
  if (faltaPagar.length) return { etapa: 'pagar', vez: 'corretor', texto: `Pagar ${faltaPagar.length === 1 ? 'a GRERJ' : `as ${faltaPagar.length} GRERJ`} SOMENTE no Bradesco e anexar o comprovante.` };
  if (!assinadoEm) return { etapa: 'assinar', vez: 'corretor', texto: 'Baixar o requerimento preenchido, colher a assinatura do requerente no gov.br e anexar.' };
  if (!enviadoEm) return { etapa: 'enviar', vez: 'cca', texto: 'A CCA envia GRERJ, comprovantes e requerimento ao Cartório Distribuidor de Itaboraí.' };
  return { etapa: 'aguardando', vez: 'cartorio', texto: 'Enviado ao cartório. Aguardando as certidões de busca.' };
}

export function blocosRequerimento({ requerente = {}, pessoas = [], guias = [], data = new Date() }) {
  const req = `Requerente: ${ou(requerente.nome, '______________________________')}, Portador(a) do RG: ${ou(requerente.rg, '______________')}, ${ou(requerente.orgao, '______')} e CPF: ${cpfFmt(requerente.cpf)},`;
  const b = [
    { texto: 'PODER JUDICIÁRIO DO ESTADO DO RIO DE JANEIRO', negrito: true, alinhar: 'centro', tam: 12, depois: 0 },
    { texto: 'COMARCA DE ITABORAÍ', negrito: true, alinhar: 'centro', tam: 12, depois: 0 },
    { texto: 'CARTÓRIO DO DISTRIBUIDOR, CONTADOR E PARTIDOR', negrito: true, alinhar: 'centro', tam: 12, depois: 0 },
    { texto: 'Av. Vereador Hermínio Moreira, 380, Ed. Do Fórum, Centro, Itaboraí - RJ. CEP: 24800-201', alinhar: 'centro', tam: 9.5, depois: 16 },
    { texto: 'REQUERIMENTO Nº_____________________.', negrito: true, alinhar: 'centro', tam: 12, depois: 14 },
    { texto: 'Ilmo. SR. Oficial, venho requerer, se possível e dentro da razoabilidade, urgência na emissão das certidões descritas abaixo. Conto com apreço e compreensão dos(as) senhores(as), desde já agradeço imensamente.', alinhar: 'just', depois: 12 },
    { texto: req, alinhar: 'just', depois: 10 },
    { texto: 'Vem requerer a expedição de:', depois: 6 },
    { texto: '(   ) Certidão de Execuções Fiscais', tam: 10.5, depois: 1 },
    { texto: '(   ) Certidão Cível', tam: 10.5, depois: 1 },
    { texto: '(   ) Certidão Criminal', tam: 10.5, depois: 1 },
    { texto: '(   ) Revalidação', tam: 10.5, depois: 1 },
    { texto: '(   ) Certidão de falências e concordatas', tam: 10.5, depois: 1 },
    { texto: '( X ) Busca Específica de Bens RGI e Tabelionato', tam: 10.5, negrito: true, depois: 12 },
    { texto: 'FINALIDADE: REGISTRO ESCRITURA', negrito: true, depois: 10 },
  ];
  for (const p of pessoas) {
    b.push({ texto: `NOME: ${ou(p.nome, '______________________________').toUpperCase()}, Portador(a) do CPF: ${cpfFmt(p.cpf)}.`, negrito: true, depois: 3 });
    const minhas = guias.filter((g) => Number(g.pessoa_ordem) === Number(p.ordem));
    const linhas = minhas.length ? minhas : [{}, {}];
    for (const g of linhas) b.push({ texto: `GRERJ Nº: ${ou(g.numero, '______________________')}${g.finalidade ? ` (${g.finalidade === 'registro' ? 'RGI' : 'Escritura'})` : ''}          Valor: ${moeda(g.valor)}`, recuo: 18, depois: 2 });
    b.push({ texto: '', depois: 6 });
  }
  b.push(
    { texto: `Itaboraí, ${dataExtenso(data)}.`, alinhar: 'dir', antes: 6, depois: 34 },
    { linha: true, recuo: 110, ate: 372, depois: 2 },
    { texto: 'Assinatura do Requerente', alinhar: 'centro', depois: 0 },
    { texto: requerente.contato ? `Contato ${requerente.contato}` : '', alinhar: 'centro', tam: 10, depois: 26 },
    { linha: true, depois: 6 },
    { texto: 'Prazo para entrega: ____/____/______        Recebi em ____/____/______        Assinatura: ____________________', tam: 9.5 },
  );
  return b;
}
export const pdfRequerimento = (dados) => gerarPdfTexto(blocosRequerimento(dados), { titulo: 'Requerimento - Busca específica de bens' });

// ---------- Declaração de dependente (modelo da Caixa) ----------
const RENDA = 'não possuo nenhum tipo de rendimento, seja renda formal ou informal exceto os benefícios temporários de natureza indenizatória, assistencial ou previdenciária, como auxílio-doença, auxílio-acidente, seguro-desemprego, benefício de prestação continuada (BPC) e benefício do Programa Bolsa Família, ou outros que vierem a substituí-los de acordo com a Lei 14.620 de 13/07/2023';
export function blocosDependente({ parente = {}, proponente = {}, conjuge = '', data = null }) {
  const b = [
    { texto: 'DECLARAÇÃO DE PARENTESCO, RESIDÊNCIA E AUSÊNCIA DE RENDIMENTOS', negrito: true, alinhar: 'centro', tam: 12.5, antes: 10, depois: 22 },
    { texto: `Eu, ${ou(parente.nome, '______________________________')}, CPF ${cpfFmt(parente.cpf)}, estado civil ${ou(parente.estado_civil, '__________________').toLowerCase()}, declaro que sou ${ou(parente.grau, '____________________').toLowerCase()} do proponente ${ou(proponente.nome, '______________________________')}, CPF ${cpfFmt(proponente.cpf)}, com quem resido no mesmo endereço há pelo menos 6 (seis) meses.`, alinhar: 'just', depois: 10 },
    { texto: `Declaro ainda que ${RENDA} e dependo financeiramente do(a) ${ou(proponente.nome, '______________________________')}, proponente acima qualificado(a).`, alinhar: 'just', depois: 10 },
    { texto: 'Declaro ainda que não participo como dependente de nenhum outro contrato de financiamento habitacional e não possuo financiamento ativo no SFH.', alinhar: 'just', depois: 10 },
  ];
  if (String(conjuge || '').trim()) b.push({ texto: `Eu, ${conjuge.trim()}, declaro que também ${RENDA}.`, alinhar: 'just', depois: 10 });
  b.push(
    { texto: 'RESPONSABILIDADE PELAS INFORMAÇÕES DECLARADAS', negrito: true, antes: 6, depois: 6 },
    { texto: 'Responsabilizo-me pela exatidão e veracidade das informações declaradas e estou ciente de que, se falsas as declarações, ficarei sujeito às penas da lei, ficando, ainda, obrigado(a) a devolver os valores indevidamente sacados da conta vinculada do FGTS e/ou descontos concedidos pelo FGTS nos termos da Resolução do Conselho Curador do FGTS 702/12, suas alterações e aditamentos, acrescidos de correção monetária e juros sem prejuízo do vencimento antecipado da dívida decorrente do crédito concedido, com a consequente cobrança administrativa/judicial.', alinhar: 'just', tam: 10.5, depois: 16 },
    { texto: `Data: ${data ? dataExtenso(data) : '____/____/________'}`, depois: 30 },
    { linha: true, recuo: 0, ate: 260, depois: 2 }, { texto: `Assinatura do parente${parente.nome ? ` - ${parente.nome}` : ''}`, tam: 10, depois: 26 },
  );
  if (String(conjuge || '').trim()) b.push({ linha: true, recuo: 0, ate: 260, depois: 2 }, { texto: `Assinatura do cônjuge do parente - ${conjuge.trim()}`, tam: 10, depois: 26 });
  b.push({ linha: true, recuo: 0, ate: 260, depois: 2 }, { texto: `Assinatura do proponente${proponente.nome ? ` - ${proponente.nome}` : ''}`, tam: 10 });
  return b;
}
export const pdfDependente = (dados) => gerarPdfTexto(blocosDependente(dados), { titulo: 'Declaração de dependente' });
