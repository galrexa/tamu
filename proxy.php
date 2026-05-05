<?php
header('Content-Type: application/json');

$config = require __DIR__ . '/config.php';
$apiUrl = $config['apiUrl'];

$input  = json_decode(file_get_contents('php://input'), true);
$method = $input['method'] ?? null;
$params = $input['params'] ?? [];

if (!$method) {
    http_response_code(400);
    echo json_encode(["error" => "Method tidak boleh kosong"]);
    exit;
}

// ── Endpoint internal: serve config publik untuk browser ──
if ($method === 'get_client_config') {
    echo json_encode([
        "result" => [
            "turnstileSiteKey" => $config['turnstileSiteKey'] ?? '',
        ]
    ]);
    exit;
}

// ── Validasi Turnstile sebelum login ──
if ($method === 'get_session_key' && !empty($config['turnstileSecret'])) {
    $token = $input['turnstileToken'] ?? '';
    $check = verifyTurnstile($token, $config['turnstileSecret']);
    if (!$check['ok']) {
        http_response_code(403);
        echo json_encode([
            "error" => "Verifikasi keamanan gagal: " . $check['reason']
        ]);
        exit;
    }
}

// ── Pass-through ke LimeSurvey JSON-RPC ──
$payload = json_encode([
    "method" => $method,
    "params" => $params,
    "id"     => 1
]);

$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_POST,           true);
curl_setopt($ch, CURLOPT_POSTFIELDS,     $payload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER,     ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_TIMEOUT,        15);

$result   = curl_exec($ch);
$err      = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($err) {
    echo json_encode(["error" => "cURL Error: " . $err]);
} elseif ($httpCode !== 200) {
    echo json_encode(["error" => "HTTP Status $httpCode", "raw" => substr($result, 0, 200)]);
} elseif (empty($result)) {
    echo json_encode(["error" => "Server merespons kosong. Pastikan API LimeSurvey sudah aktif."]);
} else {
    echo $result;
}

// ─────────────────────────────────────────────────────────────
function verifyTurnstile(string $token, string $secret): array
{
    if ($token === '') {
        return ['ok' => false, 'reason' => 'Token kosong'];
    }

    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt($ch, CURLOPT_POST,           true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT,        10);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'secret'   => $secret,
        'response' => $token,
        'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
    ]));

    $raw  = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'reason' => 'Tidak dapat menghubungi Cloudflare (' . $err . ')'];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['ok' => false, 'reason' => 'Respons Cloudflare tidak valid'];
    }
    if (empty($data['success'])) {
        $codes = isset($data['error-codes']) ? implode(', ', $data['error-codes']) : 'unknown';
        return ['ok' => false, 'reason' => 'Token ditolak (' . $codes . ')'];
    }
    return ['ok' => true, 'reason' => ''];
}
