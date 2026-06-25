$base = "http://localhost:3103/api/v1"
$loginBody = '{"email":"admin@demo.com","password":"admin123"}'
$loginRes = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -Headers @{"x-tenant-id"="tnt_default"}
$token = $loginRes.token

# Decode JWT payload
$payload = $token.Split('.')[1]
while ($payload.Length % 4) { $payload += "=" }
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
$payloadObj = $decoded | ConvertFrom-Json
$tenantId = $payloadObj.tenantId
$branchId = $payloadObj.branchId

Write-Host "tenantId: $tenantId"
Write-Host "branchId: $branchId"

$auth = @{
  "Authorization" = "Bearer $token"
  "x-tenant-id" = $tenantId
  "x-branch-id" = $branchId
}

Write-Host ""
Write-Host "=== 1. ABRIR CAIXA ==="
$openBody = '{"registerName":"Caixa Principal","operatorName":"Debug","openingCents":10000,"notes":"Teste"}'
$open = Invoke-RestMethod -Uri "$base/cash/sessions" -Method POST -Headers $auth -ContentType "application/json" -Body $openBody
$sessionId = $open.id
Write-Host "id: $sessionId"
Write-Host "status: $($open.status)"
Write-Host "expectedCents: $($open.expectedCents)"
Write-Host "registerName: $($open.registerName)"

Write-Host ""
Write-Host "=== 2. ADICIONAR VENDA ==="
$mvBody = "{`"sessionId`":`"$sessionId`",`"type`":`"sale`",`"amountCents`":5000,`"reason`":`"Venda balcao`"}"
$mv = Invoke-RestMethod -Uri "$base/cash/movements" -Method POST -Headers $auth -ContentType "application/json" -Body $mvBody
Write-Host "movement id: $($mv.id)"
Write-Host "type: $($mv.type)"
Write-Host "amount: $($mv.amountCents)"

Write-Host ""
Write-Host "=== 3. SESSAO ATIVA ==="
$current = Invoke-RestMethod -Uri "$base/cash/session/open" -Method GET -Headers $auth
Write-Host "status: $($current.session.status)"
Write-Host "expectedCents: $($current.session.expectedCents)"

Write-Host ""
Write-Host "=== 4. LISTAR SESSOES ==="
$sessions = Invoke-RestMethod -Uri "$base/cash/sessions" -Method GET -Headers $auth
Write-Host "total: $($sessions.items.Count)"
foreach ($s in $sessions.items) {
  Write-Host "  - id: $($s.id) status: $($s.status) opening: $($s.openingCents) expected: $($s.expectedCents)"
}

Write-Host ""
Write-Host "=== 5. FECHAR CAIXA ==="
$closeBody = '{"closingCents":15000,"notes":"Fim do turno"}'
$closed = Invoke-RestMethod -Uri "$base/cash/sessions/$sessionId/close" -Method POST -Headers $auth -ContentType "application/json" -Body $closeBody
Write-Host "status: $($closed.status)"
Write-Host "closingCents: $($closed.closingCents)"
Write-Host "expectedCents: $($closed.expectedCents)"
Write-Host "differenceCents: $($closed.differenceCents)"
