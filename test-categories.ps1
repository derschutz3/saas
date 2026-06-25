$ErrorActionPreference = "Stop"
$jar = "C:\Users\FSOS\AppData\Local\Temp\cat-cookie.txt"
Remove-Item $jar -ErrorAction SilentlyContinue
$enc = New-Object System.Text.UTF8Encoding($False)

function Body([string]$s) {
  $f = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($f, $s, $enc)
  return $f
}
function Call([string]$method, [string]$uri, [string]$body = $null) {
  $args = @("-s","-b",$jar,"-c",$jar,"-H","Origin: http://localhost:3103","-X",$method)
  $bf = $null
  if ($body) {
    $bf = Body $body
    $args += @("-H","Content-Type: application/json","--data-binary","@$bf")
  }
  $args += @($uri)
  $r = (& curl.exe @args 2>$null) -join "`n"
  if ($bf) { Remove-Item $bf }
  return $r
}

# Login
$login = (Call POST "http://localhost:3103/api/v1/auth/login" '{"email":"admin@demo.com","password":"admin123"}') | ConvertFrom-Json
$tok = $login.token
$p = $tok.Split('.')[1]
$pad = 4 - ($p.Length % 4)
if ($pad -lt 4) { $p += "=" * $pad }
$jwt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p)) | ConvertFrom-Json
$BID = $jwt.branchId
$TID = $jwt.tenantId
Write-Host "BRANCH=$BID TENANT=$TID" -ForegroundColor Gray

# 1. Listar
Write-Host ""
Write-Host "=== 1. LISTAR CATEGORIAS [inicial] ===" -ForegroundColor Cyan
$r = (Call GET "http://localhost:3103/api/v1/categories") | ConvertFrom-Json
$r.items | ForEach-Object { Write-Host ("  - {0} isSystem={1} count={2}" -f $_.name, $_.isSystem, $_.productCount) }

# 2. Criar 3 categorias
Write-Host ""
Write-Host "=== 2. CRIAR CATEGORIAS ===" -ForegroundColor Cyan
$catBebidas = (Call POST "http://localhost:3103/api/v1/categories" '{"name":"Bebidas","description":"Bebidas em geral","color":"#0ea5e9","icon":"Wine"}') | ConvertFrom-Json
Write-Host "  + Criado: $($catBebidas.name) ($($catBebidas.id))" -ForegroundColor Green
$catAlcool = (Call POST "http://localhost:3103/api/v1/categories" '{"name":"Alcoólicos","description":"Cervejas e destilados","color":"#f43f5e","icon":"Beer"}') | ConvertFrom-Json
Write-Host "  + Criado: $($catAlcool.name) ($($catAlcool.id))" -ForegroundColor Green
$catLimpeza = (Call POST "http://localhost:3103/api/v1/categories" '{"name":"Limpeza","color":"#10b981","icon":"Sparkles"}') | ConvertFrom-Json
Write-Host "  + Criado: $($catLimpeza.name) ($($catLimpeza.id))" -ForegroundColor Green

# 3. Tentar criar duplicada
Write-Host ""
Write-Host "=== 3. CRIAR DUPLICADA (deve dar erro 400) ===" -ForegroundColor Cyan
$dup = (Call POST "http://localhost:3103/api/v1/categories" '{"name":"Bebidas"}') | ConvertFrom-Json
Write-Host "  $dup" -ForegroundColor Yellow

# 4. Reordenar
Write-Host ""
Write-Host "=== 4. REORDENAR (Limpeza primeiro) ===" -ForegroundColor Cyan
$ids = @($catLimpeza.id, $catBebidas.id, $catAlcool.id)
$body = (@{ orderedIds = $ids } | ConvertTo-Json -Compress)
$r = (Call PUT "http://localhost:3103/api/v1/categories/reorder" $body) | ConvertFrom-Json
$r.items | ForEach-Object { Write-Host "  pos=$($_.position) $($_.name)" }

