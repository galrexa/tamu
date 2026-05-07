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
        console.log('[muatData] sKey present:', !!sKey, 'length:', sKey ? sKey.length : 0);

        if (!sKey) {
            console.warn('[muatData] No session key in storage → logout');
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
        console.log('[muatData] response:', dataRes);

        if (dataRes.result && typeof dataRes.result === 'object' && dataRes.result.status) {
            const status = String(dataRes.result.status);
            const lower  = status.toLowerCase();
            console.warn('[muatData] LimeSurvey status:', status);

            // Survey kosong — bukan error, tampilkan empty state
            if (lower.includes('no data') || lower.includes('tidak ada data')) {
                allResponses = [];
                applyDateFilter();
                document.getElementById('liveBadge').style.display = 'inline-flex';
                return;
            }

            // Session bermasalah — baru logout
            if (lower.includes('invalid session') || lower.includes('invalid token')
             || lower.includes('sesi tidak valid') || lower.includes('kunci sesi')) {
                console.warn('[muatData] Session invalid → triggering logout');
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

function resolvePejabat(t) {
    const val = t["Pejabat yang dituju"];
    if (val && val.trim().toLowerCase() === 'lainnya') {
        return t["Pejabat yang dituju [Lainnya]"] || 'Lainnya';
    }
    return val || '—';
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
            <td>${escHtml(resolvePejabat(t))}</td>
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
    const dateStr = dateObj.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const shortDate = dateObj.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

    document.getElementById('liveDate').textContent = dateStr;

    const now     = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    const lastUpdateEl = document.getElementById('lastUpdate');
    lastUpdateEl.textContent = `Data diperbarui pukul ${timeStr}`;

    const isHariIni = selectedDate === todayYMD();
    document.getElementById('statTotalLabel').textContent =
        isHariIni ? 'Total Tamu Hari Ini' : `Total Tamu ${shortDate}`;
}

// ── EKSPOR ────────────────────────────────────────────────────────────────────

function buildExportRows(list) {
    const rows = [];
    (list || []).forEach(t => {
        const namaList  = splitNama(t["Nama"]);
        const names     = namaList.length ? namaList : ['—'];
        const dateRaw   = t["Tanggal pengiriman"] || t.submitdate || '';
        const dateObj   = dateRaw ? new Date(dateRaw) : null;
        const tanggal   = dateObj && !isNaN(dateObj)
            ? dateObj.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' })
            : (selectedDate.split('-').reverse().join('/'));
        const hari      = dateObj && !isNaN(dateObj)
            ? dateObj.toLocaleDateString('id-ID', { weekday:'long' })
            : new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday:'long' });
        const waktu     = formatJam(dateRaw);
        const instansi  = t["Instansi/Lembaga/Individu"] || '—';
        const pejabat   = resolvePejabat(t);
        const email     = t["Email"] || '—';
        const telp      = t["Nomor Telepon"] || '—';

        names.forEach(nama => {
            rows.push({ tanggal, hari, waktu, nama, instansi, pejabat, email, telp });
        });
    });
    return rows;
}

function exportFilename(ext) {
    return `BukuTamu_${selectedDate}.${ext}`;
}

function exportCSV() {
    const rows    = buildExportRows(allTamu);
    const headers = ['No','Tanggal','Hari','Waktu','Nama','Instansi','Pejabat Tujuan','Email','Nomor Telepon'];
    const escape  = v => `"${String(v).replace(/"/g, '""')}"`;
    const lines   = [
        headers.map(escape).join(','),
        ...rows.map((r, i) => [
            i + 1, r.tanggal, r.hari, r.waktu,
            r.nama, r.instansi, r.pejabat, r.email, r.telp
        ].map(escape).join(','))
    ];

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, exportFilename('csv'));
}

function exportXLSX() {
    const rows      = buildExportRows(allTamu);
    const dateLabel = new Date(selectedDate + 'T00:00:00')
        .toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    const COLS      = 9;
    const lastCol   = XLSX.utils.encode_col(COLS - 1);

    const wb = XLSX.utils.book_new();
    const ws = {};

    // Baris 1: judul
    ws['A1'] = { v: 'Rekap Harian Tamu Bappisus', t: 's', s: {
        font:      { bold: true, sz: 14, color: { rgb: '0D2545' } },
        alignment: { horizontal: 'center', vertical: 'center' }
    }};

    // Baris 2: tanggal
    ws['A2'] = { v: `Tanggal: ${dateLabel}`, t: 's', s: {
        font:      { sz: 11, color: { rgb: '6B7280' } },
        alignment: { horizontal: 'center', vertical: 'center' }
    }};

    // Baris 3: kosong
    ws['A3'] = { v: '', t: 's' };

    // Baris 4: header kolom
    const headers = ['No','Tanggal','Hari','Waktu','Nama','Instansi','Pejabat Tujuan','Email','Nomor Telepon'];
    const headerStyle = {
        font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill:      { fgColor: { rgb: '0D2545' } },
        alignment: { horizontal: 'center', vertical: 'center' }
    };
    headers.forEach((h, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 3, c: ci });
        ws[addr] = { v: h, t: 's', s: headerStyle };
    });

    // Baris 5+: data
    rows.forEach((r, ri) => {
        const vals = [ri + 1, r.tanggal, r.hari, r.waktu, r.nama, r.instansi, r.pejabat, r.email, r.telp];
        vals.forEach((v, ci) => {
            const addr = XLSX.utils.encode_cell({ r: ri + 4, c: ci });
            ws[addr] = { v, t: ci === 0 ? 'n' : 's', s: {
                alignment: { vertical: 'center', wrapText: true }
            }};
        });
    });

    // Range
    ws['!ref'] = `A1:${lastCol}${rows.length + 4}`;

    // Merge judul & tanggal
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    ];

    // Lebar kolom
    ws['!cols'] = [
        { wch: 4  },  // No
        { wch: 12 },  // Tanggal
        { wch: 12 },  // Hari
        { wch: 7  },  // Waktu
        { wch: 28 },  // Nama
        { wch: 28 },  // Instansi
        { wch: 22 },  // Pejabat
        { wch: 26 },  // Email
        { wch: 15 },  // Telepon
    ];

    // Tinggi baris judul
    ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 8 }, { hpt: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Buku Tamu');
    XLSX.writeFile(wb, exportFilename('xlsx'));
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── LIVE CLOCK ────────────────────────────────────────────────────────────────

function startLiveClock() {
    function tick() {
        const now = new Date();
        const jam  = String(now.getHours()).padStart(2,'0');
        const mnt  = String(now.getMinutes()).padStart(2,'0');
        const dtk  = String(now.getSeconds()).padStart(2,'0');
        document.getElementById('liveClock').textContent = `${jam}:${mnt}:${dtk}`;
    }
    tick();
    setInterval(tick, 1000);
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

    // Ekspor dropdown
    const exportBtn      = document.getElementById('exportBtn');
    const exportDropdown = document.getElementById('exportDropdown');

    exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = exportDropdown.style.display === 'block';
        exportDropdown.style.display = isOpen ? 'none' : 'block';
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
        exportDropdown.style.display = 'none';
        exportCSV();
    });

    document.getElementById('exportXlsxBtn').addEventListener('click', () => {
        exportDropdown.style.display = 'none';
        exportXLSX();
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('exportWrap').contains(e.target)) {
            exportDropdown.style.display = 'none';
        }
    });

    startLiveClock();
    muatData();
    startAutoUpdate();
});
