const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * Version of the caching strategy, part of the cache name.
 *
 * Bump it on every change of strategy: the worker bytes change, so browsers install it and offer
 * the reload, and the activation drops every file cached by the previous version. Deploys do not
 * need a bump: the chunks of previous builds are dropped as soon as a new shell is fetched.
 */
const VERSION = 1;

// Every URL derives from the scope, so the app works under any BASE_PATH.
const SCOPE = sw.registration.scope;

const SCOPE_PATH = new URL(SCOPE).pathname;

const STATIC_PATH = `${SCOPE_PATH}_next/static/`;

// Scripts and styles of a build, renamed by every build that changes them.
const CHUNKS_PATH = `${STATIC_PATH}chunks/`;

// Caches are shared by every app of an origin (GitHub Pages projects), so names carry the scope.
const CACHE_PREFIX = `wispen:${SCOPE_PATH}:`;

const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

interface PrecacheMessage {
    type: "precache";
    urls: string[];
}

/**
 * Tells whether a response can be stored: a complete, same-origin success. Redirected responses
 * are left out since browsers refuse them as answers to navigations.
 *
 * @param response - Network response; opaque and partial responses are never stored
 * @returns true for cacheable responses
 */
function isCacheable(response: Response): boolean {
    return (
        response.ok && response.type === "basic" && response.status !== 206 && !response.redirected
    );
}

/**
 * Stores a copy of a response, ignoring quota errors since caching is an optimization.
 * The copy is taken before the first await, while the page has not read the body yet.
 *
 * @param request - Request or URL used as the cache key
 * @param response - Response to copy; the original stays readable by the page
 */
async function store(request: Request | string, response: Response): Promise<void> {
    if (!isCacheable(response)) return;
    const copy = response.clone();
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, copy);
    } catch {
        // A full disk only disables offline use.
    }
}

/**
 * Lists the build chunks a page references, relative to the scope so the comparison does not
 * depend on the base path.
 *
 * @param html - Page markup, inline scripts included since they name the chunks of the page
 * @returns Paths such as "_next/static/chunks/abc.js"
 */
function chunkRefs(html: string): Set<string> {
    return new Set(html.match(/_next\/static\/chunks\/[^"'\s\\)?#]+/g) ?? []);
}

/**
 * Drops the cached chunks the new shell does not reference, after a deploy. Chunks loaded on
 * demand (exports) go too and are cached again on their next use, as on a first visit; fonts
 * keep their content-hashed names across builds and stay.
 *
 * @param cache - Cache of the current version
 * @param keep - Chunks referenced by the new shell
 */
async function pruneChunks(cache: Cache, keep: Set<string>): Promise<void> {
    const requests = await cache.keys();
    await Promise.all(
        requests
            .filter((request) => {
                const path = new URL(request.url).pathname;
                return path.startsWith(CHUNKS_PATH) && !keep.has(path.slice(SCOPE_PATH.length));
            })
            .map((request) => cache.delete(request)),
    );
}

/**
 * Stores a fresh page response as the offline shell. When it references other chunks than the
 * cached copy, a new build was deployed and the chunks of the previous one are dropped, so the
 * cache does not grow with every deploy. Copies are taken before the first await, while the
 * page has not read the body yet.
 *
 * @param key - Page URL without its query string
 * @param response - Network response of the navigation
 */
async function refreshShell(key: string, response: Response): Promise<void> {
    if (!isCacheable(response)) return;
    const copy = response.clone();
    const body = response.clone();
    try {
        const cache = await caches.open(CACHE_NAME);
        const previous = await cache.match(key);
        const after = chunkRefs(await body.text());
        await cache.put(key, copy);
        if (!previous) return;

        const before = chunkRefs(await previous.text());
        if (before.size !== after.size || [...after].some((ref) => !before.has(ref))) {
            await pruneChunks(cache, after);
        }
    } catch {
        // A full disk only disables offline use.
    }
}

/**
 * Serves a navigation from the network and refreshes the app shell, falling back to the cached
 * page (or the shell at the scope root) when offline.
 *
 * @param event - Fetch event of the navigation, whose preload response is used when enabled
 * @returns The page response
 */
async function networkFirst(event: FetchEvent): Promise<Response> {
    try {
        const preload = (await event.preloadResponse) as Response | undefined;
        const response = preload ?? (await fetch(event.request));
        event.waitUntil(refreshShell(event.request.url.split("?")[0], response));
        return response;
    } catch {
        const cached =
            (await caches.match(event.request, { ignoreSearch: true })) ??
            (await caches.match(SCOPE));
        return cached ?? Response.error();
    }
}

/**
 * Serves immutable build assets (hashed file names) from the cache, fetching them once.
 *
 * @param event - Fetch event of a file under _next/static, kept alive until the copy is stored
 * @returns The cached or fetched response
 */
async function cacheFirst(event: FetchEvent): Promise<Response> {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    event.waitUntil(store(event.request, response));
    return response;
}

/**
 * Serves other same-origin files (icons, manifest, fonts) from the cache when possible while
 * refreshing them in the background.
 *
 * @param event - Fetch event, kept alive until the refresh is stored
 * @returns The cached response, or the network one on a cache miss
 */
async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
    const cached = await caches.match(event.request);
    const network = fetch(event.request).then(async (response) => {
        await store(event.request, response);
        return response;
    });
    event.waitUntil(network.then(() => undefined).catch(() => undefined));
    return cached ?? network;
}

/**
 * Caches resources already loaded by the page, so the app works offline from the first visit.
 *
 * @param urls - Absolute URLs; only those inside the scope are kept
 */
async function precache(urls: string[]): Promise<void> {
    const cache = await caches.open(CACHE_NAME);
    const wanted = urls.filter((url) => url.startsWith(SCOPE) && !url.endsWith("/sw.js"));
    await Promise.allSettled(
        wanted.map(async (url) => {
            if (!(await cache.match(url))) await cache.add(url);
        }),
    );
}

/**
 * Tells whether a message from the page is a precache request.
 *
 * @param data - Payload posted by the page, also "skip-waiting" or anything else
 * @returns true for a well-formed precache message
 */
function isPrecacheMessage(data: unknown): data is PrecacheMessage {
    if (typeof data !== "object" || data === null) return false;
    const message = data as Partial<PrecacheMessage>;
    return message.type === "precache" && Array.isArray(message.urls);
}

sw.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.add(new Request(SCOPE, { cache: "reload" }))),
    );
});

sw.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                    .map((name) => caches.delete(name)),
            );
            await sw.registration.navigationPreload?.enable().catch(() => undefined);
            await sw.clients.claim();
        })(),
    );
});

sw.addEventListener("message", (event) => {
    // The page asks for the swap once the user accepts to reload, never on its own.
    if (event.data === "skip-waiting") void sw.skipWaiting();
    else if (isPrecacheMessage(event.data)) event.waitUntil(precache(event.data.urls));
});

sw.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    // Chrome throws on these requests when they are re-issued from a worker.
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

    const url = new URL(request.url);
    if (url.origin !== sw.location.origin || !url.href.startsWith(SCOPE)) return;

    if (request.mode === "navigate") event.respondWith(networkFirst(event));
    else if (url.pathname.startsWith(STATIC_PATH)) event.respondWith(cacheFirst(event));
    else event.respondWith(staleWhileRevalidate(event));
});
