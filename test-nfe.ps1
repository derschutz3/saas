$ErrorActionPreference = "Stop"
$jar = "C:\Users\FSOS\AppData\Local\Temp\nfe-cookie.txt"
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

# 1. Login
$login = (Call POST "http://localhost:3103/api/v1/auth/login" '{"email":"admin@demo.com","password":"admin123"}') | ConvertFrom-Json
$tok = $login.token
$p = $tok.Split('.')[1]
$pad = 4 - ($p.Length % 4)
if ($pad -lt 4) { $p += "=" * $pad }
$jwt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p)) | ConvertFrom-Json
$BID = $jwt.branchId
$TID = $jwt.tenantId
Write-Host "TENANT=$TID BRANCH=$BID" -ForegroundColor Gray

# 2. Listar categorias (pegar uma para o teste)
$cats = (Call GET "http://localhost:3103/api/v1/categories") | ConvertFrom-Json
$sysCat = $null
$bebidas = $null
foreach ($c in $cats.items) {
  if ($c.isSystem -and -not $sysCat) { $sysCat = $c }
  if ($c.name -eq "Bebidas" -and -not $c.isSystem -and -not $bebidas) { $bebidas = $c }
}
if (-not $bebidas) {
  $newCat = (Call POST "http://localhost:3103/api/v1/categories" '{"name":"Bebidas","color":"#0ea5e9"}') | ConvertFrom-Json
  $bebidas = $newCat
}
Write-Host "SYS=$($sysCat.id) BEBIDAS=$($bebidas.id)"

# 3. Parse NFe
Write-Host ""
Write-Host "=== 1. PARSE NFe XML ===" -ForegroundColor Cyan
$xml = '<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe35260112345678000199550010000123451000000011" versao="4.00"><ide><cUF>35</cUF><serie>1</serie><nNF>12345</nNF><dhEmi>2025-06-15T10:30:00-03:00</dhEmi></ide><emit><CNPJ>12345678000190</CNPJ><xNome>DISTRIBUIDORA EXEMPLO LTDA</xNome></emit><det nItem="1"><prod><cProd>SKU-NFE-001</cProd><xProd>REFRIGERANTE COLA 2L</xProd><uCom>UN</uCom><qCom>24.0000</qCom><vUnCom>9.50</vUnCom><vProd>228.00</vProd></prod></det><det nItem="2"><prod><cProd>SKU-NFE-002</cProd><xProd>AGUA MINERAL 500ML</xProd><uCom>UN</uCom><qCom>48.0000</qCom><vUnCom>2.10</vUnCom><vProd>100.80</vProd></prod></det><det nItem="3"><prod><cProd>SKU-NFE-003</cProd><xProd>CERVEJA PILSEN 350ML</xProd><uCom>UN</uCom><qCom>36.0000</qCom><vUnCom>3.80</vUnCom><vProd>136.80</vProd></prod></det><total><ICMSTot><vProd>465.60</vProd></ICMSTot></total></infNFe></NFe></nfeProc>'

$body = (@{ xml = $xml } | ConvertTo-Json -Compress)
$parse = (Call POST "http://localhost:3103/api/v1/agent/nfe/parse" $body) | ConvertFrom-Json
Write-Host "NFe: $($parse.nfeNumber) | Emitente: $($parse.issuerName) | Total: R$ $([math]::Round($parse.totalCents/100, 2))"
Write-Host "Produtos detectados: $($parse.products.Count)"
$parse.products | ForEach-Object {
  $exists = if ($_.existingProductId) { "[EXISTE]" } else { "[novo]" }
  Write-Host ("  {0}  {1,-30}  qty={2,5}  unit={3}  R$ {4}" -f $exists, $_.name, $_.quantity, $_.unit, [math]::Round($_.unitPriceCents/100, 2))
}

