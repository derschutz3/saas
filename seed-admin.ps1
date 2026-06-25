$body = '{"email":"admin@demo.com","password":"admin123"}'
$r = Invoke-RestMethod -Method Post -Uri 'http://localhost:3103/api/v1/auth/login' -ContentType 'application/json' -Body $body -SessionVariable s
$seed = Invoke-RestMethod -Method Post -Uri 'http://localhost:3103/api/v1/dev/seed-agent' -WebSession $s
$seed | ConvertTo-Json -Depth 4
