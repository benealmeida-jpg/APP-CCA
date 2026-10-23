// Guarda a "casca" do app para abrir rápido e funcionar com internet fraca.
// Dados de clientes NUNCA são guardados aqui (só arquivos do próprio app).
const VERSAO = 'appcca-v119';
const CASCA = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icone.svg', 'img/logo.svg', 'img/simbolo.svg', 'img/entrar.jpg', 'img/hero-corretor.jpg', 'img/cabecalho-corretor.jpg', 'img/painel.jpg', 'img/inicio-adm.jpg', 'img/inicio-corretor.jpg', 'img/vazio-clientes.jpg', 'img/vazio-conversa.jpg', 'img/arte-convidar.jpg', 'img/arte-relatorios.jpg', 'img/arte-documentos.jpg', 'img/arte-avisos.jpg',
  'js/app.js', 'js/api.js', 'js/api-demo.js', 'js/api-supabase.js', 'js/componentes.js',
  'js/config.js', 'js/dados-iniciais.js', 'js/dom.js', 'js/painel.js', 'js/regras.js', 'js/tetos.js', 'js/cnpj.js',
  'js/inicio.js', 'js/inicio-dados.js', 'js/contato.js', 'js/desempenho.js', 'js/desempenho-dados.js', 'js/campanhas.js', 'js/campanhas-dados.js', 'js/contrato.js', 'js/contrato-dados.js', 'js/gestao.js', 'js/gestao-dados.js', 'js/fluxo.js', 'js/fluxo-dados.js', 'js/modelo2.js', 'js/damp-dados.js', 'js/assinatura-pdf.js', 'js/mo-pdf.js', 'js/mo-oficiais.js', 'js/financeiro.js', 'js/financeiro-dados.js', 'js/genero.js', 'js/imoveis.js', 'js/imoveis-dados.js', 'js/consumidores.js', 'js/busca.js', 'js/engenharia.js', 'js/engenharia-regras.js', 'js/relatorios.js', 'js/relatorios-dados.js', 'js/xlsx-simples.js',
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

// ---------- Notificações (avisos da CCA) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Andrade Almeida CCA', {
    body: d.corpo || '', icon: 'icons/icone-192.png', badge: 'icons/icone-192.png', data: { url: d.url || './' }, tag: d.url || undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
    for (const a of abas) { if ('navigate' in a) { a.focus(); return a.navigate(url); } }
    return self.clients.openWindow(url);
  }));
});
