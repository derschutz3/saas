$body = '{"email":"admin@demo.com","password":"admin123"}'
try {
  $r = Invoke-WebRequest -Method Post -Uri 'http://localhost:3103/api/v1/auth/login' -ContentType 'application/json' -Body $body -SessionVariable s -UseBasicParsing
  Write-Host ('Login status: ' + $r.StatusCode)
  Write-Host 'Response headers:'
  $r.Headers | Format-Table -AutoSize
  Write-Host 'Response body:'
  Write-Host $r.Content
  Write-Host '---'
  Write-Host 'Session cookies:'
  if ($s -and $s.Cookies) {
    $s.Cookies | ForEach-Object {
      Write-Host ('  Name: ' + $_.Name + ' = Value: ' + $_.Value)
    }
  } else {
    Write-Host '  none'
  }
  Write-Host '---'
  Write-Host 'Test request com session:'
  $r2 = Invoke-RestMethod -Method Post -Uri 'http://localhost:3103/api/v1/dev/seed-agent' -WebSession $s
  $r2 | ConvertTo-Json -Depth 3
} catch {
  Write-Host ('ERRO: ' + $_.Exception.Message)
}
