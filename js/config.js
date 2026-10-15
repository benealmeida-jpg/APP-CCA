// Dados do projeto no Supabase (Project Settings → API).
// A chave "publishable" pode ficar no app: o que protege os dados são as permissões (RLS) do banco.
// Para abrir o MODO DEMONSTRAÇÃO, deixe os dois campos vazios.
export const SUPABASE_URL = 'https://gfyvbqbllvjynqssrozu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_U8u4kh6OjbUPATXMp_MfmQ_ntNbRVgi';

// Abrir com ?demo no endereço também liga a demonstração (útil para treinar corretores).
// Abrir com ?demo2 liga o MODELO 2: a estrutura nova por perfil, só em demonstração e com dados próprios.
export const MODELO2 = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo2');
export const MODO_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY || MODELO2
  || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'));
