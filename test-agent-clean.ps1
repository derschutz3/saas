$ErrorActionPreference = "Stop"
$jar = "C:\Users\FSOS\AppData\Local\Temp\agent-cookie2.txt"
Remove-Item $jar -ErrorAction SilentlyContinue
$enc = New-Object System.Text.UTF8Encoding($False)

$body = '{"email":"admin@demo.com","password":"admin123"}'
$f = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($f, $body, $enc)

$login = (curl.exe -s -b $jar -c $jar -H "Content-Type: application/json" -H "Origin: http://localhost:3103" -X POST --data-binary "@$f" "http://localhost:3103/api/v1/auth/login") | ConvertFrom-Json
Remove-Item $f

$tok = $login.token
$p = $tok.Split('.')[1]
$pad = 4 - ($p.Length % 4)
if ($pad -lt 4) { $p += "=" * $pad }
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p))
$jwt = $decoded | ConvertFrom-Json
$BID = $jwt.branchId
$TID = $jwt.tenantId
Write-Host "BRANCH_ID = $BID"
Write-Host "TENANT_ID = $TID"

# Seed with correct branchId
$seedBody = (@{ branchId = $BID } | ConvertTo-Json -Compress)
$f = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($f, $seedBody, $enc)
Write-Host ""
Write-Host "=== SEED ==="
$r = (curl.exe -s -b $jar -H "Origin: http://localhost:3103" -H "Content-Type: application/json" -X POST --data-binary "@$f" "http://localhost:3103/api/v1/dev/seed-agent") | ConvertFrom-Json
Remove-Item $f
$CA = $r.products.cervejaA.id
$CB = $r.products.cervejaB.id
Write-Host "CervejaA = $CA"
Write-Host "CervejaB = $CB"

Write-Host ""
Write-Host "=== ORDERS ==="
$o = (curl.exe -s -b $jar -H "Origin: http://localhost:3103" "http://localhost:3103/api/v1/orders") | ConvertFrom-Json
Write-Host "Total orders: $($o.items.Count)"
$o.items | ForEach-Object { Write-Host "  $($_.id) - $($_.customerPhone) - $($_.status) - createdAt=$($_.createdAt)" }

Write-Host ""
Write-Host "=== CHECK-ALERT 50 un ==="
$alertBody = (@{
  branchId = $BID
  customerPhone = "11999887766"
  customerName = "Bar do Ze"
  items = @(@{ productId = $CA; productName = "Cerveja Pilsen 350ml (teste IA)"; quantityBase = 50 })
} | ConvertTo-Json -Compress)
$f = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($f, $alertBody, $enc)
$alerts = (curl.exe -s -b $jar -H "Origin: http://localhost:3103" -H "Content-Type: application/json" -X POST --data-binary "@$f" "http://localhost:3103/api/v1/agent/orders/check-alert") | ConvertFrom-Json
Remove-Item $f
Write-Host "Alerts: $($alerts.alerts.Count)"
$alerts.alerts | ForEach-Object { Write-Host "  [$($_.severity)] $($_.message)" }

Write-Host ""
Write-Host "=== RECORRENTES ==="
$rec = (curl.exe -s -b $jar -H "Origin: http://localhost:3103" "http://localhost:3103/api/v1/agent/customers/11999887766/recurring?branchId=$BID&lookbackDays=30") | ConvertFrom-Json
Write-Host "Items: $($rec.items.Count)"
$rec.items | ForEach-Object { Write-Host "  $($_.productName) - total30d=$($_.totalQuantityBaseLast30d) - lastQtd=$($_.lastQuantityBase)" }
