$ErrorActionPreference = "Stop"
$jar = New-Object System.Net.CookieContainer
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.CookieContainer = $jar
$client = New-Object System.Net.Http.HttpClient($handler)

$loginJson = '{"email":"admin@demo.com","password":"admin123"}'
$loginContent = New-Object System.Net.Http.StringContent($loginJson, [System.Text.Encoding]::UTF8, 'application/json')
$loginResp = $client.PostAsync('http://localhost:3103/api/v1/auth/login', $loginContent).Result
Write-Host ('Login: ' + $loginResp.StatusCode)
$cookies = $jar.GetCookies([Uri]'http://localhost:3103')
foreach ($c in $cookies) {
  Write-Host ('  Cookie: ' + $c.Name + ' = ' + $c.Value.Substring(0, 30) + '...')
}

Write-Host '--- Test seed-sales-data com cookie ---'
$bodyContent = New-Object System.Net.Http.StringContent('{"days": 5}', [System.Text.Encoding]::UTF8, 'application/json')
try {
  $resp = $client.PostAsync('http://localhost:3103/api/v1/dev/seed-sales-data', $bodyContent).Result
  Write-Host ('Status: ' + $resp.StatusCode)
  $respBody = $resp.Content.ReadAsStringAsync().Result
  Write-Host ('Body: ' + $respBody)
} catch {
  Write-Host ('ERRO: ' + $_.Exception.Message)
}
