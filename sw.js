/* ════════════════════════════════════════════════════════════════════════
   SetupBoom · Service Worker
   Sobe este arquivo na RAIZ do site, ao lado do index.html.

   Por que ele existe como arquivo separado: o navegador recusa registrar
   service worker a partir de blob: ou data: — só aceita um .js servido pela
   mesma origem.

   16/11/2026 — offline, etapa 1 (o app abre, loga e consulta sem sinal):
   - SB_LIBS guarda Firebase, Leaflet, SheetJS, html2canvas e as fontes. São
     endereços com versão fixa, então nunca mudam: cache primeiro, e já
     baixados na instalação, para o login funcionar sem sinal desde o início.
   - SB_DADOS guarda as respostas das planilhas (API do Sheets e o export em
     xlsx do Rastreio): rede primeiro; se a rede falhar ou demorar mais que
     ESPERA ms, entrega a última cópia e avisa a página de quando ela é.
   - Os dois caches sobrevivem à troca de VERSAO; só a casca (index) é refeita.

   19/11/2026 — o app "Oper - CEEE - Setup" mora na pasta /oper/ do mesmo site,
   com o sw.js dele. Os dois dividem os caches de dados (mesmos nomes), mas a
   casca de cada um é só dele: este SW não apaga os caches 'oper-…', e só grava
   como casca o index DESTE app (antes, qualquer página aberta — baixar.html,
   a política, o /oper/ — era gravada no lugar do index.html).

   Ao publicar uma versão nova do site, MUDE o VERSAO abaixo.
   ════════════════════════════════════════════════════════════════════════ */

const VERSAO = 'setupboom-2026-11-19';
const SB_LIBS = 'sb-libs-v1';
const SB_DADOS = 'sb-dados-v1';
const SB_MAPA = 'sb-mapa-v1';   // pedaços do mapa vetorial (etapa 3, 16/11/2026)
const SB_R2 = 'sb-r2-v1';       // setas, material dos postes e índices dos pacotes por região (etapa 4/5)
const R2_MAPAS = 'https://pub-5be5c4c95218461ba8eafdd09a51bfa8.r2.dev/mapas/';
const R2_DADOS = 'https://pub-5be5c4c95218461ba8eafdd09a51bfa8.r2.dev/dados/';
const ESPERA = 7000;   // ms esperando a planilha antes de cair na cópia guardada
const CASCA = ['./', './index.html'];

const LIBS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  // as imagens que o CSS do Leaflet pede (botão de camadas e o pino); sem elas o botão some offline
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers-2x.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://unpkg.com/protomaps-leaflet@5.1.0/dist/protomaps-leaflet.js',
  'https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcviYwY.woff2',
  'https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvsYwYL8g.woff2',
  'https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_24vg6jTY8.woff2',
  'https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_24vg6tTY_9CQ.woff2'
];

/* Bibliotecas e fontes com versão no endereço: nunca mudam. */
const eLib = url =>
  url.startsWith('https://www.gstatic.com/firebasejs/') ||
  url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/') ||
  url.startsWith('https://unpkg.com/protomaps-leaflet@') ||
  url.startsWith('https://fonts.gstatic.com/');

/* Planilhas: leitura pela API do Sheets e o xlsx exportado (Rastreio). */
const eDado = url =>
  url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/') ||
  /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export\?/.test(url);