# 5. Listar produtos e mover
Write-Host ""
Write-Host "=== 5. MOVER Heineken e Brahma para Alcoólicos ===" -ForegroundColor Cyan
$prods = (Call GET "http://localhost:3103/api/v1/products") | ConvertFrom-Json
$moveIds = @($prods.items | Where-Object { $_.sku -eq "HEINEKEN-350" -or $_.sku -eq "BRAHMA-350" } | ForEach-Object { $_.id })
Write-Host "  IDs: $moveIds"
$body = (@{ productIds = $moveIds; targetCategoryId = $catAlcool.id } | ConvertTo-Json -Compress)
$r = (Call POST "http://localhost:3103/api/v1/categories/bulk-move" $body) | ConvertFrom-Json
Write-Host "  Movidos: $($r.moved)" -ForegroundColor Green

# 6. Listar produtos de uma categoria
Write-Host ""
Write-Host "=== 6. LISTAR PRODUTOS POR CATEGORIA ===" -ForegroundColor Cyan
$r = (Call GET "http://localhost:3103/api/v1/products?categoryId=$($catAlcool.id)") | ConvertFrom-Json
$r.items | ForEach-Object { Write-Host "  - $($_.name) (cat=$($_.categoryId))" }

# 7. Editar categoria
Write-Host ""
Write-Host "=== 7. EDITAR Bebidas ===" -ForegroundColor Cyan
$body = '{"name":"Bebidas (revisado)","color":"#22c55e"}'
$r = (Call PATCH "http://localhost:3103/api/v1/categories/$($catBebidas.id)" $body) | ConvertFrom-Json
Write-Host "  Renomeada: $($r.name) cor=$($r.color)" -ForegroundColor Green

# 8. Tentar arquivar sistema (deve dar 400)
Write-Host ""
Write-Host "=== 8. ARQUIVAR SISTEMA (deve dar 400) ===" -ForegroundColor Cyan
$sysId = (Call GET "http://localhost:3103/api/v1/categories") | ConvertFrom-Json
$sysId = $sysId.items | Where-Object { $_.isSystem } | Select-Object -First 1
$r = (Call POST "http://localhost:3103/api/v1/categories/$($sysId.id)/archive") | ConvertFrom-Json
Write-Host "  $r" -ForegroundColor Yellow

# 9. Excluir Limpeza movendo itens para "Sem categoria" (deve mover 0 itens)
Write-Host ""
Write-Host "=== 9. EXCLUIR Limpeza (sem fallback, move tudo para 'Sem categoria') ===" -ForegroundColor Cyan
$body = '{"fallbackCategoryId":null}'
$r = (Call DELETE "http://localhost:3103/api/v1/categories/$($catLimpeza.id)" $body) | ConvertFrom-Json
Write-Host "  Deletada: $($r.deletedId), movidos: $($r.movedItems)" -ForegroundColor Green

# 10. Tentar excluir a última categoria (deve dar 400)
Write-Host ""
Write-Host "=== 10. EXCLUIR ÚNICA CATEGORIA (deve dar 400) ===" -ForegroundColor Cyan
# criar uma temporária e excluir a outra
$body = '{"fallbackCategoryId":null}'
$r = (Call DELETE "http://localhost:3103/api/v1/categories/$($catBebidas.id)" $body) | ConvertFrom-Json
Write-Host "  $r" -ForegroundColor Yellow
$r = (Call DELETE "http://localhost:3103/api/v1/categories/$($catAlcool.id)" $body) | ConvertFrom-Json
Write-Host "  $r" -ForegroundColor Yellow

# 11. Listar final
Write-Host ""
Write-Host "=== 11. LISTAR FINAL ===" -ForegroundColor Cyan
$r = (Call GET "http://localhost:3103/api/v1/categories") | ConvertFrom-Json
$r.items | ForEach-Object { Write-Host ("  - {0} isSystem={1} count={2}" -f $_.name, $_.isSystem, $_.productCount) }
