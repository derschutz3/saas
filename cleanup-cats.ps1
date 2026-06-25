# Limpa todas categorias do admin@demo.com
$body = '{"email":"admin@demo.com","password":"admin123"}'
$r = Invoke-RestMethod -Method Post -Uri 'http://localhost:3103/api/v1/auth/login' -ContentType 'application/json' -Body $body -SessionVariable s
$r2 = Invoke-RestMethod -Method Get -Uri 'http://localhost:3103/api/v1/categories' -WebSession $s
foreach ($c in $r2.items) {
  if (-not $c.isSystem) {
    try {
      $payload = '{"fallbackCategoryId":null}'
      Invoke-RestMethod -Method Delete -Uri ('http://localhost:3103/api/v1/categories/' + $c.id) -WebSession $s -ContentType 'application/json' -Body $payload | Out-Null
      Write-Host ('Deleted: ' + $c.name)
    } catch {
      Write-Host ('Skip: ' + $c.name + ' - ' + $_.Exception.Message)
    }
  }
}
$r3 = Invoke-RestMethod -Method Get -Uri 'http://localhost:3103/api/v1/categories' -WebSession $s
Write-Host ('--- Restantes: ' + $r3.items.Count)
$r3.items | ForEach-Object { Write-Host ('  ' + $_.name + ' (' + $_.id + ')') }
