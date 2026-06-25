$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "=== 1) Login (com session) ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@demo.com","password":"admin123"}' -UseBasicParsing -TimeoutSec 10 -WebSession $session
Write-Host "Code: $($r.StatusCode)"
Write-Host "Cookies: $($session.Cookies | ForEach-Object { "$($_.Name)=$($_.Value.Substring(0,30))...; HttpOnly=$($_.HttpOnly)" })"

Write-Host "`n=== 2) /me COM session ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/me" -Method GET -UseBasicParsing -TimeoutSec 10 -WebSession $session
Write-Host "Code: $($r.StatusCode)"
Write-Host "Body: $($r.Content)"

Write-Host "`n=== 3) /api/v1/products COM session ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/products" -Method GET -UseBasicParsing -TimeoutSec 10 -WebSession $session
Write-Host "Code: $($r.StatusCode)"

Write-Host "`n=== 4) Logout COM session ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/logout" -Method POST -UseBasicParsing -TimeoutSec 10 -WebSession $session
Write-Host "Code: $($r.StatusCode)"

Write-Host "`n=== 5) /me APOS logout ===" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/me" -Method GET -UseBasicParsing -TimeoutSec 10 -WebSession $session
  Write-Host "Code: $($r.StatusCode)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "Code: $code (esperado 401)"
}

Write-Host "`n=== 6) /api/v1/auth/login via NEXT.JS proxy (3103) ===" -ForegroundColor Cyan
$session2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@demo.com","password":"admin123"}' -UseBasicParsing -TimeoutSec 10 -WebSession $session2
Write-Host "Code: $($r.StatusCode)"
Write-Host "Body (200): $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"

Write-Host "`n=== 7) /me via NEXT.JS proxy (3103) com session ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/auth/me" -Method GET -UseBasicParsing -TimeoutSec 10 -WebSession $session2
Write-Host "Code: $($r.StatusCode)"
Write-Host "Body: $($r.Content)"

Write-Host "`n=== 8) /api/v1/products via NEXT.JS proxy com session ===" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "http://localhost:3103/api/v1/products" -Method GET -UseBasicParsing -TimeoutSec 10 -WebSession $session2
Write-Host "Code: $($r.StatusCode)"
Write-Host "Body (200): $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
