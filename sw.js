// 離線快取：更新遊戲內容時，把版本號改大，手機下次連網就會換成新版。
const VERSION = 'mf-pet-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './assets/characters/freya/act/freya_act_angry.png',
  './assets/characters/freya/act/freya_act_bath.png',
  './assets/characters/freya/act/freya_act_eat.png',
  './assets/characters/freya/act/freya_act_happy.png',
  './assets/characters/freya/act/freya_act_idle.png',
  './assets/characters/freya/act/freya_act_play.png',
  './assets/characters/freya/act/freya_act_sleep.png',
  './assets/characters/freya/act/freya_act_walk.png',
  './assets/characters/freya/face/freya_face_confused.png',
  './assets/characters/freya/face/freya_face_happy.png',
  './assets/characters/freya/face/freya_face_normal.png',
  './assets/characters/freya/face/freya_face_shy.png',
  './assets/characters/freya/face/freya_face_sleepy.png',
  './assets/characters/freya/face/freya_face_smile.png',
  './assets/characters/freya/face/freya_face_spoiled.png',
  './assets/characters/freya/face/freya_face_surprised.png',
  './assets/characters/freya/wear/freya_wear_daily.png',
  './assets/characters/freya/wear/freya_wear_formal.png',
  './assets/characters/freya/wear/freya_wear_home.png',
  './assets/characters/freya/wear/freya_wear_pajama.png',
  './assets/characters/freya/wear/freya_wear_special.png',
  './assets/characters/freya/wear/freya_wear_sport.png',
  './assets/characters/freya/wear/freya_wear_travel.png',
  './assets/characters/mare/act/mare_act_angry.png',
  './assets/characters/mare/act/mare_act_bath.png',
  './assets/characters/mare/act/mare_act_eat.png',
  './assets/characters/mare/act/mare_act_happy.png',
  './assets/characters/mare/act/mare_act_idle.png',
  './assets/characters/mare/act/mare_act_play.png',
  './assets/characters/mare/act/mare_act_sleep.png',
  './assets/characters/mare/act/mare_act_walk.png',
  './assets/characters/mare/face/mare_face_angry.png',
  './assets/characters/mare/face/mare_face_happy.png',
  './assets/characters/mare/face/mare_face_normal.png',
  './assets/characters/mare/face/mare_face_sad.png',
  './assets/characters/mare/face/mare_face_sleepy.png',
  './assets/characters/mare/face/mare_face_smile.png',
  './assets/characters/mare/face/mare_face_spoiled.png',
  './assets/characters/mare/face/mare_face_surprised.png',
  './assets/characters/mare/wear/mare_wear_daily.png',
  './assets/characters/mare/wear/mare_wear_formal.png',
  './assets/characters/mare/wear/mare_wear_home.png',
  './assets/characters/mare/wear/mare_wear_pajama.png',
  './assets/characters/mare/wear/mare_wear_special.png',
  './assets/characters/mare/wear/mare_wear_sport.png',
  './assets/characters/mare/wear/mare_wear_travel.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 遊戲頁面：先用網路拿最新版，沒網路時用快取
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // 其他檔案與 Google 字型：先用快取，沒有才下載並存起來
  if (url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