# 4. Commit (criar todos)
Write-Host ""
Write-Host "=== 2. COMMIT (criar com categoria Bebidas) ===" -ForegroundColor Cyan
$items = $parse.products | ForEach-Object {
  [PSCustomObject]@{
    sku = $_.sku
    name = $_.name
    unit = $_.unit
    quantity = $_.quantity
    categoryId = $bebidas.id
    addToStockIfExists = $false
  }
}
$body = (@{ items = $items } | ConvertTo-Json -Compress)
$r = (Call POST "http://localhost:3103/api/v1/agent/nfe/commit" $body) | ConvertFrom-Json
Write-Host "Summary: created=$($r.summary.created) updated=$($r.summary.updated) errors=$($r.summary.errors)"
$r.results | ForEach-Object {
  Write-Host ("  {0,-10} {1,-30}  id={2}" -f $_.status, $_.name, $_.productId)
}

# 5. Parse DENOVO (deve detectar como existente)
Write-Host ""
Write-Host "=== 3. PARSE NOVAMENTE (deve detectar SKUs existentes) ===" -ForegroundColor Cyan
$bodyParse = (@{ xml = $xml } | ConvertTo-Json -Compress)
$parse2 = (Call POST "http://localhost:3103/api/v1/agent/nfe/parse" $bodyParse) | ConvertFrom-Json
Write-Host "Produtos detectados: $($parse2.products.Count)"
$parse2.products | ForEach-Object {
  $exists = if ($_.existingProductId) { "[EXISTE]" } else { "[novo]" }
  Write-Host ("  {0}  {1,-30}  id={2}" -f $exists, $_.name, $_.existingProductId)
}

# 6. Commit somando ao estoque
Write-Host ""
Write-Host "=== 4. COMMIT (somando ao estoque) ===" -ForegroundColor Cyan
$items2 = $parse2.products | ForEach-Object {
  [PSCustomObject]@{
    sku = $_.sku
    name = $_.name
    unit = $_.unit
    quantity = 10
    categoryId = $bebidas.id
    addToStockIfExists = $true
  }
}
$bodyCommit2 = (@{ items = $items2 } | ConvertTo-Json -Compress)
$r2 = (Call POST "http://localhost:3103/api/v1/agent/nfe/commit" $bodyCommit2) | ConvertFrom-Json
Write-Host "Summary: created=$($r2.summary.created) updated=$($r2.summary.updated) errors=$($r2.summary.errors)"

# 7. Verificar inventário (consultar movements dos 3 produtos)
Write-Host ""
Write-Host "=== 5. VERIFICAR ESTOQUE (movements) ===" -ForegroundColor Cyan
$inv = (Call GET "http://localhost:3103/api/v1/products") | ConvertFrom-Json
$targetNames = @("REFRIGERANTE COLA 2L","AGUA MINERAL 500ML","CERVEJA PILSEN 350ML")
$inv.items | Where-Object { $_.name -in $targetNames } | ForEach-Object {
  $bal = (Call GET "http://localhost:3103/api/v1/inventory/balance?productId=$($_.id)") | ConvertFrom-Json
  Write-Host ("  {0,-30}  sku={1,-20}  qty={2,5}" -f $_.name, $_.sku, $bal.quantityBase)
}

# 8. Parse DANFE texto
Write-Host ""
Write-Host "=== 6. PARSE DE TEXTO DANFE ===" -ForegroundColor Cyan
$text = @"
DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA
Emitente: ACOUGUE BOI FORTE LTDA
CNPJ: 12.345.678/0001-90
N: 98765
REFRIGERANTE GUARANA 2L     20  UN   8.50   170.00
CARNE BOVINA ACOUGUE KG     15  KG  45.00   675.00
"@
$bodyDanfe = (@{ text = $text } | ConvertTo-Json -Compress)
$parse3 = (Call POST "http://localhost:3103/api/v1/agent/nfe/parse" $bodyDanfe) | ConvertFrom-Json
Write-Host "Produtos detectados: $($parse3.products.Count)"
$parse3.products | ForEach-Object {
  Write-Host ("  - {0,-30}  qty={1}  unit={2}" -f $_.name, $_.quantity, $_.unit)
}
