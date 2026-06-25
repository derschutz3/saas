$login = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"admin@demo.com","password":"admin123"}' -UseBasicParsing
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$body = @{ operatorName = "Debug"; openingCents = 1000 } | ConvertTo-Json
$open = Invoke-WebRequest -Uri 'http://localhost:3103/api/v1/cash/sessions' -Method POST -Headers $headers -ContentType 'application/json' -Body $body -UseBasicParsing
Write-Host $open.Content
