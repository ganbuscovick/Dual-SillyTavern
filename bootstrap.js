(() => {
    'use strict';

    const marker = document.querySelector('meta[name="st-dual-child"]');
    if (!marker) return;

    const side = marker.getAttribute('content');
    const host = window.parent?.__ST_DUAL_HOST__;
    if (!host || !host.instances || !host.instances[side]) {
        console.error('[Dual SillyTavern] Host runtime not found.');
        return;
    }

    const instance = host.instances[side];
    const STORAGE_PREFIX = `__ST_DUAL_V1_${side}__`;
    const nativeLocalStorage = window.localStorage;
    const nativeSessionStorage = window.sessionStorage;
    const nativeFetch = window.fetch.bind(window);

    function visibleKeys(storage) {
        const keys = [];
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key != null) keys.push(key);
        }
        return keys;
    }

    function seedLocalStorage() {
        const markerKey = `${STORAGE_PREFIX}__seeded`;
        if (nativeLocalStorage.getItem(markerKey) === '1') return;

        try {
            const parentStorage = window.parent.localStorage;
            for (const key of visibleKeys(parentStorage)) {
                if (key.startsWith('__ST_DUAL_V1_')) continue;
                const value = parentStorage.getItem(key);
                if (value !== null && nativeLocalStorage.getItem(`${STORAGE_PREFIX}${key}`) === null) {
                    nativeLocalStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
                }
            }
        } catch (error) {
            console.warn('[Dual SillyTavern] localStorage seed failed:', error);
        }

        try {
            nativeLocalStorage.setItem(markerKey, '1');
        } catch (_) {
            // Ignore quota/private-mode failures.
        }
    }

    function makeStorageFacade(nativeStorage, seed) {
        if (seed) seed();

        function prefixed(key) {
            return `${STORAGE_PREFIX}${String(key)}`;
        }

        function ownKeys() {
            const out = [];
            for (let i = 0; i < nativeStorage.length; i += 1) {
                const key = nativeStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    out.push(key.slice(STORAGE_PREFIX.length));
                }
            }
            return out;
        }

        const facade = {
            get length() {
                return ownKeys().length;
            },
            key(index) {
                return ownKeys()[index] ?? null;
            },
            getItem(key) {
                return nativeStorage.getItem(prefixed(key));
            },
            setItem(key, value) {
                nativeStorage.setItem(prefixed(key), String(value));
            },
            removeItem(key) {
                nativeStorage.removeItem(prefixed(key));
            },
            clear() {
                for (const key of ownKeys()) {
                    nativeStorage.removeItem(prefixed(key));
                }
            },
        };

        try {
            Object.setPrototypeOf(facade, Storage.prototype);
        } catch (_) {
            // Prototype assignment is cosmetic only.
        }
        return facade;
    }

    seedLocalStorage();

    // Storage objects are realm-local in iframes, so replacing these globals here
    // isolates the child without touching the parent ST instance.
    const localStorageFacade = makeStorageFacade(nativeLocalStorage, null);
    const sessionStorageFacade = makeStorageFacade(nativeSessionStorage, null);

    try {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            enumerable: true,
            get: () => localStorageFacade,
        });
        Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            enumerable: true,
            get: () => sessionStorageFacade,
        });
    } catch (error) {
        console.warn('[Dual SillyTavern] Storage facade installation failed:', error);
    }

    function patchIndexedDB() {
        const nativeIndexedDB = window.indexedDB;
        if (!nativeIndexedDB) return;

        const wrapper = new Proxy(nativeIndexedDB, {
            get(target, property, receiver) {
                if (property === 'open') {
                    return (name, version, upgradeNeeded) => target.open(`${STORAGE_PREFIX}${name}`, version, upgradeNeeded);
                }
                if (property === 'deleteDatabase') {
                    return (name) => target.deleteDatabase(`${STORAGE_PREFIX}${name}`);
                }
                if (property === 'databases' && typeof target.databases === 'function') {
                    return async () => {
                        const databases = await target.databases();
                        return databases
                            .filter(db => db?.name?.startsWith(STORAGE_PREFIX))
                            .map(db => ({ ...db, name: db.name.slice(STORAGE_PREFIX.length) }));
                    };
                }
                return Reflect.get(target, property, receiver);
            },
        });

        try {
            Object.defineProperty(window, 'indexedDB', {
                configurable: true,
                enumerable: true,
                get: () => wrapper,
            });
        } catch (error) {
            console.warn('[Dual SillyTavern] IndexedDB isolation failed:', error);
        }
    }

    function patchCaches() {
        if (!window.caches) return;
        const nativeCaches = window.caches;
        const prefixed = name => `${STORAGE_PREFIX}${String(name)}`;

        const wrapper = {
            open(name) {
                return nativeCaches.open(prefixed(name));
            },
            has(name) {
                return nativeCaches.has(prefixed(name));
            },
            delete(name) {
                return nativeCaches.delete(prefixed(name));
            },
            keys() {
                return nativeCaches.keys().then(keys => keys
                    .filter(key => key.startsWith(STORAGE_PREFIX))
                    .map(key => key.slice(STORAGE_PREFIX.length)));
            },
            match(...args) {
                return nativeCaches.match(...args);
            },
        };

        try {
            Object.defineProperty(window, 'caches', {
                configurable: true,
                enumerable: true,
                get: () => wrapper,
            });
        } catch (error) {
            console.warn('[Dual SillyTavern] CacheStorage isolation failed:', error);
        }
    }

    function patchBroadcastChannel() {
        if (typeof window.BroadcastChannel !== 'function') return;
        const NativeBroadcastChannel = window.BroadcastChannel;
        window.BroadcastChannel = class DualBroadcastChannel extends NativeBroadcastChannel {
            constructor(name) {
                super(`${STORAGE_PREFIX}${name}`);
            }
        };
    }

    patchIndexedDB();
    patchCaches();
    patchBroadcastChannel();

    function responseJson(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
        });
    }

    function cloneJsonResponse(response, data) {
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.set('content-type', 'application/json; charset=utf-8');
        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }

    async function readRequestText(request) {
        const encoding = request.headers.get('content-encoding') || '';
        const buffer = await request.clone().arrayBuffer();

        if (encoding.includes('gzip') && typeof DecompressionStream === 'function') {
            try {
                const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
                return await new Response(stream).text();
            } catch (_) {
                // Fall through to plain decoding.
            }
        }

        return new TextDecoder().decode(buffer);
    }

    async function readJsonRequest(request) {
        try {
            return JSON.parse(await readRequestText(request));
        } catch (_) {
            return null;
        }
    }

    function virtualSettingsBundle() {
        return {
            ...instance.bundle,
            settings: JSON.stringify(instance.virtualSettings),
        };
    }

    function patchCharacters(data) {
        const patchOne = (character) => {
            if (!character || typeof character !== 'object') return character;
            const avatar = character.avatar;
            const pointer = host.pointerFor?.(side, avatar);
            if (pointer !== undefined) character.chat = pointer;
            return character;
        };

        if (Array.isArray(data)) return data.map(patchOne);
        return patchOne(data);
    }

    async function handleCharactersResponse(response) {
        if (!response.ok) return response;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return response;
        try {
            const data = await response.clone().json();
            return cloneJsonResponse(response, patchCharacters(data));
        } catch (_) {
            return response;
        }
    }

    function makeChatKey(path, body) {
        if (path === '/api/chats/get' || path === '/api/chats/save' || path === '/api/chats/rename' || path === '/api/chats/delete') {
            const avatar = body?.avatar_url || body?.avatar || '';
            const file = body?.file_name || body?.chatfile || body?.original_file || '';
            return avatar && file ? `character:${avatar}:${file}` : null;
        }
        if (path === '/api/chats/group/get' || path === '/api/chats/group/save' || path === '/api/chats/group/rename' || path === '/api/chats/group/delete') {
            const id = body?.id || body?.group_id || '';
            return id ? `group:${id}` : null;
        }
        return null;
    }

    async function handleCharactersEdit(request) {
        try {
            const originalForm = await request.clone().formData();
            const avatar = originalForm.get('avatar_url');
            const chat = originalForm.get('chat');

            if (typeof avatar !== 'string' || typeof chat !== 'string') {
                return null;
            }

            // The `chat` field is the server-side pointer used by the normal ST
            // client to remember the last chat for a character. It cannot be
            // shared between our two virtual clients, so we store it per side
            // and remove it from the server write.
            host.updatePointer?.(side, avatar, chat);

            const cleanForm = new FormData();
            for (const [key, value] of originalForm.entries()) {
                if (key === 'chat') continue;
                cleanForm.append(key, value);
            }

            const headers = new Headers(request.headers);
            headers.delete('content-type');
            headers.delete('content-length');
            const patchedRequest = new Request(request, {
                body: cleanForm,
                headers,
            });
            return await nativeFetch(patchedRequest);
        } catch (error) {
            console.warn('[Dual SillyTavern] Character edit interception failed:', error);
            return null;
        }
    }

    async function handleMergeAttributes(request) {
        const body = await readJsonRequest(request);
        if (!body || typeof body !== 'object') return null;
        if (!Object.prototype.hasOwnProperty.call(body, 'chat') || !body.avatar) return null;

        host.updatePointer?.(side, body.avatar, body.chat || '');
        delete body.chat;

        if (Object.keys(body).length === 1 && body.avatar) {
            return responseJson({ result: 'ok' });
        }

        const headers = new Headers(request.headers);
        headers.delete('content-length');
        const patchedRequest = new Request(request, {
            body: JSON.stringify(body),
            headers,
        });
        return await nativeFetch(patchedRequest);
    }

    window.fetch = async function dualFetch(input, init) {
        const request = input instanceof Request
            ? new Request(input, init)
            : new Request(input, init);
        const url = new URL(request.url, document.baseURI);
        const path = url.pathname;
        const method = request.method.toUpperCase();

        if (method === 'POST' && path === '/api/settings/get') {
            return responseJson(virtualSettingsBundle());
        }

        if (method === 'POST' && path === '/api/settings/save') {
            const payload = await readJsonRequest(request);
            if (payload && typeof payload === 'object') {
                instance.virtualSettings = payload;
                instance.bundle.settings = JSON.stringify(payload);
                host.persistInstance?.(side);
            }
            return responseJson({ result: 'ok' });
        }

        // Snapshot operations are scoped to the virtual settings object.
        if (method === 'POST' && path === '/api/settings/load-snapshot') {
            return new Response(JSON.stringify(instance.virtualSettings), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
            });
        }
        if (method === 'POST' && path === '/api/settings/restore-snapshot') {
            return new Response(null, { status: 204 });
        }
        if (method === 'POST' && path === '/api/settings/make-snapshot') {
            return new Response(null, { status: 204 });
        }

        if (method === 'POST' && path === '/api/characters/edit') {
            const intercepted = await handleCharactersEdit(request);
            if (intercepted) return intercepted;
        }

        if (method === 'POST' && path === '/api/characters/merge-attributes') {
            const intercepted = await handleMergeAttributes(request);
            if (intercepted) return intercepted;
        }

        if (method === 'POST' && (path === '/api/characters/get' || path === '/api/characters/all')) {
            return handleCharactersResponse(await nativeFetch(request));
        }

        // Track which physical chat each virtual instance is currently viewing.
        if (method === 'POST' && path === '/api/chats/get') {
            const body = await readJsonRequest(request);
            const key = makeChatKey(path, body);
            if (key) host.setActiveKey?.(side, key);
            return nativeFetch(request);
        }
        if (method === 'POST' && path === '/api/chats/group/get') {
            const body = await readJsonRequest(request);
            const key = makeChatKey(path, body);
            if (key) host.setActiveKey?.(side, key);
            return nativeFetch(request);
        }

        // Protect whole-file chat saves from the lost-update race described by
        // SillyTavern's own two-window issue: if both clients target the same
        // physical chat file, the second writer is blocked rather than silently
        // overwriting the first client's recent messages.
        if (method === 'POST' && (path === '/api/chats/save' || path === '/api/chats/group/save')) {
            const body = await readJsonRequest(request);
            const key = makeChatKey(path, body);
            if (key && !host.gateWrite?.(side, key)) {
                return responseJson({ error: 'dual_conflict', message: 'This chat is already open in the other Dual SillyTavern pane.' }, 409);
            }
            return nativeFetch(request);
        }

        if (method === 'POST' && (path === '/api/chats/delete' || path === '/api/chats/group/delete')) {
            const body = await readJsonRequest(request);
            const key = makeChatKey(path, body);
            if (key && !host.gateWrite?.(side, key)) {
                return responseJson({ error: 'dual_conflict', message: 'This chat is already open in the other Dual SillyTavern pane.' }, 409);
            }
            const response = await nativeFetch(request);
            if (response.ok && key) host.deleteActiveKey?.(side, key);
            return response;
        }

        if (method === 'POST' && (path === '/api/chats/rename' || path === '/api/chats/group/rename')) {
            const body = await readJsonRequest(request);
            if (body) {
                const oldKey = makeChatKey(path, body);
                const avatar = body.avatar_url || body.avatar || '';
                const oldFile = body.original_file || body.original || '';
                const newFile = body.file_name || body.new_name || body.new_file || '';
                const newKey = path === '/api/chats/group/rename'
                    ? (body.id ? `group:${body.id}` : null)
                    : (avatar && newFile ? `character:${avatar}:${newFile}` : null);

                if (oldKey && !host.gateWrite?.(side, oldKey)) {
                    return responseJson({ error: 'dual_conflict', message: 'This chat is already open in the other Dual SillyTavern pane.' }, 409);
                }
                if (newKey && !host.gateWrite?.(side, newKey)) {
                    return responseJson({ error: 'dual_conflict', message: 'The renamed chat would collide with the other Dual SillyTavern pane.' }, 409);
                }

                const response = await nativeFetch(request);
                if (response.ok && oldKey && newKey) host.renameActiveKey?.(side, oldKey, newKey);
                return response;
            }
        }

        return nativeFetch(request);
    };

    // Ensure the extension itself does not accidentally start a recursive child
    // UI, even if another script re-executes its entry point.
    document.documentElement.dataset.stDualChild = '1';
    window.__ST_DUAL_INSTANCE__ = { side, instance };

    console.info(`[Dual SillyTavern] isolated ${side} instance bootstrap installed.`);
})();
