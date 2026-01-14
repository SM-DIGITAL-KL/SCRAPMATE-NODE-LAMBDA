<?php
/**
 * Send SMS using 4SMS API with PHP signature generation
 * This script can be used to test SMS sending or send to a list of users
 */

// Credentials
$accessToken = "9KOTMY69K6EW8G7";
$accessTokenKey = "*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^";
$entityId = "1701173389563945545"; // May need to be different for new credentials
$smsHeader = "SCRPMT";
$templateId = "1707173856462706835";

// SMS API URL
$smsApiUrl = "http://4sms.alp-ts.com/api/sms/v1.0/send-sms";

// Test phone number (can be overridden via command line)
$testPhone = isset($argv[1]) ? $argv[1] : "9074135121";
$testMessage = isset($argv[2]) ? $argv[2] : "Test message from PHP script";

/**
 * Generate SMS signature using PHP method
 */
function smsSignatureApi4($expire, $accessToken, $accessTokenKey) {
    // Request For may vary eg. send-sms, send-sms-array, send-dynamic-sms, etc..
    $requestFor = "send-sms";
    
    // MD5 algorithm is hash function producing a 128-bit hash value.
    $timeKey = md5($requestFor."sms@rits-v1.0".$expire);
    $timeAccessTokenKey = md5($accessToken.$timeKey);
    $signature = md5($timeAccessTokenKey.$accessTokenKey);
    
    return $signature;
}

echo "📤 Sending SMS via PHP\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

// Generate expire timestamp
$expire = strtotime("+1 minute");
$signature = smsSignatureApi4($expire, $accessToken, $accessTokenKey);

echo "📋 Configuration:\n";
echo "   Access Token: $accessToken\n";
echo "   Access Token Key: " . substr($accessTokenKey, 0, 10) . "..." . substr($accessTokenKey, -5) . "\n";
echo "   Entity ID: $entityId\n";
echo "   SMS Header: $smsHeader\n";
echo "   Template ID: $templateId\n";
echo "   Phone: $testPhone\n";
echo "   Message: $testMessage\n";
echo "   Expire (Unix timestamp): $expire\n";
echo "   Expire (Human readable): " . date('Y-m-d H:i:s', $expire) . "\n\n";

echo "🔐 Signature:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "   Signature: $signature\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

// Prepare POST data
$postData = http_build_query([
    'accessToken' => $accessToken,
    'expire' => $expire,
    'authSignature' => $signature,
    'route' => 'transactional',
    'smsHeader' => $smsHeader,
    'messageContent' => $testMessage,
    'recipients' => $testPhone,
    'entityId' => $entityId,
    'templateId' => $templateId,
]);

echo "📤 Sending SMS Request:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "   URL: $smsApiUrl\n";
echo "   Method: POST\n";
echo "   Content-Type: application/x-www-form-urlencoded\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

// Make the request using cURL
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => $smsApiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => '',
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => 'POST',
    CURLOPT_POSTFIELDS => $postData,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/x-www-form-urlencoded',
    ],
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
    echo "✅ SMS Sent Successfully!\n\n";
    if (isset($responseData['data'])) {
        echo "   Response Data: " . json_encode($responseData['data'], JSON_PRETTY_PRINT) . "\n\n";
    }
} else {
    echo "❌ SMS Sending Failed!\n\n";
    if ($responseData) {
        echo "   Error Message: " . ($responseData['message'] ?? 'Unknown error') . "\n";
        if (isset($responseData['httpStatusCode']) && $responseData['httpStatusCode'] === 401) {
            echo "\n⚠️  Authorization Failed (Signature Mismatch)!\n";
            echo "   Possible causes:\n";
            echo "   1. Access Token is incorrect\n";
            echo "   2. Access Token Key is incorrect\n";
            echo "   3. Entity ID does not match these credentials\n";
            echo "   Please verify the credentials from your 4SMS panel.\n\n";
        } elseif (isset($responseData['httpStatusCode']) && $responseData['httpStatusCode'] === 402) {
            echo "\n⚠️  Insufficient Balance!\n";
            echo "   The wallet has insufficient balance. Please recharge your wallet.\n\n";
        }
    }
    exit(1);
}

