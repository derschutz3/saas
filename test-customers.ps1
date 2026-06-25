$login = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"admin@demo.com","password":"admin123"}' -UseBasicParsing
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "=== STATS ===" -ForegroundColor Cyan
$stats = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/customers/stats' -Method GET -Headers $headers -UseBasicParsing
$statsObj = $stats.Content | ConvertFrom-Json
Write-Host "Total: $($statsObj.total) | Active: $($statsObj.active) | VIP: $($statsObj.vip)"

Write-Host "`n=== LIST ===" -ForegroundColor Cyan
$list = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/customers' -Method GET -Headers $headers -UseBasicParsing
$items = ($list.Content | ConvertFrom-Json).items
foreach ($c in $items) { Write-Host " - $($c.name) | tags: $($c.tags -join ',') | lifecycle: $($c.lifecycle)" }

Write-Host "`n=== FILTER lifecycle=lead ===" -ForegroundColor Cyan
$filtered = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/customers?lifecycle=lead' -Method GET -Headers $headers -UseBasicParsing
$filteredItems = ($filtered.Content | ConvertFrom-Json).items
Write-Host "Encontrados: $($filteredItems.Count)"

Write-Host "`n=== CREATE ===" -ForegroundColor Cyan
$body = @{
  name = "Cliente Teste E2E"
  taxId = "55.666.777/0001-88"
  email = "e2e@cliente.com.br"
  phone = "11977776666"
  whatsapp = "11977776666"
  city = "São Paulo"
  state = "SP"
  tags = @("VIP", "Teste")
  lifecycle = "active"
  creditLimitCents = 100000
} | ConvertTo-Json
$created = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/customers' -Method POST -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing
$createdObj = $created.Content | ConvertFrom-Json
Write-Host "Created: $($createdObj.name) | tags: $($createdObj.tags -join ',')"

Write-Host "`n=== STATS APOS CREATE ===" -ForegroundColor Cyan
$stats2 = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/customers/stats' -Method GET -Headers $headers -UseBasicParsing
$statsObj2 = $stats2.Content | ConvertFrom-Json
Write-Host "Total: $($statsObj2.total) | VIP: $($statsObj2.vip)"

Write-Host "`n=== DELETE ===" -ForegroundColor Cyan
$del = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/customers/$($createdObj.id)" -Method DELETE -Headers $headers -UseBasicParsing
Write-Host "Deletado: $($del.Content)"
