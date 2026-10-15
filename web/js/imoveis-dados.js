// Cadastro do Imóvel (Modelo 2): o imóvel pertence ao vendedor e guarda os documentos e as engenharias dele.
// Os documentos são enviados uma vez só e servem para a engenharia e para os processos de venda daquele imóvel. Regras puras.
import { DOCS_ENGENHARIA, DOCS_POR_TIPO, validadeDoLaudo, diasParaVencer } from './engenharia-regras.js';

// Documentos que ficam no cadastro do imóvel (os de pagamento e pendência ficam no pedido de engenharia)
export const SO_DO_PEDIDO = ['BOLETO', 'COMPROVANTE', 'PEPT_DOC'];
export const ehDocDoImovel = (cod) => !!DOCS_ENGENHARIA[cod] && !SO_DO_PEDIDO.includes(cod);
export const DOCS_IMOVEL = Object.keys(DOCS_ENGENHARIA).filter(ehDocDoImovel);
export const nomeDocImovel = (cod) => DOCS_ENGENHARIA[cod] || cod;

// Documento do imóvel -> documento equivalente no processo do cliente (grupo Imóvel)
export const PARA_CLIENTE = { MATRICULA: 'MATRICULA', IPTU: 'ESPELHO_IPTU', HABITESE: 'IMOVEL_HABITESE', CREA_CAU: 'IMOVEL_CREA_CAU', CNO_SCPO: 'IMOVEL_SCPO' };
export const DO_CLIENTE = Object.fromEntries(Object.entries(PARA_CLIENTE).map(([a, b]) => [b, a]));

export const enderecoImovel = (i) => [i?.endereco, [i?.cidade, i?.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || 'Endereço não informado';

// Documento mais recente de cada tipo
export function docsAtuais(docs = []) {
  const m = new Map();
  [...docs].sort((a, b) => String(a.enviado_em).localeCompare(String(b.enviado_em))).forEach((d) => m.set(d.tipo, d));
  return m;
}

// Quais documentos a engenharia deste tipo pede e quais o imóvel já tem
export function docsParaEngenharia(tipo, docsImovel = []) {
  const tem = docsAtuais(docsImovel);
  return (DOCS_POR_TIPO[tipo] || []).map((cod) => ({ codigo: cod, nome: nomeDocImovel(cod), doc: tem.get(cod) || null }));
}

// Último laudo das engenharias do imóvel: valor, data, validade (180 dias) e situação
export function laudoDoImovel(engenharias = [], hoje = new Date()) {
  const comLaudo = engenharias.filter((e) => e.etapa === 'laudo' && e.laudo_aprovado !== undefined && e.laudo_aprovado !== null)
    .sort((a, b) => String(b.avaliacao_data || b.atualizado_em).localeCompare(String(a.avaliacao_data || a.atualizado_em)));
  const e = comLaudo[0];
  if (!e) {
    const andamento = engenharias.find((x) => x.etapa !== 'laudo');
    return { situacao: andamento ? 'andamento' : 'sem', engenharia: andamento || null };
  }
  if (!e.laudo_aprovado) return { situacao: 'reprovado', engenharia: e };
  const validade = validadeDoLaudo(e.avaliacao_data);
  const dias = diasParaVencer(validade, hoje);
  return { situacao: dias < 0 ? 'vencido' : 'valido', engenharia: e, valor: e.avaliacao_valor, data: e.avaliacao_data, validade, dias };
}

// Documentos do imóvel vistos como documentos do processo do cliente (versão 0: um envio do próprio processo vence)
export function docsDoImovelParaCliente(docsImovel = [], clienteId) {
  const out = [];
  docsAtuais(docsImovel).forEach((d, cod) => {
    const tipo = PARA_CLIENTE[cod];
    if (!tipo) return;
    out.push({ id: d.id, cliente_id: clienteId, participante_id: null, dependente_ordem: null, tipo_codigo: tipo, versao: 0, versao_pessoa: 0,
      situacao: d.situacao === 'recusado' ? 'recusado' : d.situacao === 'aceito' ? 'aceito' : 'em_conferencia', nome_original: d.nome_original, arquivo_path: d.arquivo_path || null, enviado_em: d.enviado_em, emitido_em: d.emitido_em || null, do_imovel: true });
  });
  return out;
}

// Pedido de engenharia aberto a partir da ficha do imóvel (o formulário já vem com o vendedor e o imóvel)
export const pedidoDeEngenharia = { imovel: null };
