// ===== Backend Configuration (Dynamic - fetched from backend) =====
// Single source of truth: backend/.env via GET /api/config

window.__QR_CONFIG__ = null;
let _configPromise = null;

async function loadConfig() {
    if (window.__QR_CONFIG__) return window.__QR_CONFIG__;
    if (_configPromise) return _configPromise;

    _configPromise = (async () => {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`Failed to load config (HTTP ${response.status})`);
        }
        const data = await response.json();
        if (!data.CONTRACT_ADDRESS || !data.USDT_TRC20_ADDRESS || !data.WC_PROJECT_ID) {
            throw new Error('Backend config incomplete — check backend/.env');
        }
        window.__QR_CONFIG__ = data;
        console.log('[Config] Loaded from backend');
        return data;
    })().catch((error) => {
        _configPromise = null;
        console.error('[Config] Failed:', error);
        throw error;
    });

    return _configPromise;
}
