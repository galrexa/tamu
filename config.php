<?php
// Konfigurasi yang dipakai proxy.php.
// JANGAN commit kredensial asli — tambahkan file ini ke .gitignore atau
// gunakan variabel environment / file .env terpisah di production.

return [
    // Endpoint LimeSurvey RemoteControl 2 JSON-RPC
    'apiUrl' => 'https://forms.bappisus.go.id/index.php?r=admin/remotecontrol',

    // Cloudflare Turnstile — site key (public, aman dikirim ke browser)
    'turnstileSiteKey' => 'YOUR_SITE_KEY',

    // Cloudflare Turnstile — secret key (RAHASIA, hanya untuk verifikasi server-side)
    // Kosongkan untuk menonaktifkan validasi token di server.
    'turnstileSecret'  => '',
];
