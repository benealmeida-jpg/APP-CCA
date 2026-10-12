// Consulta de CNPJ em bases públicas da Receita Federal (sem chave):
// 1) BrasilAPI  2) CNPJ.ws (reserva, se a primeira falhar)
// Devolve sempre o mesmo formato, pronto para preencher o cadastro.

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
const titulo = (s) => String(s || '').trim();

async function obterJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { definitivo: true });
    if (r.status === 400) throw Object.assign(new Error('CNPJ inválido.'), { definitivo: true });
    if (!r.ok) throw new Error(`A consulta respondeu ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

function deBrasilApi(j) {
  const fone = soDigitos(j.ddd_telefone_1);
  return {
    cnpj: soDigitos(j.cnpj),
    razao_social: titulo(j.razao_social),
    nome_fantasia: titulo(j.nome_fantasia),
    situacao_cadastral: titulo(j.descricao_situacao_cadastral),
    cep: soDigitos(j.cep),
    logradouro: [titulo(j.descricao_tipo_de_logradouro), titulo(j.logradouro)].filter(Boolean).join(' '),
    numero: titulo(j.numero),
    complemento: titulo(j.complemento),
    bairro: titulo(j.bairro),
    municipio: titulo(j.municipio),
    uf: titulo(j.uf),
    telefone: fone.length >= 10 ? fone : '',
    email: titulo(j.email).toLowerCase(),
  };
}

function deCnpjWs(j) {
  const e = j.estabelecimento || {};
  const fone = soDigitos(`${e.ddd1 || ''}${e.telefone1 || ''}`);
  return {
    cnpj: soDigitos(e.cnpj),
    razao_social: titulo(j.razao_social),
    nome_fantasia: titulo(e.nome_fantasia),
    situacao_cadastral: titulo(e.situacao_cadastral),
    cep: soDigitos(e.cep),
    logradouro: [titulo(e.tipo_logradouro), titulo(e.logradouro)].filter(Boolean).join(' '),
    numero: titulo(e.numero),
    complemento: titulo(e.complemento),
    bairro: titulo(e.bairro),
    municipio: titulo(e.cidade?.nome),
    uf: titulo(e.estado?.sigla),
    telefone: fone.length >= 10 ? fone : '',
    email: titulo(e.email).toLowerCase(),
  };
}

export async function consultarCnpj(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14) throw new Error('Digite os 14 números do CNPJ.');
  try {
    return deBrasilApi(await obterJson(`https://brasilapi.com.br/api/cnpj/v1/${d}`));
  } catch (e) {
    if (e.definitivo) throw e;
    try { return deCnpjWs(await obterJson(`https://publica.cnpj.ws/cnpj/${d}`)); }
    catch (e2) {
      if (e2.definitivo) throw e2;
      throw new Error('Não foi possível consultar a Receita agora. Tente de novo em 1 minuto ou preencha à mão.');
    }
  }
}
