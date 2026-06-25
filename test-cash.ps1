$login = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"admin@demo.com","password":"admin123"}' -UseBasicParsing
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "=== ABRIR CAIXA ===" -ForegroundColor Cyan
$body = @{ operatorName = "Maria Caixa"; registerName = "Caixa Teste"; openingCents = 5000 } | ConvertTo-Json
$open = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/cash/sessions' -Method POST -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing
$session = $open.Content | ConvertFrom-Json
Write-Host "Aberto: id=$($session.id) opening=$($session.openingCents)"

Write-Host "`n=== SESSAO ABERTA ===" -ForegroundColor Cyan
$current = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/cash/session/open' -Method GET -Headers $headers -UseBasicParsing
$currentObj = $current.Content | ConvertFrom-Json
Write-Host "Operator: $($currentObj.session.operatorName) status=$($currentObj.session.status)"

Write-Host "`n=== REGISTRAR VENDA ===" -ForegroundColor Cyan
$body2 = @{ sessionId = $session.id; type = "sale"; amountCents = 15000; reason = "Venda balcão" } | ConvertTo-Json
$sale = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/cash/movements' -Method POST -Headers $headers -ContentType 'application/json' -Body $body2 -UseBasicParsing
$saleObj = $sale.Content | ConvertFrom-Json
Write-Host "Movimento criado: type=$($saleObj.type) amount=$($saleObj.amountCents)"

Write-Host "`n=== REGISTRAR SANGRIA ===" -ForegroundColor Cyan
$body3 = @{ sessionId = $session.id; type = "withdrawal"; amountCents = -3000; reason = "Sangria para depósito" } | ConvertTo-Json
$w = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/cash/movements' -Method POST -Headers $headers -ContentType 'application/json' -Body $body3 -UseBasicParsing
Write-Host "Sangria OK"

Write-Host "`n=== EXPECTED ATUAL ===" -ForegroundColor Cyan
$expected = (Invoke-WebRequest -Uri "http://localhost:3103/api/v1/cash/session/open" -Method GET -Headers $headers -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Expected: $($expected.session.expectedCents) cents"

Write-Host "`n=== FECHAR CAIXA ===" -ForegroundColor Cyan
$closeBody = @{ closingCents = 17000; notes = "Fechamento teste" } | ConvertTo-Json
$close = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/cash/sessions/$($session.id)/close" -Method POST -Headers $headers -ContentType 'application/json' -Body $closeBody -UseBasicParsing
$closeObj = $close.Content | ConvertFrom-Json
Write-Host "Fechado: status=$($closeObj.status) closing=$($closeObj.closingCents) diff=$($closeObj.differenceCents)"
