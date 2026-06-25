# Script de validacao funcional completa do ERP - v3 com curl.exe (isolamento real de cookies)
$BASE = "http://localhost:3103"
$ORIGIN = "http://localhost:3103"
$results = @()
$counter = 0

function Run-Test {
  param([string]$name, [string]$method, [string]$uri, [string]$body, [hashtable]$extraHeaders, [int[]]$expected, [string]$expect)
  $counter++
  $cookieJar = [System.IO.Path]::GetTempFileName()
  $headers = @("Content-Type: application/json", "Origin: $ORIGIN")
  if ($extraHeaders) { foreach ($k in $extraHeaders.Keys) { $headers += "${k}: $($extraHeaders[$k])" } }
  $headerArgs = $headers | ForEach-Object { "-H", $_ }
  $methodArg = if ($method) { "-X", $method } else { @() }
  $bodyFile = $null
  $bodyArgs = @()
  if ($body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    # SECURITY: usar .NET FileStream com UTF8 NO BOM para evitar corrupcao
    # do JSON (PowerShell 5+ usa UTF-16 LE com BOM por padrao)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($False)
    [System.IO.File]::WriteAllText($bodyFile, $body, $utf8NoBom)
    $bodyArgs = @("--data-binary", "@$bodyFile")
  }
  $urlObj = $uri
  $args = @("-s","-o","NUL","-w","%{http_code}","-b",$cookieJar,"-c",$cookieJar) + $headerArgs + $methodArg + $bodyArgs + @($urlObj)
  $code = & curl.exe @args 2>$null
  Remove-Item -Path $cookieJar -ErrorAction SilentlyContinue
  if ($bodyFile) { Remove-Item -Path $bodyFile -ErrorAction SilentlyContinue }
  $code = if ($code) { [int]$code.Trim() } else { 0 }
  $pass = $true
  if ($expected -and ($expected -notcontains $code)) { $pass = $false }
  $script:results += [pscustomobject]@{ N=$counter; Test=$name; Method=$method; Status=$code; Pass=$pass }
  $marker = if ($pass) { "PASS" } else { "FAIL" }
  $detail = if ($expect) { " ($expect)" } else { "" }
  Write-Host "[$counter] $marker $code $name$detail"
  return $pass
}

function Get-CodeOnly {
  param([string]$method, [string]$uri, [string]$body, [hashtable]$extraHeaders)
  $cookieJar = [System.IO.Path]::GetTempFileName()
  $headers = @("Origin: $ORIGIN")
  if ($extraHeaders) { foreach ($k in $extraHeaders.Keys) { $headers += "${k}: $($extraHeaders[$k])" } }
  $headerArgs = $headers | ForEach-Object { "-H", $_ }
  $bodyFile = $null
  $bodyArgs = @()
  if ($body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $bodyFile -Value $body -Encoding ASCII -NoNewline
    $bodyArgs = @("--data-binary", "@$bodyFile")
  }
  $args = @("-s","-o","NUL","-w","%{http_code}","-b",$cookieJar,"-c",$cookieJar) + $headerArgs + @("-X", $method) + $bodyArgs + @($uri)
  $code = & curl.exe @args 2>$null
  Remove-Item -Path $cookieJar -ErrorAction SilentlyContinue
  if ($bodyFile) { Remove-Item -Path $bodyFile -ErrorAction SilentlyContinue }
  return if ($code) { [int]$code.Trim() } else { 0 }
}

function Login {
  param([string]$email, [string]$password)
  $cookieJar = [System.IO.Path]::GetTempFileName()
  $bodyFile = [System.IO.Path]::GetTempFileName()
  $utf8NoBom = New-Object System.Text.UTF8Encoding($False)
  [System.IO.File]::WriteAllText($bodyFile, '{"email":"' + $email + '","password":"' + $password + '"}', $utf8NoBom)
  $args = @("-s","-o","NUL","-w","%{http_code}","-b",$cookieJar,"-c",$cookieJar,
    "-H","Content-Type: application/json","-H","Origin: $ORIGIN",
    "-X","POST","--data-binary","@$bodyFile",
    "$BASE/api/v1/auth/login")
  $code = & curl.exe @args 2>$null
  Remove-Item $bodyFile -ErrorAction SilentlyContinue
  return $cookieJar
}

Write-Host "========================================"
Write-Host " VALIDACAO FUNCIONAL v3 - ERP Universal"
Write-Host " (curl.exe com cookie jar isolado)"
Write-Host "========================================"
Write-Host ""

