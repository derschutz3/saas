$BASE = "http://localhost:3103"
$ORIGIN = "http://localhost:3103"
$jar = [System.IO.Path]::GetTempFileName()
$enc = New-Object System.Text.UTF8Encoding($False)

function Body([string]$s) {
  $f = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($f, $s, $enc)
  return $f
}
function Get-Body([string]$method, [string]$uri, [string]$body) {
  $args = @("-s","-b",$jar,"-c",$jar,"-H","Origin: $ORIGIN","-X",$method)
  $bf = $null
  if ($body) {
    $bf = Body $body
    $args += @("-H","Content-Type: application/json","--data-binary","@$bf")
  }
  $args += @($uri)
  $r = & curl.exe @args 2>$null
  if ($bf) { Remove-Item $bf }
  return $r
}

# Login
$lb = Body '{"email":"admin@demo.com","password":"admin123"}'
& curl.exe -s -o NUL -b $jar -c $jar -H "Content-Type: application/json" -H "Origin: $ORIGIN" -X POST --data-binary "@$lb" "$BASE/api/v1/auth/login" 2>$null | Out-Null
Remove-Item $lb

# 1. Seed
Write-Host "=== 1. SEED ==="
$seed = Get-Body POST "$BASE/api/v1/dev/seed-agent" '{"branchId":"br_default"}'
$j = $seed | ConvertFrom-Json
Write-Host "Cerveja A ID: $($j.products.cervejaA.id)"
Write-Host "Cerveja B ID: $($j.products.cervejaB.id)"
$cervejaA = $j.products.cervejaA.id
$cervejaB = $j.products.cervejaB.id
Write-Host ""

# 2. Listar produtos
Write-Host "=== 2. LISTAR PRODUTOS ==="
$prods = Get-Body GET "$BASE/api/v1/products" $null
$prods | ConvertFrom-Json | ForEach-Object { Write-Host "  $($_.sku) - $($_.name) (id=$($_.id))" }
Write-Host ""

# 3. Insights
Write-Host "=== 3. INSIGHTS (cobertura alta) ==="
$insights = Get-Body GET "$BASE/api/v1/agent/insights?branchId=br_default&lookbackDays=30&limit=20" $null
$insights | ConvertFrom-Json | ForEach-Object {
  $i = $_
  Write-Host "  [$($i.level)] $($i.productName)"
  Write-Host "    comprado=$($i.purchasedBase) vendido=$($i.soldBase) estoque=$($i.onHandBase) cobertura=$($(if($i.soldBase -gt 0){[math]::Round(($i.onHandBase / $i.soldBase) * 100)} else {0}))%"
  Write-Host "    $($i.insight)"
}
Write-Host ""

# 4. Recurring Bar do Zé
Write-Host "=== 4. RECORRENTES BAR DO ZE ==="
$rec = Get-Body GET "$BASE/api/v1/agent/customers/11999887766/recurring?branchId=br_default" $null
$rec | ConvertFrom-Json | ForEach-Object {
  $i = $_
  Write-Host "  $($i.productName) | ultimaQtd=$($i.lastQuantityBase) total30d=$($i.totalQuantityBaseLast30d) pedidos30d=$($i.totalOrdersLast30d)"
}
Write-Host ""

# 5. Check-alert: 50 un (mesma compra anterior, estoque tem 80) — ALERTA CRÍTICO
Write-Host "=== 5. CHECK-ALERT 50 un (mesma compra anterior) ==="
$body = '{"branchId":"br_default","customerPhone":"11999887766","customerName":"Bar do Ze","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":50}]}'
$ca = Get-Body POST "$BASE/api/v1/agent/orders/check-alert" $body
Write-Host $ca
Write-Host ""

# 6. Check-alert: 30 un (abaixo de 80% de 50) — sem alerta
Write-Host "=== 6. CHECK-ALERT 30 un (abaixo de 80% de 50) — sem alerta ==="
$body = '{"branchId":"br_default","customerPhone":"11999887766","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":30}]}'
$ca = Get-Body POST "$BASE/api/v1/agent/orders/check-alert" $body
Write-Host $ca
Write-Host ""

# 7. Check-alert: 10 un (muito abaixo) — sem alerta
Write-Host "=== 7. CHECK-ALERT 10 un (muito abaixo) — sem alerta ==="
$body = '{"branchId":"br_default","customerPhone":"11999887766","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":10}]}'
$ca = Get-Body POST "$BASE/api/v1/agent/orders/check-alert" $body
Write-Host $ca
Write-Host ""

# 8. Check-alert: cliente novo (sem histórico) — sem alerta
Write-Host "=== 8. CHECK-ALERT cliente novo (sem historico) ==="
$body = '{"branchId":"br_default","customerPhone":"11999999999","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":50}]}'
$ca = Get-Body POST "$BASE/api/v1/agent/orders/check-alert" $body
Write-Host $ca

Remove-Item $jar -ErrorAction SilentlyContinue
