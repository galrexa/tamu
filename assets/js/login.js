const SKEY_STORAGE  = 'lsSessionKey';
const UNAME_STORAGE = 'lsUsername';

let turnstileToken = "";

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
    err.textContent = msg;
    err.style.display = 'block';
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
            if (typeof turnstile !== 'undefined') turnstile.reset();
            turnstileToken = "";
            return;
        }

        sessionStorage.setItem(SKEY_STORAGE, sKey);
        sessionStorage.setItem(UNAME_STORAGE, u);

        window.location.href = 'dashboard.html';
    } catch (e) {
        showError("Tidak dapat terhubung ke server: " + e.message);
        if (typeof turnstile !== 'undefined') turnstile.reset();
        turnstileToken = "";
    }
}

async function loadConfig() {
    const res = await fetch('proxy.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ method: 'get_client_config' })
    });
    const data = await res.json();
    return data.result || {};
}

function injectTurnstile(sitekey) {
    if (!sitekey || sitekey === 'YOUR_SITE_KEY') {
        showError('Konfigurasi keamanan belum diatur. Hubungi administrator.');
        return;
    }

    // Callback global yang dipanggil Turnstile setelah script-nya selesai dimuat
    window.__onTurnstileLoad = () => {
        if (typeof turnstile === 'undefined') return;
        turnstile.render('#turnstileContainer', {
            sitekey:  sitekey,
            callback: onTurnstileSuccess
        });
    };

    const s = document.createElement('script');
    s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', async () => {
    const passInput = document.getElementById('pass');
    if (passInput) {
        passInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') cekLogin();
        });
    }
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', cekLogin);

    try {
        const cfg = await loadConfig();
        injectTurnstile(cfg.turnstileSiteKey);
    } catch (e) {
        showError('Gagal memuat konfigurasi: ' + e.message);
    }
});