# === AUTH ===
Write-Host "--- 1. AUTENTICACAO ---"
Run-Test "Login admin@demo.com" POST "$BASE/api/v1/auth/login" '{"email":"admin@demo.com","password":"admin123"}' $null -expected @(200)
Run-Test "Login saas@admin.com" POST "$BASE/api/v1/auth/login" '{"email":"saas@admin.com","password":"admin123"}' $null -expected @(200)
Run-Test "Login senha errada" POST "$BASE/api/v1/auth/login" '{"email":"admin@demo.com","password":"errada"}' $null -expected @(401) -expect "deve 401"
Run-Test "Login email inexistente" POST "$BASE/api/v1/auth/login" '{"email":"nobody@x.com","password":"x"}' $null -expected @(401) -expect "deve 401"
Run-Test "Login NoSQL injection" POST "$BASE/api/v1/auth/login" '{"email":{"$ne":""},"password":{"$ne":""}}' $null -expected @(400) -expect "deve 400"
Run-Test "Login body vazio" POST "$BASE/api/v1/auth/login" '{}' $null -expected @(400) -expect "deve 400"
Run-Test "Login email invalido" POST "$BASE/api/v1/auth/login" '{"email":"not-an-email","password":"x"}' $null -expected @(400) -expect "deve 400"
Run-Test "Login sem senha" POST "$BASE/api/v1/auth/login" '{"email":"admin@demo.com"}' $null -expected @(400) -expect "deve 400"
Run-Test "ME sem cookie (curl isolado)" GET "$BASE/api/v1/auth/me" $null $null -expected @(401) -expect "deve 401"
Run-Test "ME cookie forjado (curl isolado)" GET "$BASE/api/v1/auth/me" $null @{"Cookie"="erp_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fake"} -expected @(401) -expect "deve 401"

# === AUTH via cookie jar real ===
Write-Host ""
Write-Host "--- 1.1 AUTH VIA COOKIE JAR (curl) ---"
$jar = Login "admin@demo.com" "admin123"
$code = & curl.exe -s -o NUL -w "%{http_code}" -b $jar -c $jar -H "Origin: $ORIGIN" "$BASE/api/v1/auth/me" 2>$null
$counter++
$pass = [int]$code.Trim() -eq 200
$script:results += [pscustomobject]@{ N=$counter; Test="ME com cookie real (jar)"; Method="GET"; Status=[int]$code.Trim(); Pass=$pass }
Write-Host "[$counter] $(if($pass){'PASS'}else{'FAIL'}) $code ME com cookie real (jar)"
# Logout
$code = & curl.exe -s -o NUL -w "%{http_code}" -b $jar -c $jar -H "Origin: $ORIGIN" -X POST "$BASE/api/v1/auth/logout" 2>$null
$counter++
$pass = @("200","204") -contains $code.Trim()
$script:results += [pscustomobject]@{ N=$counter; Test="Logout"; Method="POST"; Status=[int]$code.Trim(); Pass=$pass }
Write-Host "[$counter] $(if($pass){'PASS'}else{'FAIL'}) $code Logout"
Remove-Item $jar -ErrorAction SilentlyContinue

# Re-login para testes autenticados
$authJar = Login "admin@demo.com" "admin123"
function AuthTest {
  param([string]$name, [string]$method, [string]$uri, [string]$body, [int[]]$expected, [string]$expect)
  $counter++
  $args = @("-s","-o","NUL","-w","%{http_code}","-b",$authJar,"-c",$authJar,
    "-H","Content-Type: application/json","-H","Origin: $ORIGIN","-X",$method)
  $bodyFile = $null
  if ($body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($False)
    [System.IO.File]::WriteAllText($bodyFile, $body, $utf8NoBom)
    $args += @("--data-binary","@$bodyFile")
  }
  $args += @($uri)
  $code = & curl.exe @args 2>$null
  if ($bodyFile) { Remove-Item $bodyFile -ErrorAction SilentlyContinue }
  $codeNum = if ($code) { [int]$code.Trim() } else { 0 }
  $pass = $true
  if ($expected -and ($expected -notcontains $codeNum)) { $pass = $false }
  $script:results += [pscustomobject]@{ N=$counter; Test=$name; Method=$method; Status=$codeNum; Pass=$pass }
  $marker = if ($pass) { "PASS" } else { "FAIL" }
  $detail = if ($expect) { " ($expect)" } else { "" }
  Write-Host "[$counter] $marker $codeNum $name$detail"
  return $pass
}

Write-Host ""
Write-Host "--- 2. CUSTOMERS ---"
AuthTest "Listar customers" GET "$BASE/api/v1/customers" $null -expected @(200)
AuthTest "Buscar customers com query" GET "$BASE/api/v1/customers?query=Bar" $null -expected @(200)

Write-Host ""
Write-Host "--- 3. PRODUCTS ---"
AuthTest "Listar produtos" GET "$BASE/api/v1/products" $null -expected @(200)
AuthTest "Listar unidades" GET "$BASE/api/v1/units" $null -expected @(200)
AuthTest "Criar produto" POST "$BASE/api/v1/products" '{"name":"Cerveja Teste","sku":"TEST-001","category":"BEBIDAS","unitCode":"UN"}' -expected @(201,200)
AuthTest "Criar produto sem nome" POST "$BASE/api/v1/products" '{"name":""}' -expected @(400)

Write-Host ""
Write-Host "--- 4. INVENTORY ---"
AuthTest "Movimentacoes estoque" GET "$BASE/api/v1/inventory/movements" $null -expected @(200)
AuthTest "Ajuste de estoque" POST "$BASE/api/v1/inventory/adjustments" '{"productId":"00000000-0000-0000-0000-000000000000","branchId":"00000000-0000-0000-0000-000000000000","quantityBase":10,"reason":"Test"}' -expected @(201,200,400,404)

