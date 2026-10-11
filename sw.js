// Guarda a "casca" do app para abrir rápido e funcionar com internet fraca.
// Dados de clientes NUNCA são guardados aqui (só arquivos do próprio app).
const VERSAO = 'appcca-v12';
const CASCA = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icone.svg',
  'js/app.js', 'js/api.js', 'js/api-demo.js', 'js/api-supabase.js', 'js/componentes.js',
  'js/config.js', 'js/dados-iniciais.js', 'js/dom.js', 'js/painel.js', 'js/regras.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase e arquivos: sempre pela rede
  // Rede primeiro (pega atualizações); se cair, usa a cópia guardada.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
