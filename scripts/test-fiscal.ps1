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

Write-Host "=== 0. SEED INICIAL (caso necessário) ==="
try {
  $seed = Invoke-RestMethod -Uri "$base/dev/seed-agent" -Method POST -Headers $auth -ContentType "application/json" -Body '{}'
  Write-Host "seed OK"
} catch {
  Write-Host "seed falhou: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== 0b. LISTAR PEDIDOS (pegar um) ==="
$orders = Invoke-RestMethod -Uri "$base/orders" -Method GET -Headers $auth
Write-Host "Total de pedidos: $($orders.items.Count)"
if ($orders.items.Count -eq 0) {
  Write-Host "Sem pedidos. Saindo."
  exit
}
$orderId = $orders.items[0].id
Write-Host "orderId: $orderId"

Write-Host ""
Write-Host "=== 1. EMITIR NF (criar) ==="
$createBody = "{`"orderId`":`"$orderId`",`"docType`":`"NFE`"}"
$doc = Invoke-RestMethod -Uri "$base/fiscal" -Method POST -Headers $auth -ContentType "application/json" -Body $createBody
$docId = $doc.id
Write-Host "id: $docId"
Write-Host "status: $($doc.status)"
Write-Host "docType: $($doc.docType)"
Write-Host "totalCents: $($doc.totalCents)"

Write-Host ""
Write-Host "=== 2. AUTORIZAR NF (emit) ==="
$authorized = Invoke-RestMethod -Uri "$base/fiscal/$docId/emit" -Method POST -Headers $auth -ContentType "application/json" -Body '{}'
Write-Host "status: $($authorized.status)"
Write-Host "numero: $($authorized.numero)"
Write-Host "serie: $($authorized.serie)"
Write-Host "accessKey (14): $($authorized.accessKey.Substring(0,14))..."
Write-Host "protocol: $($authorized.protocol)"

Write-Host ""
Write-Host "=== 3. STATS ==="
$stats = Invoke-RestMethod -Uri "$base/fiscal/stats" -Method GET -Headers $auth
Write-Host "total: $($stats.total)"
Write-Host "AUTHORIZED: $($stats.byStatus.AUTHORIZED)"
Write-Host "PENDING: $($stats.byStatus.PENDING)"
Write-Host "totalAuthorizedCents: $($stats.totalAuthorizedCents)"

Write-Host ""
Write-Host "=== 4. CANCELAR NF ==="
$canceled = Invoke-RestMethod -Uri "$base/fiscal/$docId/cancel" -Method POST -Headers $auth -ContentType "application/json" -Body '{"reason":"Teste de cancelamento"}'
Write-Host "status: $($canceled.status)"
Write-Host "errorMessage: $($canceled.errorMessage)"

Write-Host ""
Write-Host "=== 5. LISTAR COM FILTRO ==="
$pending = Invoke-RestMethod -Uri "$base/fiscal?status=CANCELED" -Method GET -Headers $auth
Write-Host "Cancelados: $($pending.items.Count)"
