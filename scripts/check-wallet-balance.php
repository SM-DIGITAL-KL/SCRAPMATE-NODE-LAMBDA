<?php
/**
 * Check wallet balance using 4SMS API
 * Uses PHP signature generation method
 */

// Credentials
$accessToken = "9KOTMY69K6EW8G7";
$accessTokenKey = "*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^";

// Base URL for 4SMS API
$baseUrl = "http://4sms.alp-ts.com/api/sms/v1.0";

// Request For
$requestFor = "get-wallet-balance";

// Unix Epoch Time
$expire = strtotime("+1 minute");

// MD5 algorithm is hash function producing a 128-bit hash value.
$timeKey = md5($requestFor."account@rits-v1.0".$expire);
$timeAccessTokenKey = md5($accessToken.$timeKey);
$signature = md5($timeAccessTokenKey.$accessTokenKey);

echo "💰 Checking Wallet Balance\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

echo "📋 Configuration:\n";
echo "   Access Token: $accessToken\n";
echo "   Access Token Key: " . substr($accessTokenKey, 0, 10) . "..." . substr($accessTokenKey, -5) . "\n";
echo "   Request For: $requestFor\n";
echo "   Expire (Unix timestamp): $expire\n";
echo "   Expire (Human readable): " . date('Y-m-d H:i:s', $expire) . "\n\n";

echo "🔐 Signature Generation (PHP Method):\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "   Step 1: timeKey = md5(\"$requestFor" . "account@rits-v1.0$expire\")\n";
echo "          = $timeKey\n";
echo "   Step 2: timeAccessTokenKey = md5(\"$accessToken\" + \"$timeKey\")\n";
$timeAccessTokenKey = md5($accessToken.$timeKey);
echo "          = $timeAccessTokenKey\n";
echo "   Step 3: signature = md5(\"$timeAccessTokenKey\" + \"$accessTokenKey\")\n";
$signature = md5($timeAccessTokenKey.$accessTokenKey);
echo "          = $signature\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

// Build URL with query parameters (GET request)
$params = http_build_query([
    'accessToken' => $accessToken,
    'expire' => $expire,
    'authSignature' => $signature,
]);

$url = "$baseUrl/$requestFor?$params";

echo "📤 Sending Wallet Balance Request:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "   URL: $url\n";
echo "   Method: GET\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

// Make the request using cURL
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => '',
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => 'GET',
]);

$response = curl_exec($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$error = curl_error($curl);

curl_close($curl);

if ($error) {
    echo "❌ cURL Error: $error\n";
    exit(1);
}

echo "✅ Response Received:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "   HTTP Status: $httpCode\n";
echo "   Response: $response\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

$responseData = json_decode($response, true);

if ($httpCode === 200 && $responseData && $responseData['status'] === 'success') {
    echo "✅ Wallet Balance Retrieved Successfully!\n\n";
    if (isset($responseData['data']['balance'])) {
        echo "💰 Current Wallet Balance: " . $responseData['data']['balance'] . "\n\n";
    } elseif (isset($responseData['data']['walletBalance'])) {
        echo "💰 Current Wallet Balance: " . $responseData['data']['walletBalance'] . "\n\n";
    } else {
        echo "💰 Wallet Data: " . json_encode($responseData['data'], JSON_PRETTY_PRINT) . "\n\n";
    }
} else {
    echo "❌ Wallet Balance Check Failed!\n\n";
    if ($responseData) {
        echo "   Error Message: " . ($responseData['message'] ?? 'Unknown error') . "\n";
        if (isset($responseData['httpStatusCode']) && $responseData['httpStatusCode'] === 401) {
            echo "\n⚠️  Authorization Failed!\n";
            echo "   The credentials (Access Token or Access Token Key) are incorrect.\n";
            echo "   Please verify the credentials from your 4SMS panel.\n\n";
        } elseif (isset($responseData['httpStatusCode']) && $responseData['httpStatusCode'] === 402) {
            echo "\n⚠️  Insufficient Balance!\n";
            echo "   The wallet has insufficient balance. Please recharge your wallet.\n\n";
        }
    }
    exit(1);
}

