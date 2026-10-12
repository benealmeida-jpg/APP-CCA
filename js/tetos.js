// Teto MCMV Faixas 1 e 2 por município (tabela oficial da Caixa), publicado com o app como reserva
let cacheTetos = null;
export async function tetoDoArquivo(uf, nome) {
  try { cacheTetos ||= await (await fetch('data/tetos_mcmv.json')).json(); } catch { cacheTetos = { municipios: {} }; }
  const t = cacheTetos.municipios?.[`${uf}|${nome}`];
  return t ? { teto: t[0], recorte: t[1] || null, hierarquia: t[2] || null, populacao: t[3] || null, regiaoMetropolitana: t[4] === 1, nomeRm: t[5] || null, vigencia: cacheTetos.vigencia || null } : null;
}

