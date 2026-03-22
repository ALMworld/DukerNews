/**
 * Tauri Fetch Setup + WalletConnect Verify Iframe Interceptor
 *
 * 1. Overrides window.fetch with Tauri's native HTTP plugin (bypasses CORS & cookie issues)
 * 2. Intercepts the WalletConnect Verify iframe and rewrites its origin parameter
 *    from tauri://localhost to https://app.bagua.world so attestation succeeds
 * 3. Spoofs window.location properties so WalletConnect SDK reports the correct dApp URL
 */

export const PROD_ORIGIN = 'https://app.bagua.world';

/**
 * Check if we're running in a Tauri environment
 */
export const isTauri =
    typeof window !== 'undefined' &&
    (typeof (window as any).__TAURI__ !== 'undefined' ||
        typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' ||
        window.location.protocol === 'tauri:');


/**
 * Observe the DOM for WalletConnect verify iframes.
 * Instead of letting the iframe load (which would postMessage to the wrong origin),
 * we fetch the attestation URL ourselves, extract the JWT, and post it to the window.
 */
function interceptVerifyIframe() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLIFrameElement)) continue;

                const src = node.src || node.getAttribute('src') || '';
                if (!src.includes('verify.walletconnect.') || !src.includes('attestation')) continue;

                // Rewrite origin in the URL and fetch it ourselves
                try {
                    const url = new URL(src);
                    const origin = url.searchParams.get('origin');
                    if (origin && origin.startsWith('tauri://')) {
                        url.searchParams.set('origin', PROD_ORIGIN);

                        // Prevent the iframe from loading (it would postMessage to wrong origin)
                        node.src = 'about:blank';

                        // Fetch attestation ourselves and post the result
                        console.log('[TauriFetch] Intercepting verify attestation, fetching directly...');
                        fetch(url.toString())
                            .then(res => res.text())
                            .then(html => {
                                // The response contains JS like:
                                //   window.parent.postMessage(JSON.stringify({
                                //     type: "verify_attestation",
                                //     attestation: "eyJ..."
                                //   }), "https://app.bagua.world")
                                // Extract the attestation JWT directly
                                const match = html.match(/attestation:\s*\n?\s*"([^"]+)"/);
                                if (match) {
                                    const data = {
                                        type: 'verify_attestation',
                                        attestation: match[1],
                                    };
                                    console.log('[TauriFetch] Got attestation, posting to self');
                                    window.postMessage(JSON.stringify(data), '*');
                                } else {
                                    console.warn('[TauriFetch] Could not extract attestation from response:', html.substring(0, 200));
                                }
                            })
                            .catch(e => console.warn('[TauriFetch] Failed to fetch attestation:', e));
                    }
                } catch (e) {
                    console.warn('[TauriFetch] Failed to intercept verify iframe:', e);
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    console.log('[TauriFetch] Verify iframe interceptor active');
}

/**
 * Initialize Tauri-specific fetch overrides.
 * Call this early in app startup (before any fetch calls).
 */
export async function initTauriFetch() {
    if (!isTauri) return;

    try {
        // 1. Override window.fetch with Tauri's native HTTP plugin
        const { setupTauriFetch } = await import('@daveyplate/tauri-fetch');
        setupTauriFetch();
        console.log('[TauriFetch] Native fetch override active');
    } catch (e) {
        console.warn('[TauriFetch] Failed to setup tauri-fetch:', e);
    }

    // 2. Intercept WalletConnect verify iframes
    interceptVerifyIframe();

    // 3. Force WebSocket reconnect when app returns from background
    setupForegroundReconnect();
}
/**
 * On mobile, WebSocket connections are killed when the browser tab goes to background
 * (e.g. user switches to wallet app to approve a WalletConnect request).
 * WalletConnect SDK listens for 'online' events to trigger reconnection.
 * We fire these events when the tab returns to foreground.
 *
 * KEY INSIGHT: wagmi's reconnect() only works for connectors that were previously
 * stored in localStorage (i.e., connections that were completed). On mobile,
 * the connection is never completed before iOS kills the tab. The WC pairing
 * data IS safely stored in IndexedDB, but nobody initializes the WC connector
 * to read it.
 *
 * FIX: When we detect a pending WC pairing (via localStorage flag set before
 * deep-linking), we use connect() instead of reconnect() to force-initialize
 * the WC connector, which reads IndexedDB and picks up the queued approval.
 */
