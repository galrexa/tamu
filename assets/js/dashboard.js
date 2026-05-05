const SID   = 878132;
const SKEY_STORAGE  = 'lsSessionKey';
const UNAME_STORAGE = 'lsUsername';

let allTamu = [];

// Guard: tanpa session key, kembali ke login
if (!sessionStorage.getItem(SKEY_STORAGE)) {
    window.location.replace('index.html');
}

function showUserChip(uname) {
    if (!uname) return;
    document.getElementById('userName').textContent   = uname;
    document.getElementById('userAvatar').textContent = uname.charAt(0);
    document.getElementById('userChip').style.display = 'inline-flex';
}

async function logout() {
    const sKey = sessionStorage.getItem(SKEY_STORAGE);
    if (sKey) {
        try {
            await fetch('proxy.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ method: 'release_session_key', params: [sKey] })
            });
        } catch (e) { /* abaikan, tetap logout lokal */ }
    }
    sessionStorage.removeItem(SKEY_STORAGE);
    sessionStorage.removeItem(UNAME_STORAGE);
    window.location.replace('index.html');
}

async function muatData(isSilent = false) {
    const btn = document.getElementById('refreshBtn');
    if (!isSilent) {
        btn.textContent = 'Memperbarui...';
        btn.disabled = true;
    }

    try {
        const sKey = sessionStorage.getItem(SKEY_STORAGE);
        if (!sKey) {
            renderEmpty('Sesi tidak ditemukan. Silakan login ulang.');
            setTimeout(logout, 1200);
            return;
        }

        const dataReq = await fetch('proxy.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                method: 'export_responses',
                params: [sKey, SID, 'json', null, 'all', 'full', 'long']
            })
        });
        const dataRes = await dataReq.json();

        if (dataRes.result && typeof dataRes.result === 'object' && dataRes.result.status) {
            sessionStorage.removeItem(SKEY_STORAGE);
            renderEmpty('Sesi berakhir: ' + dataRes.result.status + '. Silakan login ulang.');
            setTimeout(logout, 1500);
            return;
        }

        if (dataRes.result) {
            const decoded = JSON.parse(atob(dataRes.result));
            allTamu = decoded.responses || [];
            renderTable(allTamu);
            updateStats(allTamu);

            const now = new Date();
            document.getElementById('lastUpdate').textContent =
                'Diperbarui: ' + now.toLocaleString('id-ID', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
            document.getElementById('liveBadge').style.display = 'inline-flex';
        } else {
            renderEmpty("Tidak ada data yang tersedia.");
        }
    } catch (err) {
        console.error("Fetch error:", err);
        if (!isSilent) renderEmpty("Gagal memuat data. Periksa koneksi ke server.");
    } finally {
        btn.textContent = 'Perbarui Data';
        btn.disabled    = false;
    }
}

function renderTable(list) {
    const body = document.getElementById('tamuBody');
    if (!list || !list.length) {
        renderEmpty("Belum ada tamu terdaftar hari ini.");
        return;
    }
    body.innerHTML = list.map(t => `
        <tr>
            <td class="td-waktu">${escHtml(t["Tanggal Kunjungan"] || '—')}</td>
            <td><div class="tamu-name">${escHtml(t["Nama"] || '—')}</div></td>
            <td><span class="badge-instansi" title="${escHtml(t["Instansi/Lembaga/Individu"] || '')}">${escHtml(t["Instansi/Lembaga/Individu"] || '—')}</span></td>
            <td>${escHtml(t["Pejabat yang dituju"] || '—')}</td>
            <td class="td-contact">
                ${escHtml(t["Email"] || '—')}<br>
                <small>${escHtml(t["Nomor Telepon"] || '')}</small>
            </td>
        </tr>`).join('');
}

function renderEmpty(msg) {
    document.getElementById('tamuBody').innerHTML =
        `<tr><td colspan="5" class="empty-state">${msg}</td></tr>`;
}

function updateStats(list) {
    const instansiSet = new Set(list.map(t => t["Instansi/Lembaga/Individu"]).filter(Boolean));
    document.getElementById('statTotal').textContent    = list.length;
    document.getElementById('statInstansi').textContent = instansiSet.size;
    document.getElementById('statJam').textContent      =
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function filterTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    if (!q) { renderTable(allTamu); return; }
    const filtered = allTamu.filter(t =>
        (t["Nama"] || '').toLowerCase().includes(q) ||
        (t["Instansi/Lembaga/Individu"] || '').toLowerCase().includes(q) ||
        (t["Pejabat yang dituju"] || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
}

function startAutoUpdate() {
    setInterval(() => muatData(true), 30000);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    const uname = sessionStorage.getItem(UNAME_STORAGE);
    if (uname) showUserChip(uname);

    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', () => muatData());
    document.getElementById('searchInput').addEventListener('input', filterTable);

    muatData();
    startAutoUpdate();
});
