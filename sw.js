const CACHE_NAME = "pauli-card-v3";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
];

// Installera Service Worker och cacha alla filer
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Nätverket först (så uppdateringar syns), cachen som reserv offline
self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
    e.respondWith(
        fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
            return res;
        }).catch(() => caches.match(e.request))
    );
});
