// Dados do projeto no Supabase (Project Settings → API).
// A chave "publishable" pode ficar no app: o que protege os dados são as permissões (RLS) do banco.
// Para abrir o MODO DEMONSTRAÇÃO, deixe os dois campos vazios.
export const SUPABASE_URL = 'https://gfyvbqbllvjynqssrozu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_U8u4kh6OjbUPATXMp_MfmQ_ntNbRVgi';

// O app oficial usa o MODELO 2 (estrutura por perfil: níveis da CCA, CEO e gestor da imobiliária, financeiro, imóveis...).
// ?demo2 abre a demonstração do Modelo 2 (dados de exemplo no aparelho, para mostrar e treinar).
// ?demo abre a demonstração antiga (Modelo 1), mantida só para consulta.
const parametrosUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const MODELO2 = !!parametrosUrl && (parametrosUrl.has('demo2') || !parametrosUrl.has('demo'));
export const MODO_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY || (!!parametrosUrl && (parametrosUrl.has('demo') || parametrosUrl.has('demo2')));
