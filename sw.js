/* ════════════════════════════════════════════════════════════════════════
   SetupBoom · Service Worker
   Sobe este arquivo na RAIZ do site, ao lado do index.html.

   Por que ele existe como arquivo separado: o navegador recusa registrar
   service worker a partir de blob: ou data: — só aceita um .js servido pela
   mesma origem. O index.html registrava por blob e por isso o offline
   nunca funcionou, apesar do app dizer que funcionava.

   Ao publicar uma versão nova do site, MUDE o VERSAO abaixo. É isso que
   descarta o cache antigo; sem trocar, o celular segue abrindo a versão
   velha mesmo depois de tu subir a nova.
   ════════════════════════════════════════════════════════════════════════ */

const VERSAO = 'setupboom-2026-08-31';
const CASCA = ['./', './index.html'];

/* Nunca guardar em cache: dado vivo e autenticação. Servido do cache, o
   tempo congelaria na primeira leitura do dia e a planilha nunca atualizaria. */
const FORA_DO_CACHE = [
  'googleapis.com',      // Sheets API e Firebase
  'gstatic.com',
  'firebasejs',
  'firebaseio.com',
  'fonts.google',
  'docs.google.com',     // consulta dos religadores: dado vivo
  'open-meteo.com',      // previsão do tempo das bases
  'tile.openstreetmap',  // tiles do mapa: encheriam o cache sem fim
  'arcgis'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll(CASCA).catch(() => c.add('./')))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (FORA_DO_CACHE.some(p => url.includes(p))) return;

  /* Navegação (abrir o app): rede primeiro, para pegar versão nova quando
     houver sinal, e cair no cache quando não houver. É o que faz o app
     abrir no meio do vão sem rede. */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(VERSAO).then(c => c.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* Resto (fontes, imagens): cache primeiro, que é o que não muda. */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(VERSAO).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
