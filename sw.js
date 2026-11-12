// Service worker do Assistente Clínico (versão online).
// Guarda os arquivos do aplicativo no aparelho para ele abrir sem internet.
// A versão abaixo muda a cada publicação: é isso que faz o aplicativo se atualizar sozinho.
const VERSAO = '20261112004012';
const CACHE = 'assistente-clinico-' + VERSAO;
const ARQUIVOS = ["./","index.html","conferencia.js","api-navegador.js","pwa.js","manifest.webmanifest","dados/tarefas.json","dados/cid10.json","icones/icone-180.png","icones/icone-192.png","icones/icone-512-mascara.png","icones/icone-512.png"];

self.addEventListener('install', (e) => {
  // baixa tudo de novo do servidor (sem usar cópias antigas) e só instala se todos os arquivos vierem
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome.startsWith('assistente-clinico-') && nome !== CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

// A página pede para a versão nova assumir (na hora, se estiver ociosa; ou quando o usuário clicar em "Atualizar").
self.addEventListener('message', (e) => { if (e.data === 'ativar') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Só os arquivos do próprio aplicativo passam por aqui. A IA e o banco de dados vão direto para a internet.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(e.request, { ignoreSearch: true }) || (e.request.mode === 'navigate' ? await cache.match('./') : null);
    if (guardado) return guardado;
    return fetch(e.request);
  })());
});