export function setupForegroundReconnect() {
    if (typeof document === 'undefined') return;

    let wasHidden = false;

    // Helper to safely check/clear the pending flag
    const checkAndClearPendingPairing = () => {
        try {
            const hasPending = localStorage.getItem('wc_pending_pairing') === '1';
            if (hasPending) {
                localStorage.removeItem('wc_pending_pairing');
            }
            return hasPending;
        } catch {
            return false;
        }
    };

    // Helper to attempt connection
    const attemptReconnect = (isPendingPairing: boolean) => {
        import('../config/wagmi').then(({ wagmiConfig }) => {
            import('wagmi/actions').then(({ connect, reconnect, getAccount }) => {
                const account = getAccount(wagmiConfig);

                // If fully connected, we're good.
                if (account.isConnected) {
                    console.log('[Reconnect] Already connected, skipping.');
                    return;
                }

                // In Tauri environment, the WebSocket is killed abruptly by iOS and might not 
                // resume gracefully with just an online event. We may need to force a new 
                // connect() attempt even if status is 'connecting'. In standard browsers (Safari),
                // we MUST let it finish naturally otherwise the Promise is cancelled.
                if (!isTauri && (account.status === 'connecting' || account.status === 'reconnecting')) {
                    console.log('[Reconnect] Connection already in progress, skipping (Browser).');
                    return;
                }

                if (isPendingPairing) {
                    console.log('[Reconnect] Pending WC pairing detected — force-connecting WC connector...');

                    const wcConnector = wagmiConfig.connectors.find(c => c.id === 'walletConnect');
                    if (wcConnector) {
                        const retryDelays = [1000, 3000, 6000, 9000];
                        for (const delay of retryDelays) {
                            setTimeout(() => {
                                const currentAccount = getAccount(wagmiConfig);
                                if (currentAccount.isConnected) return;
                                if (!isTauri && currentAccount.status === 'connecting') return;

                                console.log(`[Reconnect] Attempting connect() with WC connector at ${delay}ms`);
                                connect(wagmiConfig, { connector: wcConnector }).catch(e => {
                                    console.log(`[Reconnect] WC connect attempt failed:`, e?.message);
                                });
                            }, delay);
                        }
                    }
                } else {
                    // Normal reconnect for established sessions
                    console.log('[Reconnect] Standard reconnect attempt...');
                    const retryDelays = [500, 1500, 3000, 5000];
                    for (const delay of retryDelays) {
                        setTimeout(() => {
                            const currentAccount = getAccount(wagmiConfig);
                            if (currentAccount.isConnected) return;
                            if (!isTauri && currentAccount.status === 'reconnecting') return;

                            reconnect(wagmiConfig).catch(() => { });
                            console.log(`[Reconnect] wagmi reconnect attempt at ${delay}ms`);
                        }, delay);
                    }
                }
            });
        }).catch(() => { });
    };

    // 1. Handle warm starts (returning to tab)
    let lastForegroundTime = 0;

    const handleForeground = () => {
        const now = Date.now();
        // Debounce to prevent multiple triggers if multiple events fire
        if (now - lastForegroundTime < 1500) return;
        lastForegroundTime = now;

        console.log('[Reconnect] App returned to foreground, triggering reconnect...');
        window.dispatchEvent(new CustomEvent('walletconnect-foreground'));

        setTimeout(() => {
            window.dispatchEvent(new Event('online'));
            window.dispatchEvent(new Event('focus'));
        }, 300);

        const hasPending = checkAndClearPendingPairing();

        // In Tauri iOS, if wagmi is stuck in "connecting", firing online might not be enough.
        // We let attemptReconnect evaluate whether to force connect based on isTauri flag.
        attemptReconnect(hasPending);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            handleForeground();
        }
    });

    window.addEventListener('focus', handleForeground);
    window.addEventListener('pageshow', handleForeground);

    // 2. Handle cold starts (app freshly launched or iOS killed the background tab)
    // Wait a brief moment to ensure wagmi is initialized
    setTimeout(() => {
        const hasPending = checkAndClearPendingPairing();
        if (hasPending) {
            console.log('[Reconnect] Cold start detected with pending pairing.');
            attemptReconnect(true);
        }
    }, 1000);

    console.log('[Reconnect] Foreground reconnect listeners active');
}