Write-Host ""
Write-Host "--- 5. ORDERS ---"
AuthTest "Listar pedidos" GET "$BASE/api/v1/orders" $null -expected @(200)
AuthTest "Criar pedido" POST "$BASE/api/v1/orders" '{"channel":"BALCAO","items":[{"productId":"x","quantity":1,"unitPrice":10}]}' -expected @(201,200,400,404)

Write-Host ""
Write-Host "--- 6. CASH / FINANCE ---"
AuthTest "Sessao de caixa aberta" GET "$BASE/api/v1/finance/cash-sessions/open" $null -expected @(200,404)

Write-Host ""
Write-Host "--- 7. MODULES / ADMIN ---"
AuthTest "Listar business-types" GET "$BASE/api/v1/modules/business-types" $null -expected @(200)

Write-Host ""
Write-Host "--- 8. WEBHOOKS ---"
Run-Test "Webhook ifood health" GET "$BASE/webhook/ifood/health" $null $null -expected @(200)
Run-Test "Webhook sem tenant" POST "$BASE/webhook/ifood" '{"id":"e1"}' $null -expected @(400,401)
Run-Test "Webhook com signature" POST "$BASE/webhook/ifood" '{"id":"e2"}' @{"x-tenant-id"="x";"x-signature"="sha256=invalid"} -expected @(401)

Write-Host ""
Write-Host "--- 9. SEGURANCA ---"
Run-Test "Origin evil (deve 403)" GET "$BASE/api/health" $null @{"Origin"="http://evil.com"} -expected @(403)
Run-Test "NoSQL injection products (sem auth)" POST "$BASE/api/v1/products" '{"name":{"$ne":""}}' $null -expected @(401)
Run-Test "Path traversal" GET "$BASE/api/../etc/passwd" $null $null -expected @(400,404)
Run-Test "Endpoint inexistente" GET "$BASE/api/v1/does-not-exist" $null $null -expected @(404)

Remove-Item $authJar -ErrorAction SilentlyContinue

# Helmet headers via curl (anonimo)
Write-Host ""
Write-Host "--- 10. HELMET HEADERS ---"
$counter++
$jar = [System.IO.Path]::GetTempFileName()
$hdrFile = [System.IO.Path]::GetTempFileName()
& curl.exe -s -o NUL -b $jar -c $jar -H "Origin: $ORIGIN" -D $hdrFile "$BASE/api/health" 2>$null
Remove-Item $jar -ErrorAction SilentlyContinue
$hdrContent = Get-Content $hdrFile -Raw
Remove-Item $hdrFile -ErrorAction SilentlyContinue
$helmetChecks = @(
  @{Name="X-Content-Type-Options"; Pattern="X-Content-Type-Options:\s*nosniff"},
  @{Name="X-Frame-Options"; Pattern="X-Frame-Options:\s*SAMEORIGIN"},
  @{Name="X-DNS-Prefetch-Control"; Pattern="X-DNS-Prefetch-Control:\s*off"},
  @{Name="X-Download-Options"; Pattern="X-Download-Options:\s*noopen"},
  @{Name="Referrer-Policy"; Pattern="Referrer-Policy:\s*no-referrer"},
  @{Name="Cross-Origin-Resource-Policy"; Pattern="Cross-Origin-Resource-Policy:\s*same-origin"},
  @{Name="X-Permitted-Cross-Domain-Policies"; Pattern="X-Permitted-Cross-Domain-Policies:\s*none"}
)
$xpbHidden = $hdrContent -notmatch "(?im)^X-Powered-By:"
$present = 0; $missing = @()
foreach ($c in $helmetChecks) {
  if ($hdrContent -match $c.Pattern) { $present++ } else { $missing += $c.Name }
}
if ($xpbHidden) { $present++ } else { $missing += "X-Powered-By (VAZANDO!)" }
$pass = $missing.Count -eq 0
$script:results += [pscustomobject]@{ N=$counter; Test="Helmet headers"; Method="GET"; Status="200"; Pass=$pass }
$marker = if ($pass) { "PASS" } else { "FAIL" }
Write-Host "[$counter] $marker Helmet: $present/8 headers OK"
if ($missing.Count -gt 0) { Write-Host "  Faltantes: $($missing -join ', ')" }

Write-Host ""
Write-Host "========================================"
Write-Host " RESUMO"
Write-Host "========================================"
$pass = ($results | Where-Object { $_.Pass }).Count
$fail = ($results | Where-Object { -not $_.Pass }).Count
Write-Host "Total: $($results.Count) | PASS: $pass | FAIL: $fail"
Write-Host ""
if ($fail -gt 0) {
  Write-Host "FALHAS:"
  $results | Where-Object { -not $_.Pass } | ForEach-Object {
  Write-Host "  [$($_.N)] $($_.Test) status=$($_.Status)"
  }
}
