function Get($uri, $method = "GET", $body = $null, $headers = @{}, $session = $null) {
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
    return @{ Code = $r.StatusCode; Body = $r.Content; Cookies = $r.Headers['Set-Cookie'] }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $b = ""
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $b = $reader.ReadToEnd()
    }
    return @{ Code = $code; Body = $b; Cookies = $null }
  }
}

Write-Host "=== 1) Login e captura cookie ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}'
Write-Host "Code: $($r.Code)"
Write-Host "Cookie: $($r.Cookies)"
$cookie = ($r.Cookies -split ';')[0]
Write-Host "Token puro: $cookie"

Write-Host "`n=== 2) /me COM cookie ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/me" "GET" $null @{ Cookie = $cookie }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 3) /me SEM cookie ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/me"
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 4) /api/v1/products COM cookie ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/products" "GET" $null @{ Cookie = $cookie }
Write-Host "Code: $($r.Code)"

Write-Host "`n=== 5) Logout ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/logout" "POST" $null @{ Cookie = $cookie }
Write-Host "Code: $($r.Code) Cookies (deve estar vazio): $($r.Cookies)"

Write-Host "`n=== 6) /me APOS logout (cookie foi limpo) ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/me" "GET" $null @{ Cookie = $cookie }
Write-Host "Code: $($r.Code) (deve ser 401)"

Write-Host "`n=== 7) NoSQL injection (deve ser 400 agora, nao 500) ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/auth/login" "POST" '{"email":{"$ne":""},"password":{"$ne":""}}'
Write-Host "Code: $($r.Code) Body: $($r.Body)"

Write-Host "`n=== 8) /api/v1/products via NEXT.JS (3103) com proxy ===" -ForegroundColor Cyan
$r = Get "http://localhost:3103/api/v1/products"
Write-Host "Code: $($r.Code) (deve ser 401 - sem cookie)"

Write-Host "`n=== 9) /admin/tenants via NEXT.JS ===" -ForegroundColor Cyan
try { $r = Invoke-WebRequest -Uri "http://localhost:3103/admin/tenants" -UseBasicParsing -TimeoutSec 10; Write-Host "Code: $($r.StatusCode)" } catch { $code = $_.Exception.Response.StatusCode.value__; Write-Host "Code: $code" }

Write-Host "`n=== TESTES CONCLUÍDOS ===" -ForegroundColor Green
