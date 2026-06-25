$body = '{"email":"admin@demo.com","password":"admin123"}'
$r = Invoke-RestMethod -Method Post -Uri 'http://localhost:3103/api/v1/auth/login' -ContentType 'application/json' -Body $body -SessionVariable s

$from = (Get-Date).AddDays(-30).ToString('o')
$to = (Get-Date).ToString('o')
$fromEnc = [Uri]::EscapeDataString($from)
$toEnc = [Uri]::EscapeDataString($to)

Write-Host '--- OVERVIEW ---'
$ov = Invoke-RestMethod -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/overview?from=' + $fromEnc + '&to=' + $toEnc) -WebSession $s
$ov | ConvertTo-Json -Depth 5

Write-Host '--- TIMESERIES (day) ---'
$ts = Invoke-RestMethod -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/timeseries?from=' + $fromEnc + '&to=' + $toEnc + '&granularity=day') -WebSession $s
Write-Host ('  total pontos: ' + $ts.series.Count)
$ts.series | Select-Object -First 5 | Format-Table -AutoSize

Write-Host '--- TOP PRODUTOS (revenue) ---'
$tp = Invoke-RestMethod -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/products?from=' + $fromEnc + '&to=' + $toEnc + '&limit=5') -WebSession $s
$tp | ConvertTo-Json -Depth 4

Write-Host '--- CANAIS ---'
$ch = Invoke-RestMethod -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/channels?from=' + $fromEnc + '&to=' + $toEnc) -WebSession $s
$ch | ConvertTo-Json -Depth 4

Write-Host '--- TOP CLIENTES ---'
$tc = Invoke-RestMethod -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/customers?from=' + $fromEnc + '&to=' + $toEnc + '&limit=5') -WebSession $s
$tc | ConvertTo-Json -Depth 4

Write-Host '--- EXPORT CSV (primeiras 5 linhas) ---'
$csv = Invoke-WebRequest -Method Get -Uri ('http://localhost:3103/api/v1/reports/sales/export?from=' + $fromEnc + '&to=' + $toEnc + '&format=csv') -WebSession $s
$csv.Content.Split("`n") | Select-Object -First 5
