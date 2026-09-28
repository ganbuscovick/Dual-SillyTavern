(() => {
    'use strict';

    // This marker is injected into the child documents before SillyTavern loads
    // its own scripts. The extension must not create another Dual overlay inside
    // a child instance.
    if (document.documentElement?.dataset?.stDualChild === '1' || document.querySelector('meta[name="st-dual-child"]')) {
        return;
    }

    const EXTENSION_ID = 'dual-sillytavern';
    const SESSION_KEY = 'st-dual-sillytavern:v1';
    const SIDES = ['left', 'right'];
    const ctx = window.SillyTavern?.getContext?.();
    const bootstrapUrl = new URL('./bootstrap.js', import.meta.url).href;

    let overlay = null;
    let leftFrame = null;
    let rightFrame = null;
    let divider = null;
    let settingsPanel = null;
    let currentLayout = 'horizontal';
    let splitRatio = 50;
    let lastBaseBundle = null;

    const state = {
        opened: false,
        sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        instances: {
            left: null,
            right: null,
        },
        activeKeys: {
            left: null,
            right: null,
        },
    };

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function requestHeaders() {
        try {
            if (typeof ctx?.getRequestHeaders === 'function') {
                return ctx.getRequestHeaders();
            }
        } catch (_) {
            // Fall through.
        }
        const headers = { 'Content-Type': 'application/json' };
        if (ctx?.token) headers['X-CSRF-Token'] = ctx.token;
        return headers;
    }

    async function getBaseSettingsBundle() {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: requestHeaders(),
            body: '{}',
            cache: 'no-store',
        });
        if (!response.ok) {
            throw new Error(`SillyTavern settings request failed (${response.status})`);
        }
        return await response.json();
    }

    function readStoredSide(side) {
        try {
            const raw = window.sessionStorage.getItem(`${SESSION_KEY}:${side}`);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function writeStoredSide(side) {
        const instance = state.instances[side];
        if (!instance) return;
        try {
            // Keep the persistent copy intentionally small: the rest of the
            // settings bundle (presets, lists, etc.) is refreshed from the
            // server every time the dual view opens.
            window.sessionStorage.setItem(`${SESSION_KEY}:${side}`, JSON.stringify({
                settings: instance.virtualSettings,
                pointers: instance.chatPointers,
            }));
        } catch (error) {
            setStatus(`Could not save the isolated state for ${side}: ${error.message}`, 'warn');
        }
    }

    function clearStoredSides() {
        for (const side of SIDES) {
            try {
                window.sessionStorage.removeItem(`${SESSION_KEY}:${side}`);
            } catch (_) {
                // Ignore storage failures.
            }
        }
    }

    function makeInstance(side, baseBundle) {
        const stored = readStoredSide(side);
        const bundle = clone(baseBundle);
        let virtualSettings;
        let chatPointers = {};

        if (stored?.settings && typeof stored.settings === 'object') {
            virtualSettings = clone(stored.settings);
            if (stored.pointers && typeof stored.pointers === 'object') {
                chatPointers = clone(stored.pointers);
            }
            bundle.settings = JSON.stringify(virtualSettings);
        } else {
            try {
                virtualSettings = JSON.parse(bundle.settings);
            } catch (_) {
                virtualSettings = {};
            }

            // The right-hand instance starts as an independent fresh workspace
            // instead of opening the same active character/chat as the main ST.
            if (side === 'right') {
                virtualSettings.active_character = null;
                virtualSettings.active_group = null;
                virtualSettings.selected_button = 'characters';
            }
        }

        return {
            side,
            bundle,
            virtualSettings,
            chatPointers,
            initialized: false,
        };
    }

    function updatePointer(side, avatar, chat) {
        const instance = state.instances[side];
        if (!instance || !avatar) return;
        instance.chatPointers[String(avatar)] = typeof chat === 'string' ? chat : '';
        writeStoredSide(side);
    }

    function pointerFor(side, avatar) {
        const instance = state.instances[side];
        if (!instance || !avatar) return undefined;
        if (Object.prototype.hasOwnProperty.call(instance.chatPointers, String(avatar))) {
            return instance.chatPointers[String(avatar)];
        }
        return undefined;
    }

    function clearPointer(side, avatar) {
        const instance = state.instances[side];
        if (!instance || !avatar) return;
        delete instance.chatPointers[String(avatar)];
        writeStoredSide(side);
    }

    function makeActiveKey(type, ...parts) {
        return `${type}:${parts.map(x => String(x ?? '')).join(':')}`;
    }

    function setActiveKey(side, key) {
        if (!key) return true;
        state.activeKeys[side] = key;
        const other = side === 'left' ? 'right' : 'left';
        const conflict = state.activeKeys[other] === key;
        if (conflict) {
            setStatus('⚠️ Both panes are on the same chat. Concurrent writes will be blocked to prevent corruption.', 'warn');
        } else {
            setStatus('');
        }
        return !conflict;
    }

    function gateWrite(side, key) {
        const other = side === 'left' ? 'right' : 'left';
        const conflict = Boolean(key && state.activeKeys[other] === key);
        if (conflict) {
            setStatus('🛑 Write blocked: the other pane is using the same chat. Open different chats to continue.', 'error');
            return false;
        }
        state.activeKeys[side] = key;
        setStatus('');
        return true;
    }

    function renameActiveKey(side, oldKey, newKey) {
        if (state.activeKeys[side] === oldKey) {
            state.activeKeys[side] = newKey;
        }
        const other = side === 'left' ? 'right' : 'left';
        if (state.activeKeys[other] === newKey) {
            setStatus('⚠️ The new chat name conflicts with the other pane.', 'warn');
        }
    }

    function deleteActiveKey(side, key) {
        if (state.activeKeys[side] === key) state.activeKeys[side] = null;
    }

    function setStatus(message, kind = '') {
        const node = overlay?.querySelector('.std-status');
        if (!node) return;
        node.textContent = message || '';
        node.className = `std-status ${kind}`.trim();
    }

    function hostApi() {
        return {
            sessionId: state.sessionId,
            instances: state.instances,
            setActiveKey,
            gateWrite,
            renameActiveKey,
            deleteActiveKey,
            updatePointer,
            clearPointer,
            pointerFor,
            persistInstance: writeStoredSide,
            notify: setStatus,
        };
    }

    function publishHostApi() {
        window.__ST_DUAL_HOST__ = hostApi();
    }

    async function buildChildHtml(side) {
        const sourceUrl = new URL('/', window.location.href).href;
        const response = await fetch(sourceUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Could not load the SillyTavern interface (${response.status})`);
        const html = await response.text();

        const marker = `\n<meta name="st-dual-child" content="${escapeAttr(side)}">`;
        const script = `\n<script src="${escapeAttr(bootstrapUrl)}" data-st-dual-bootstrap="${escapeAttr(side)}"></script>`;
        const headInjection = `${marker}${script}\n`;
        const headIndex = html.search(/<head\b[^>]*>/i);

        if (headIndex < 0) {
            throw new Error('The SillyTavern page has no <head>; the isolated instance could not be prepared.');
        }
        const end = html.indexOf('>', headIndex) + 1;
        return html.slice(0, end) + headInjection + html.slice(end);
    }

    function createFrame(side) {
        const frame = document.createElement('iframe');
        frame.className = `std-frame std-frame-${side}`;
        frame.setAttribute('title', `SillyTavern ${side === 'left' ? 'A' : 'B'}`);
        frame.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write');
        // Intentionally no sandbox: the iframe must remain same-origin with
        // the SillyTavern server and retain normal cookies/authentication.
        return frame;
    }

    function applyLayout() {
        if (!overlay) return;
        const panes = overlay.querySelector('.std-panes');
        if (!panes) return;
        panes.dataset.layout = currentLayout;
        panes.style.setProperty('--std-split', `${splitRatio}%`);
        const icon = overlay.querySelector('.std-layout-toggle');
        if (icon) icon.textContent = currentLayout === 'horizontal' ? '↔' : '↕';
    }

    function attachDivider() {
        if (!divider || !overlay) return;
        let dragging = false;

        const move = (event) => {
            if (!dragging) return;
            const panes = overlay.querySelector('.std-panes');
            if (!panes) return;
            const rect = panes.getBoundingClientRect();
            if (currentLayout === 'horizontal') {
                splitRatio = Math.max(20, Math.min(80, ((event.clientX - rect.left) / rect.width) * 100));
            } else {
                splitRatio = Math.max(20, Math.min(80, ((event.clientY - rect.top) / rect.height) * 100));
            }
            applyLayout();
        };

        const up = () => {
            dragging = false;
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
        };

        divider.addEventListener('pointerdown', (event) => {
            dragging = true;
            divider.setPointerCapture?.(event.pointerId);
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
            event.preventDefault();
        });
    }

    function focusSide(side) {
        const frame = side === 'left' ? leftFrame : rightFrame;
        frame?.focus();
    }

    function closeDual() {
        if (!overlay) return;
        state.opened = false;
        state.activeKeys.left = null;
        state.activeKeys.right = null;
        leftFrame?.contentWindow?.postMessage({ type: 'st-dual-before-close' }, '*');
        rightFrame?.contentWindow?.postMessage({ type: 'st-dual-before-close' }, '*');
        overlay.remove();
        overlay = null;
        leftFrame = null;
        rightFrame = null;
        divider = null;
        document.documentElement.classList.remove('std-host-open');
        publishHostApi();
        updatePanelState();
    }

    async function openDual() {
        if (state.opened) return;
        setStatus('Loading both instances…');

        let bundle;
        try {
            bundle = await getBaseSettingsBundle();
        } catch (error) {
            setStatus(`Failed to load SillyTavern settings: ${error.message}`, 'error');
            return;
        }

        lastBaseBundle = clone(bundle);
        state.instances.left = makeInstance('left', bundle);
        state.instances.right = makeInstance('right', bundle);
        publishHostApi();

        overlay = document.createElement('div');
        overlay.id = 'st-dual-overlay';
        overlay.innerHTML = `
            <div class="std-toolbar">
                <div class="std-side-title" data-side="left"><span class="std-dot"></span><span>SillyTavern A</span><button type="button" class="std-mini-reload" data-reload="left" title="Reload A">↻</button></div>
                <div class="std-center-controls">
                    <button type="button" class="std-btn std-layout-toggle" title="Toggle orientation">↔</button>
                    <button type="button" class="std-btn std-reset-sides" title="Clear the saved isolated state for this session">⟳</button>
                    <button type="button" class="std-btn std-close" title="Close Dual SillyTavern">×</button>
                </div>
                <div class="std-side-title" data-side="right"><span class="std-dot"></span><span>SillyTavern B</span><button type="button" class="std-mini-reload" data-reload="right" title="Reload B">↻</button></div>
            </div>
            <div class="std-status" aria-live="polite"></div>
            <div class="std-panes">
                <div class="std-pane" data-pane="left"><div class="std-loading">Opening A…</div></div>
                <div class="std-divider" role="separator" aria-label="Resize panes" tabindex="0"></div>
                <div class="std-pane" data-pane="right"><div class="std-loading">Opening B…</div></div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.documentElement.classList.add('std-host-open');

        currentLayout = window.sessionStorage.getItem(`${SESSION_KEY}:layout`) || 'horizontal';
        splitRatio = Number(window.sessionStorage.getItem(`${SESSION_KEY}:ratio`) || 50);
        if (!Number.isFinite(splitRatio)) splitRatio = 50;

        leftFrame = createFrame('left');
        rightFrame = createFrame('right');
        overlay.querySelector('[data-pane="left"]').appendChild(leftFrame);
        overlay.querySelector('[data-pane="right"]').appendChild(rightFrame);
        divider = overlay.querySelector('.std-divider');
        attachDivider();
        applyLayout();

        overlay.querySelector('.std-close').addEventListener('click', closeDual);
        overlay.querySelector('.std-layout-toggle').addEventListener('click', () => {
            currentLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
            window.sessionStorage.setItem(`${SESSION_KEY}:layout`, currentLayout);
            applyLayout();
        });
        overlay.querySelector('.std-reset-sides').addEventListener('click', () => {
            clearStoredSides();
            setStatus('Isolated state cleared. Close and reopen to recreate A/B from the main SillyTavern state.', 'warn');
        });
        overlay.querySelector('.std-side-title[data-side="left"]').addEventListener('click', (event) => {
            if (!event.target.closest('.std-mini-reload')) focusSide('left');
        });
        overlay.querySelector('.std-side-title[data-side="right"]').addEventListener('click', (event) => {
            if (!event.target.closest('.std-mini-reload')) focusSide('right');
        });

        overlay.querySelectorAll('.std-mini-reload').forEach((button) => {
            button.addEventListener('click', () => {
                const side = button.dataset.reload;
                const frame = side === 'left' ? leftFrame : rightFrame;
                if (!frame) return;
                setStatus(`Reloading ${side === 'left' ? 'A' : 'B'}…`);
                frame.contentWindow?.location.reload();
            });
        });

        const loadOne = async (side, frame) => {
            try {
                const html = await buildChildHtml(side);
                frame.addEventListener('load', () => {
                    state.instances[side].initialized = true;
                    overlay.querySelector(`[data-pane="${side}"] .std-loading`)?.remove();
                }, { once: true });
                frame.srcdoc = html;
            } catch (error) {
                const pane = overlay.querySelector(`[data-pane="${side}"]`);
                if (pane) pane.innerHTML = `<div class="std-error">${escapeAttr(error.message)}</div>`;
            }
        };

        state.opened = true;
        updatePanelState();
        setStatus('');
        await Promise.all([
            loadOne('left', leftFrame),
            loadOne('right', rightFrame),
        ]);
    }

    function updatePanelState() {
        const button = settingsPanel?.querySelector('.std-open-dual');
        const reset = settingsPanel?.querySelector('.std-reset-session');
        if (button) {
            button.textContent = state.opened ? 'Close Dual SillyTavern' : 'Open Dual SillyTavern';
            button.classList.toggle('danger', state.opened);
        }
        if (reset) reset.disabled = state.opened;
    }

    function buildSettingsPanel() {
        if (settingsPanel || !document.querySelector('#extensions_settings')) return;
        settingsPanel = document.createElement('div');
        settingsPanel.id = `${EXTENSION_ID}-settings`;
        settingsPanel.className = 'inline-drawer';
        settingsPanel.innerHTML = `
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Dual SillyTavern</b>
                <span class="std-panel-badge">2 instances</span>
            </div>
            <div class="inline-drawer-content std-settings-content">
                <div class="std-settings-note">
                    Opens two full SillyTavern interfaces in one tab, with isolated settings and storage per pane.
                </div>
                <div class="std-settings-actions">
                    <button type="button" class="menu_button std-open-dual">Open Dual SillyTavern</button>
                    <button type="button" class="menu_button std-reset-session">Reset isolated session state</button>
                </div>
                <div class="std-settings-footnote">
                    A/B can use different chats normally. Concurrent writes to the same chat are blocked to prevent silent corruption.
                </div>
            </div>
        `;
        document.querySelector('#extensions_settings')?.appendChild(settingsPanel);
        settingsPanel.querySelector('.std-open-dual').addEventListener('click', () => state.opened ? closeDual() : openDual());
        settingsPanel.querySelector('.std-reset-session').addEventListener('click', () => {
            clearStoredSides();
            setStatus('Isolated state cleared for the next launch.', 'warn');
        });
        updatePanelState();
    }

    function installKeyboardShortcut() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.opened) {
                closeDual();
            }
        }, true);
    }

    // Expose the host API before any child iframe is created.
    publishHostApi();
    installKeyboardShortcut();

    const tryBuildPanel = () => buildSettingsPanel();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryBuildPanel, { once: true });
    } else {
        tryBuildPanel();
    }

    // SillyTavern normally exposes its extension settings container very early,
    // but a short observer makes the extension resilient to UI initialization
    // order changes.
    const observer = new MutationObserver(() => {
        if (!settingsPanel && document.querySelector('#extensions_settings')) {
            buildSettingsPanel();
        }
        if (settingsPanel) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
