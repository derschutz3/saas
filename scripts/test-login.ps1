$base = "http://localhost:3103/api/v1"
$loginBody = '{"email":"admin@demo.com","password":"admin123"}'
Write-Host "=== LOGIN ==="
$loginRes = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -Headers @{"x-tenant-id"="tnt_default"}
Write-Host "Full: $($loginRes | ConvertTo-Json -Depth 5)"
