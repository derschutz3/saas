$base = "http://localhost:3103/api/v1"
$loginBody = '{"email":"admin@demo.com","password":"admin123"}'
$loginRes = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -Headers @{"x-tenant-id"="tnt_default"}
$token = $loginRes.token
$payload = $token.Split('.')[1]
while ($payload.Length % 4) { $payload += "=" }
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
$payloadObj = $decoded | ConvertFrom-Json
$tenantId = $payloadObj.tenantId
$branchId = $payloadObj.branchId

$auth = @{
  "Authorization" = "Bearer $token"
  "x-tenant-id" = $tenantId
  "x-branch-id" = $branchId
}

Write-Host "=== 0. LISTAR FORNECEDORES ==="
$suppliers = Invoke-RestMethod -Uri "$base/suppliers" -Method GET -Headers $auth
$supplierId = $suppliers.items[0].id
Write-Host "supplierId: $supplierId ($($suppliers.items[0].name))"

Write-Host ""
Write-Host "=== 0b. LISTAR PRODUTOS ==="
$products = Invoke-RestMethod -Uri "$base/products" -Method GET -Headers $auth
$productId = $products.items[0].id
Write-Host "productId: $productId ($($products.items[0].name))"

Write-Host ""
Write-Host "=== 1. CRIAR PEDIDO DE COMPRA ==="
$createBody = @{
  supplierId = $supplierId
  status = "DRAFT"
  expectedDate = "2026-07-15T12:00:00Z"
  items = @(
    @{
      productId = $productId
      unitCode = $products.items[0].baseUnit
      quantity = 10
      unitCostCents = 1500
    }
  )
  notes = "Teste E2E"
} | ConvertTo-Json -Depth 5
$order = Invoke-RestMethod -Uri "$base/purchases" -Method POST -Headers $auth -ContentType "application/json" -Body $createBody
$orderId = $order.id
Write-Host "id: $orderId"
Write-Host "status: $($order.status)"
Write-Host "totalCents: $($order.totalCents)"
Write-Host "supplierName: $($order.supplierName)"

Write-Host ""
Write-Host "=== 2. AVANCAR STATUS DRAFT → SENT ==="
$upd = Invoke-RestMethod -Uri "$base/purchases/$orderId" -Method PATCH -Headers $auth -ContentType "application/json" -Body '{"status":"SENT"}'
Write-Host "status: $($upd.status)"

Write-Host ""
Write-Host "=== 3. SENT → CONFIRMED ==="
$upd = Invoke-RestMethod -Uri "$base/purchases/$orderId" -Method PATCH -Headers $auth -ContentType "application/json" -Body '{"status":"CONFIRMED"}'
Write-Host "status: $($upd.status)"

Write-Host ""
Write-Host "=== 4. RECEBER PEDIDO ==="
$recv = Invoke-RestMethod -Uri "$base/purchases/$orderId/receive" -Method POST -Headers $auth
Write-Host "status: $($recv.order.status)"
Write-Host "receivedAt: $($recv.order.receivedAt)"
Write-Host "movementsCreated: $($recv.movementsCreated)"

Write-Host ""
Write-Host "=== 5. LISTAR PEDIDOS ==="
$list = Invoke-RestMethod -Uri "$base/purchases" -Method GET -Headers $auth
Write-Host "total: $($list.items.Count)"
foreach ($o in $list.items) {
  Write-Host "  - id: $($o.id.slice(0,8)) status: $($o.status) total: $($o.totalCents)"
}

Write-Host ""
Write-Host "=== 6. TENTAR EXCLUIR PEDIDO RECEBIDO (deve falhar) ==="
try {
  $del = Invoke-RestMethod -Uri "$base/purchases/$orderId" -Method DELETE -Headers $auth
  Write-Host "UNEXPECTED: $($del | ConvertTo-Json)"
} catch {
  Write-Host "ESPERADO: $($_.Exception.Message)"
}
