$ErrorActionPreference = "Stop"
$jar = "C:\Users\FSOS\AppData\Local\Temp\e2e-cookie.txt"
Remove-Item $jar -ErrorAction SilentlyContinue
$enc = New-Object System.Text.UTF8Encoding($False)

function Body([string]$s) {
  $f = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($f, $s, $enc)
  return $f
}
function Call([string]$method, [string]$uri, [string]$body = $null) {
  $args = @("-s","-b",$jar,"-c",$jar,"-H","Origin: http://localhost:3103","-X",$method)
  $bf = $null
  if ($body) {
    $bf = Body $body
    $args += @("-H","Content-Type: application/json","--data-binary","@$bf")
  }
  $args += @($uri)
  $r = (& curl.exe @args 2>$null) -join "`n"
  if ($bf) { Remove-Item $bf }
  return $r
}

# 1. Login
Write-Host "=== 1. LOGIN ===" -ForegroundColor Cyan
$login = (Call POST "http://localhost:3103/api/v1/auth/login" '{"email":"admin@demo.com","password":"admin123"}') | ConvertFrom-Json
$tok = $login.token
$p = $tok.Split('.')[1]
$pad = 4 - ($p.Length % 4)
if ($pad -lt 4) { $p += "=" * $pad }
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p))
$jwt = $decoded | ConvertFrom-Json
$BID = $jwt.branchId
$TID = $jwt.tenantId
Write-Host "  BRANCH_ID = $BID" -ForegroundColor Gray
Write-Host "  TENANT_ID = $TID" -ForegroundColor Gray

# 2. Seed
Write-Host ""
Write-Host "=== 2. SEED (idempotente) ===" -ForegroundColor Cyan
$seed = (Call POST "http://localhost:3103/api/v1/dev/seed-agent" (@{ branchId = $BID } | ConvertTo-Json -Compress)) | ConvertFrom-Json
$CA = $seed.products.cervejaA.id
$CB = $seed.products.cervejaB.id
Write-Host "  CervejaA = $CA" -ForegroundColor Gray
Write-Host "  CervejaB = $CB" -ForegroundColor Gray

# 3. Cenário A: 50 un CervejaA (mesma quantidade da compra anterior) → CRÍTICO
Write-Host ""
Write-Host "=== 3. CENARIO A: 50 un CervejaA (= compra anterior, estoque 160%) ===" -ForegroundColor Cyan
$bodyA = (@{
  branchId = $BID
  customerPhone = "11999887766"
  customerName = "Bar do Zé"
  items = @(@{ productId = $CA; productName = "Cerveja A"; quantityBase = 50 })
} | ConvertTo-Json -Compress)
$resA = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyA) | ConvertFrom-Json
Write-Host "  Alertas: $($resA.alerts.Count)" -ForegroundColor Yellow
$resA.alerts | ForEach-Object { Write-Host "    [$($_.severity)] $($_.message)" -ForegroundColor Magenta }

# 4. Cenário B: 45 un CervejaA (>= 80% da anterior, estoque 160%) → CRÍTICO
Write-Host ""
Write-Host "=== 4. CENARIO B: 45 un CervejaA (90% da compra anterior) ===" -ForegroundColor Cyan
$bodyB = (@{
  branchId = $BID
  customerPhone = "11999887766"
  customerName = "Bar do Zé"
  items = @(@{ productId = $CA; productName = "Cerveja A"; quantityBase = 45 })
} | ConvertTo-Json -Compress)
$resB = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyB) | ConvertFrom-Json
Write-Host "  Alertas: $($resB.alerts.Count)" -ForegroundColor Yellow
$resB.alerts | ForEach-Object { Write-Host "    [$($_.severity)] $($_.message)" -ForegroundColor Magenta }

# 5. Cenário C: 30 un CervejaA (< 80% de 50 = 40) → SEM ALERTA
Write-Host ""
Write-Host "=== 5. CENARIO C: 30 un CervejaA (60% da anterior) ===" -ForegroundColor Cyan
$bodyC = (@{
  branchId = $BID
  customerPhone = "11999887766"
  customerName = "Bar do Zé"
  items = @(@{ productId = $CA; productName = "Cerveja A"; quantityBase = 30 })
} | ConvertTo-Json -Compress)
$resC = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyC) | ConvertFrom-Json
Write-Host "  Alertas: $($resC.alerts.Count)" -ForegroundColor Yellow
if ($resC.alerts.Count -eq 0) { Write-Host "    [OK] sem alerta (quantidade abaixo de 80%)" -ForegroundColor Green }

# 6. Cenário D: Refrigerante (sem histórico) → SEM ALERTA
Write-Host ""
Write-Host "=== 6. CENARIO D: 30 un Refrigerante (sem historico) ===" -ForegroundColor Cyan
$bodyD = (@{
  branchId = $BID
  customerPhone = "11999887766"
  customerName = "Bar do Zé"
  items = @(@{ productId = $CB; productName = "Refrigerante"; quantityBase = 30 })
} | ConvertTo-Json -Compress)
$resD = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyD) | ConvertFrom-Json
Write-Host "  Alertas: $($resD.alerts.Count)" -ForegroundColor Yellow
if ($resD.alerts.Count -eq 0) { Write-Host "    [OK] sem alerta (sem historico)" -ForegroundColor Green }

# 7. Cliente novo (sem histórico) → SEM ALERTA
Write-Host ""
Write-Host "=== 7. CENARIO E: cliente novo 11999999999 (sem historico) ===" -ForegroundColor Cyan
$bodyE = (@{
  branchId = $BID
  customerPhone = "11999999999"
  customerName = "Cliente Novo"
  items = @(@{ productId = $CA; productName = "Cerveja A"; quantityBase = 50 })
} | ConvertTo-Json -Compress)
$resE = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyE) | ConvertFrom-Json
Write-Host "  Alertas: $($resE.alerts.Count)" -ForegroundColor Yellow
if ($resE.alerts.Count -eq 0) { Write-Host "    [OK] sem alerta (cliente novo)" -ForegroundColor Green }

# 8. Teste banner: branchId omitido (deve usar ctx.branchId)
Write-Host ""
Write-Host "=== 8. BANNER: branchId omitido ===" -ForegroundColor Cyan
$bodyF = (@{
  customerPhone = "11999887766"
  customerName = "Bar do Zé"
  items = @(@{ productId = $CA; productName = "Cerveja A"; quantityBase = 50 })
} | ConvertTo-Json -Compress)
$resF = (Call POST "http://localhost:3103/api/v1/agent/orders/check-alert" $bodyF) | ConvertFrom-Json
Write-Host "  Alertas: $($resF.alerts.Count)" -ForegroundColor Yellow
$resF.alerts | ForEach-Object { Write-Host "    [$($_.severity)] $($_.message)" -ForegroundColor Magenta }

# 9. Resumo
Write-Host ""
Write-Host "=== RESUMO ===" -ForegroundColor Cyan
$ok = ($resA.alerts.Count -ge 1) -and ($resB.alerts.Count -ge 1) -and ($resC.alerts.Count -eq 0) -and ($resD.alerts.Count -eq 0) -and ($resE.alerts.Count -eq 0) -and ($resF.alerts.Count -ge 1)
if ($ok) {
  Write-Host "  TODOS OS CENARIOS PASSARAM!" -ForegroundColor Green
} else {
  Write-Host "  ALGUM CENARIO FALHOU" -ForegroundColor Red
}