/* Nunca guardar: dado vivo, autenticação e o mapa (encheria o cache sem fim). */
const FORA_DO_CACHE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'google-analytics.com',
  'googletagmanager.com',
  'fonts.googleapis.com',
  'docs.google.com',     // gviz (consulta por clique) e o resto do Docs
  'open-meteo.com',      // previsão do tempo das bases
  'nominatim.openstreetmap.org',
  'tile.openstreetmap',
  'arcgis'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const casca = await caches.open(VERSAO);
    await casca.addAll(CASCA).catch(() => casca.add('./'));
    const libs = await caches.open(SB_LIBS);
    // uma a uma: se alguma falhar, as outras ficam
    await Promise.allSettled(LIBS.map(async u => {
      if (await libs.match(u)) return;
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (r.ok) await libs.put(u, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  const ficar = [VERSAO, SB_LIBS, SB_DADOS, SB_MAPA, SB_R2];
  e.waitUntil(
    caches.keys()
      // 'oper-…' é a casca do app da pasta /oper/: não é deste SW
      .then(ks => Promise.all(ks.filter(k => !ficar.includes(k) && !k.startsWith('oper-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* A casca é o index DESTE app: a raiz do escopo do SW (com ou sem index.html). */
const ehCasca = url => {
  const s = self.registration.scope, u = url.split('#')[0].split('?')[0];
  return u === s || u === s + 'index.html';
};

/* Avisa as abas abertas de que um dado veio da cópia guardada, e de quando. */
async function avisar(url, em) {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage({ sb: 'dado-guardado', url, em }));
}

/* Rede primeiro, com prazo; sem rede (ou demorando), a última cópia. */
/* A cópia vai COMPACTADA (gzip): postes e cabos descompactados ocupavam 326 MB
   no aparelho; compactados, perto de um décimo. Quem não tem CompressionStream
   guarda como veio. */
async function guardar(req, copia, nomeCache) {
  const h = new Headers(copia.headers);
  h.set('x-sb-guardado-em', String(Date.now()));
  h.delete('content-length'); h.delete('content-encoding');
  let corpo = copia.body;
  if (self.CompressionStream && corpo) { corpo = corpo.pipeThrough(new CompressionStream('gzip')); h.set('x-sb-gzip', '1'); }
  const blob = await new Response(corpo).blob();
  const c = await caches.open(nomeCache || SB_DADOS);
  await c.put(req, new Response(blob, { status: copia.status, statusText: copia.statusText, headers: h }));
}

/* Arquivos de dados no R2 (dados/<versão>/...): o caminho tem a versão, então
   não mudam — cópia primeiro. Só o dados/atual.json (que diz qual é a versão
   nova) vai à rede primeiro, e cai na cópia sem sinal. */
async function r2Dado(e) {
  const req = e.request;
  const c = await caches.open(SB_R2);
  if (req.url.split('?')[0].endsWith('/dados/atual.json')) {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res.ok) e.waitUntil(guardar(req, res.clone(), SB_R2).catch(() => {}));
      return res;
    } catch (err) {
      const g = await c.match(req);
      if (g) return abrirCopia(g);
      throw err;
    }
  }
  const g = await c.match(req);
  if (g) return abrirCopia(g);
  const res = await fetch(req);
  if (res.ok) e.waitUntil(guardar(req, res.clone(), SB_R2).catch(() => {}));
  return res;
}

/* Devolve a cópia descompactada (ou como está, se foi guardada sem gzip). */
function abrirCopia(g) {
  if (g.headers.get('x-sb-gzip') !== '1' || !self.DecompressionStream || !g.body) return g;
  const h = new Headers(g.headers);
  h.delete('x-sb-gzip');
  return new Response(g.body.pipeThrough(new DecompressionStream('gzip')), { status: g.status, statusText: g.statusText, headers: h });
}

function dadoComCopia(e) {
  const req = e.request;
  // a gravação da cópia segue mesmo depois de a resposta ter sido entregue
  let fim;
  e.waitUntil(new Promise(ok => { fim = ok; }));
  const daRede = fetch(req);
  daRede.catch(() => {});

  // a página fica com a resposta da rede: ela e a cópia leem juntas (clone)
  const entregar = res => {
    if (res && res.ok) guardar(req, res.clone()).catch(() => {}).finally(fim);
    else fim();
    return res;   // entrega assim que começa a chegar
  };

  const prazo = new Promise(ok => setTimeout(ok, ESPERA, 'prazo'));
  return Promise.race([daRede.catch(() => 'erro'), prazo]).then(async r => {
    if (r instanceof Response) return entregar(r);
    const guardado = await caches.match(req, { cacheName: SB_DADOS });
    if (guardado) {
      avisar(req.url, Number(guardado.headers.get('x-sb-guardado-em')) || 0);
      // A página fica com a cópia; a resposta da rede, quando vier, só renova a cópia.
      // SEM clone: um clone que ninguém lê segura a resposta inteira na memória
      // (os cabos são ~195 MB, e era o que derrubava o celular). 16/11/2026.
      daRede.then(res => (res.ok ? guardar(req, res) : null)).catch(() => {}).finally(fim);
      return abrirCopia(guardado);
    }
    return daRede.then(entregar, err => { fim(); throw err; });   // sem cópia: espera a rede (ou falha como antes)
  });
}

/* Mapa vetorial (PMTiles no R2): o protomaps-leaflet pede pedaços do arquivo
   (cabeçalho Range). O Cache não aceita guardar resposta 206, então cada
   pedaço vai como 200 com a faixa na chave e volta como 206 na hora de usar.
   O arquivo tem versão no caminho (mapas/v1/...): pedaço guardado não muda. */
async function mapaPedaco(e) {
  const req = e.request;
  const faixa = req.headers.get('range');
  // sem faixa, ou bloco grande pedido pela tela "Usar sem internet" (?sbbaixa=): a própria tela fatia e guarda
  if (!faixa || req.url.includes('sbbaixa=')) return fetch(req);
  const chave = req.url.split('?')[0] + '?sbfaixa=' + encodeURIComponent(faixa.replace(/\s+/g, ''));
  const c = await caches.open(SB_MAPA);
  const g = await c.match(chave);
  if (g) return new Response(g.body, { status: 206, statusText: 'Partial Content', headers: g.headers });
  const res = await fetch(req);
  if (res.status === 206) {
    const copia = res.clone();
    // a gravação segue depois de a resposta ter sido entregue
    e.waitUntil(copia.arrayBuffer().then(b => c.put(chave, new Response(b, { status: 200, headers: copia.headers }))).catch(() => {}));
  }
  return res;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  if (url.startsWith(R2_MAPAS)) { e.respondWith(mapaPedaco(e)); return; }
  if (url.startsWith(R2_DADOS)) { e.respondWith(r2Dado(e)); return; }

  if (eLib(url)) {
    e.respondWith(
      caches.match(e.request, { cacheName: SB_LIBS }).then(guardado => guardado || fetch(e.request).then(res => {
        // imagem pedida pelo CSS chega "opaca" (no-cors); com versão no endereço, guardar assim também serve
        if (res && (res.ok || res.type === 'opaque')) {
          const c = res.clone();
          caches.open(SB_LIBS).then(cc => cc.put(e.request, c));
        }
        return res;
      }))
    );
    return;
  }

  if (eDado(url)) { e.respondWith(dadoComCopia(e)); return; }

  if (FORA_DO_CACHE.some(p => url.includes(p))) return;

  /* Navegação (abrir o app): rede primeiro, para pegar versão nova quando
     houver sinal, e cair no cache quando não houver. */
  if (e.request.mode === 'navigate') {
    const casca = ehCasca(url);
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (casca && res.ok) {
            const clone = res.clone();
            caches.open(VERSAO).then(c => c.put('./index.html', clone));
          }
          return res;
        })
        .catch(() => (casca ? Promise.resolve(null) : caches.match(e.request))
          .then(r => r || caches.match('./index.html', { cacheName: VERSAO }))
          .then(r => r || caches.match('./', { cacheName: VERSAO })))
    );
    return;
  }

  /* Resto do próprio site (ícones, imagens): cache primeiro. */
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
