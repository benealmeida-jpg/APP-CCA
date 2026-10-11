// Escolhe a conexão: Supabase (real) ou demonstração.
import { MODO_DEMO } from './config.js';

export const api = MODO_DEMO
  ? (await import('./api-demo.js')).api
  : (await import('./api-supabase.js')).api;
