const SID   = 878132;
const SKEY_STORAGE  = 'lsSessionKey';
const UNAME_STORAGE = 'lsUsername';

let allResponses = [];   // raw dari LimeSurvey (cache)
let allTamu      = [];   // hasil filter sesuai selectedDate
let selectedDate = todayYMD();

function todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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
            const status = String(dataRes.result.status);
            const lower  = status.toLowerCase();

            // Survey kosong — bukan error, tampilkan empty state
            if (lower.includes('no data')) {
                allResponses = [];
                applyDateFilter();
                document.getElementById('liveBadge').style.display = 'inline-flex';
                return;
            }

            // Session bermasalah — baru logout
            if (lower.includes('invalid session') || lower.includes('invalid token')) {
                sessionStorage.removeItem(SKEY_STORAGE);
                renderEmpty('Sesi berakhir. Silakan login ulang.');
                setTimeout(logout, 1500);
                return;
            }

            // Error lain (mis. "No permission") — tampilkan tanpa logout
            renderEmpty('Tidak dapat memuat data: ' + status);
            return;
        }

        if (dataRes.result) {
            const decoded = JSON.parse(atob(dataRes.result));
            allResponses = decoded.responses || [];
            applyDateFilter();
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

function formatJam(dateInput) {
    if (!dateInput) return '—';
    const m = String(dateInput).match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    return m ? `${m[1].padStart(2,'0')}:${m[2]}` : '—';
}

function splitNama(nama) {
    if (!nama) return [];
    return String(nama).split(',').map(s => s.trim()).filter(Boolean);
}

function renderNamaCell(nama) {
    const list = splitNama(nama);
    if (list.length === 0) return '<div class="tamu-name">—</div>';
    if (list.length === 1) return `<div class="tamu-name">${escHtml(list[0])}</div>`;
    return `<ul class="nama-list">${list.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>`;
}

function renderTable(list) {
    const body = document.getElementById('tamuBody');
    if (!list || !list.length) {
        renderEmpty("Belum ada tamu terdaftar pada tanggal ini.");
        return;
    }
    body.innerHTML = list.map(t => `
        <tr>
            <td class="td-waktu">${escHtml(formatJam(t["Tanggal pengiriman"] || t.submitdate))}</td>
            <td>${renderNamaCell(t["Nama"])}</td>
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
    const totalOrang  = list.reduce((sum, t) => sum + Math.max(splitNama(t["Nama"]).length, 1), 0);
    document.getElementById('statTotal').textContent    = totalOrang;
    document.getElementById('statInstansi').textContent = instansiSet.size;
    document.getElementById('statJam').textContent      =
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function filterTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    if (!q) { renderTable(allTamu); return; }
    const filtered = allTamu.filter(t => {
        const namaList = splitNama(t["Nama"]).map(n => n.toLowerCase());
        return namaList.some(n => n.includes(q))
            || (t["Instansi/Lembaga/Individu"] || '').toLowerCase().includes(q)
            || (t["Pejabat yang dituju"] || '').toLowerCase().includes(q);
    });
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

// Cek apakah string tanggal sama dengan target YYYY-MM-DD (timezone lokal browser).
// Mendukung format: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, DD/MM/YYYY, DD-MM-YYYY.
function isSameDate(dateInput, targetYMD) {
    if (!dateInput || !targetYMD) return false;

    const [ty, tm, td] = targetYMD.split('-').map(Number);
    const s = String(dateInput).trim();

    // ISO: 2026-05-05 atau 2026-05-05 14:30:00
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return +m[1] === ty && +m[2] === tm && +m[3] === td;

    // ID format: 05/05/2026 atau 05-05-2026
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return +m[3] === ty && +m[2] === tm && +m[1] === td;

    // Fallback: biarkan Date parser yang coba
    const d = new Date(s);
    if (isNaN(d)) return false;
    return d.getFullYear() === ty
        && d.getMonth() + 1 === tm
        && d.getDate() === td;
}

function filterTamuByDate(list, targetYMD) {
    return (list || []).filter(t => {
        const visit = t["Tanggal Kunjungan"];
        if (visit) return isSameDate(visit, targetYMD);
        return isSameDate(t["Tanggal pengiriman"] || t.submitdate, targetYMD);
    });
}

function applyDateFilter() {
    allTamu = filterTamuByDate(allResponses, selectedDate);
    renderTable(allTamu);
    updateStats(allTamu);
    updateLastUpdateLabel();
}

function updateLastUpdateLabel() {
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    const now     = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    document.getElementById('lastUpdate').textContent =
        `Tanggal: ${dateStr} • Diperbarui: ${timeStr}`;

    const isHariIni = selectedDate === todayYMD();
    document.getElementById('statTotalLabel').textContent =
        isHariIni ? 'Total Tamu Hari Ini' : `Total Tamu ${dateStr}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const uname = sessionStorage.getItem(UNAME_STORAGE);
    if (uname) showUserChip(uname);

    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', () => muatData());
    document.getElementById('searchInput').addEventListener('input', filterTable);

    const dateInput = document.getElementById('dateFilter');
    dateInput.value = selectedDate;
    dateInput.addEventListener('change', () => {
        selectedDate = dateInput.value || todayYMD();
        applyDateFilter();
    });

    document.getElementById('todayBtn').addEventListener('click', () => {
        selectedDate = todayYMD();
        dateInput.value = selectedDate;
        applyDateFilter();
    });

    muatData();
    startAutoUpdate();
});
