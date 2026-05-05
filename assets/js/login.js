const SKEY_STORAGE  = 'lsSessionKey';
const UNAME_STORAGE = 'lsUsername';

let turnstileToken  = "";
let turnstileWidget = null;

// Kalau session masih ada, langsung lompat ke dashboard
if (sessionStorage.getItem(SKEY_STORAGE)) {
    window.location.replace('dashboard.html');
}

function onTurnstileSuccess(token) {
    turnstileToken = token;
    document.getElementById('loginBtn').disabled = false;
}

function showError(msg) {
    const err = document.getElementById('errorMsg');
    err.textContent    = msg;
    err.style.display  = 'block';
    const btn = document.getElementById('loginBtn');
    btn.disabled = !turnstileToken;
    btn.querySelector('.btn-text').textContent = 'Masuk ke Dashboard';
}

async function cekLogin() {
    const u   = document.getElementById('user').value.trim();
    const p   = document.getElementById('pass').value;
    const err = document.getElementById('errorMsg');

    err.style.display = 'none';

    if (!turnstileToken) {
        showError("Silakan selesaikan verifikasi keamanan terlebih dahulu.");
        return;
    }
    if (!u || !p) {
        showError("Username dan password harus diisi.");
        return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Memverifikasi...';

    try {
        const res = await fetch('proxy.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                method:         'get_session_key',
                params:         [u, p],
                turnstileToken: turnstileToken
            })
        });
        const data = await res.json();
        const sKey = data.result;

        const gagal = !sKey || (typeof sKey === 'object' && sKey.status);
        if (gagal) {
            const reason = (sKey && sKey.status) ? sKey.status
                         : (data.error ? data.error : 'Username atau password salah.');
            showError(reason);
            resetTurnstile();
            return;
        }

        sessionStorage.setItem(SKEY_STORAGE,  sKey);
        sessionStorage.setItem(UNAME_STORAGE, u);
        window.location.href = 'dashboard.html';

    } catch (e) {
        showError("Tidak dapat terhubung ke server: " + e.message);
        resetTurnstile();
    }
}

function resetTurnstile() {
    turnstileToken = "";
    document.getElementById('loginBtn').disabled = true;
    if (typeof turnstile !== 'undefined' && turnstileWidget !== null) {
        turnstile.reset(turnstileWidget);
    }
}

function injectTurnstile(sitekey) {
    if (!sitekey || sitekey === 'YOUR_SITE_KEY') {
        showError('Konfigurasi keamanan belum diatur. Hubungi administrator.');
        return;
    }

    const container = document.getElementById('turnstileContainer');

    // Cegah double render
    if (container.childElementCount > 0) return;

    if (typeof turnstile !== 'undefined') {
        // Script sudah ada (cache), render langsung
        turnstileWidget = turnstile.render(container, {
            sitekey:  sitekey,
            callback: onTurnstileSuccess,
        });
    } else {
        // Muat script Turnstile, render setelah siap
        window.__onTurnstileLoad = () => {
            if (container.childElementCount > 0) return; // guard kedua
            turnstileWidget = turnstile.render(container, {
                sitekey:  sitekey,
                callback: onTurnstileSuccess,
            });
        };

        const s   = document.createElement('script');
        s.src     = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad&render=explicit';
        s.async   = true;
        s.defer   = true;
        document.head.appendChild(s);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('pass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cekLogin();
    });
    document.getElementById('loginBtn').addEventListener('click', cekLogin);

    try {
        const res = await fetch('proxy.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ method: 'get_client_config' })
        });
        const data = await res.json();
        const cfg  = data.result || {};
        injectTurnstile(cfg.turnstileSiteKey);
    } catch (e) {
        showError('Gagal memuat konfigurasi: ' + e.message);
    }
});