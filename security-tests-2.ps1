function GetStatus($uri, $method = "GET", $body = $null, $headers = @{}) {
  $params = @{
    Uri = $uri
    Method = $method
    UseBasicParsing = $true
    TimeoutSec = 10
    Headers = $headers
  }
  if ($body) {
    $params.ContentType = "application/json"
    $params.Body = $body
  }
  try {
    $r = Invoke-WebRequest @params
    $headers = @{}
    foreach ($k in $r.Headers.Keys) { $headers[$k] = $r.Headers[$k] }
    return @{ Code = $r.StatusCode; Body = $r.Content; Headers = $headers }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    $headers = @{}
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      foreach ($k in $_.Exception.Response.Headers.Keys) { $headers[$k] = $_.Exception.Response.Headers[$k] }
    }
    return @{ Code = $code; Body = $body; Headers = $headers }
  }
}

function Login() {
  $r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}'
  return ($r.Body | ConvertFrom-Json).token
}

$TOKEN = Login
Write-Host "Token: $($TOKEN.Substring(0,40))..."

Write-Host "`n=== 1) CORS preflight com Origin malicioso ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "OPTIONS" $null @{
  Origin = "https://evil.com"
  "Access-Control-Request-Method" = "POST"
  "Access-Control-Request-Headers" = "content-type"
}
Write-Host "Code: $($r.Code)"
Write-Host "Headers: $($r.Headers | ConvertTo-Json -Depth 3)"

Write-Host "`n=== 2) CORS preflight com Origin localhost ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "OPTIONS" $null @{
  Origin = "http://localhost:5173"
  "Access-Control-Request-Method" = "POST"
  "Access-Control-Request-Headers" = "content-type"
}
Write-Host "Code: $($r.Code)"
Write-Host "Headers: $($r.Headers | ConvertTo-Json -Depth 3)"

Write-Host "`n=== 3) Real request com Origin malicioso ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}' @{
  Origin = "https://evil.com"
}
Write-Host "Code: $($r.Code)"
Write-Host "Headers: $($r.Headers | ConvertTo-Json -Depth 3)"

Write-Host "`n=== 4) Brute force - 10 tentativas com senha errada ===" -ForegroundColor Cyan
$start = Get-Date
for ($i = 1; $i -le 10; $i++) {
  $r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" "{\"email\":\"admin@demo.com\",\"password\":\"wrong$i\"}"
  Write-Host "Attempt $i -> Code: $($r.Code) (duration: $([Math]::Round(((Get-Date) - $start).TotalSeconds,2))s)"
}

Write-Host "`n=== 5) Login com credenciais vazias (múltiplas variantes) ===" -ForegroundColor Cyan
$variants = @('{"email":"","password":""}', '{"email":null,"password":null}', '{"email":"a","password":""}', '{"password":"x"}')
foreach ($v in $variants) {
  $r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" $v
  Write-Host "$v -> Code: $($r.Code)"
}

Write-Host "`n=== 6) Token JWT expirado (manipulado) ===" -ForegroundColor Cyan
# Forjar um token com exp no passado (mas a assinatura está errada, então vai dar 401 também)
$payload = '{"sub":"u-001","tenantId":"t-1001","branchId":null,"role":"OWNER","iat":1,"exp":2}'
$header = '{"alg":"HS256","typ":"JWT"}'
$func = [System.Text.Encoding]::UTF8
$base64UrlEncode = { param($s) [Convert]::ToBase64String($func.GetBytes($s)).Replace('+','-').Replace('/','_').Replace('=','') }
$data = "$(& $base64UrlEncode $header).$(& $base64UrlEncode $payload)"
$sig = "fake_signature_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$forged = "$data.$sig"
$r = GetStatus "http://localhost:3103/api/v1/products" "GET" $null @{ Authorization = "Bearer $forged" }
Write-Host "Code: $($r.Code) Body: $($r.Body)"

Write-Host "`n=== 7) Verificar headers de segurança ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}'
$h = $r.Headers
Write-Host "X-Frame-Options: $(if($h.ContainsKey('X-Frame-Options')){$h['X-Frame-Options']}else{'AUSENTE'})"
Write-Host "X-Content-Type-Options: $(if($h.ContainsKey('X-Content-Type-Options')){$h['X-Content-Type-Options']}else{'AUSENTE'})"
Write-Host "Strict-Transport-Security: $(if($h.ContainsKey('Strict-Transport-Security')){$h['Strict-Transport-Security']}else{'AUSENTE'})"
Write-Host "Content-Security-Policy: $(if($h.ContainsKey('Content-Security-Policy')){$h['Content-Security-Policy']}else{'AUSENTE'})"
Write-Host "Access-Control-Allow-Origin: $(if($h.ContainsKey('Access-Control-Allow-Origin')){$h['Access-Control-Allow-Origin']}else{'AUSENTE'})"
Write-Host "Server: $(if($h.ContainsKey('Server')){$h['Server']}else{'AUSENTE'})"
Write-Host "X-Powered-By: $(if($h.ContainsKey('X-Powered-By')){$h['X-Powered-By']}else{'AUSENTE'})"

Write-Host "`n=== 8) Request smuggling (Content-Length vs Transfer-Encoding) ===" -ForegroundColor Cyan
# Em Node.js, é difícil de explorar mas vale testar
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"a","password":"b"}' @{
  "Content-Length" = "9999"
}
Write-Host "Code: $($r.Code)"

Write-Host "`n=== 9) /api/auth/register tenta cadastrar ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/auth/register" "POST" '{"email":"hacker@evil.com","password":"hack123","name":"Hacker"}'
Write-Host "Code: $($r.Code) Body: $($r.Body)"

Write-Host "`n=== 10) Endpoint /api/v1/auth/me sem token ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/me"
Write-Host "Code: $($r.Code) Body: $($r.Body)"

Write-Host "`n=== 11) Header injection em logs ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}' @{
  "X-Forwarded-For" = "<script>alert(1)</script>"
  "User-Agent" = "Mozilla/5.0\r\nX-Injected-Header: pwned"
}
Write-Host "Code: $($r.Code)"

Write-Host "`n=== TESTES AVANÇADOS CONCLUÍDOS ===" -ForegroundColor Green
