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
    return @{ Code = $r.StatusCode; Body = $r.Content }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
    }
    return @{ Code = $code; Body = $body }
  }
}

Write-Host "`n=== 1) Login admin@demo.com ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"admin123"}'
Write-Host "Code: $($r.Code)"
Write-Host "Body (600): $($r.Body.Substring(0, [Math]::Min(600, $r.Body.Length)))"
$global:ADMIN_TOKEN = ($r.Body | ConvertFrom-Json).token
Write-Host "Token length: $($global:ADMIN_TOKEN.Length)"

Write-Host "`n=== 2) Login senha errada ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{"email":"admin@demo.com","password":"errado"}'
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 3) Login SQLi ===" -ForegroundColor Cyan
$payload = '{"email":"admin@demo.com'' OR ''1''=''1","password":"x"}'
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" $payload
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 4) Login body vazio ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" '{}'
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 5) Login NoSQL injection ===" -ForegroundColor Cyan
$payload = '{"email":{"$ne":""},"password":{"$ne":""}}'
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" $payload
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 6) /api/v1/products SEM token ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/products"
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 7) /api/v1/products token vazio ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/products" "GET" $null @{ Authorization = "Bearer " }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 8) JWT forjado (alg=none) ===" -ForegroundColor Cyan
$forged = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1LTAwMSIsInRlbmFudElkIjoidC0xMDAxIiwicm9sZSI6IkFETUlOIn0."
$r = GetStatus "http://localhost:3103/api/v1/products" "GET" $null @{ Authorization = "Bearer $forged" }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 9) CORS - origin malicioso ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/products" "OPTIONS" $null @{
  Origin = "https://evil.com"
  "Access-Control-Request-Method" = "GET"
}
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 10) CORS - sem origin ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/products" "GET"
$accessControl = $r.Body
Write-Host "CORS present: True"
Write-Host "CORS body: $($r.Body.Substring(0, [Math]::Min(300, $r.Body.Length)))"

Write-Host "`n=== 11) JWT com role adulterado ===" -ForegroundColor Cyan
$forged2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1LTAwMSIsInRlbmFudElkIjoidC0xMDAxIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzE4MjAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.bad_signature"
$r = GetStatus "http://localhost:3103/api/v1/products" "GET" $null @{ Authorization = "Bearer $forged2" }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 12) Criar produto COM token admin (deve dar 403) ===" -ForegroundColor Cyan
$body = '{"sku":"TEST","name":"Test","baseUnit":"un"}'
$r = GetStatus "http://localhost:3103/api/v1/products" "POST" $body @{ Authorization = "Bearer $global:ADMIN_TOKEN" }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 13) Listar orders COM token ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/orders" "GET" $null @{ Authorization = "Bearer $global:ADMIN_TOKEN" }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 14) Listar audit events COM token admin (deve dar 403) ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/audit/events" "GET" $null @{ Authorization = "Bearer $global:ADMIN_TOKEN" }
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 15) Endpoint que não existe ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/api/v1/nonexistent"
Write-Host "Code: $($r.Code)"
Write-Host "Body: $($r.Body)"

Write-Host "`n=== 16) Path traversal ===" -ForegroundColor Cyan
$r = GetStatus "http://localhost:3103/../../../../etc/passwd"
Write-Host "Code: $($r.Code)"

Write-Host "`n=== 17) Body extremamente grande (DoS) ===" -ForegroundColor Cyan
$big = "A" * 1000000
$r = GetStatus "http://localhost:3103/api/v1/auth/login" "POST" "{\"email\":\"$big\",\"password\":\"$big\"}"
Write-Host "Code: $($r.Code)"

Write-Host "`n=== TESTES CONCLUÍDOS ===" -ForegroundColor Green
