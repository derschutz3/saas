$BASE = "http://localhost:3103"
$ORIGIN = "http://localhost:3103"
$jar = [System.IO.Path]::GetTempFileName()
$enc = New-Object System.Text.UTF8Encoding($False)

function Body([string]$s) {
  $f = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($f, $s, $enc)
  return $f
}

$loginBody = Body '{"email":"admin@demo.com","password":"admin123"}'
& curl.exe -s -o NUL -b $jar -c $jar -H "Content-Type: application/json" -H "Origin: $ORIGIN" -X POST --data-binary "@$loginBody" "$BASE/api/v1/auth/login" 2>$null | Out-Null
Remove-Item $loginBody

function Test-Agent([string]$name, [string]$method, [string]$uri, [string]$body) {
  $args = @("-s","-b",$jar,"-c",$jar,"-H","Origin: $ORIGIN","-X",$method)
  $bf = $null
  if ($body) {
    $bf = Body $body
    $args += @("-H","Content-Type: application/json","--data-binary","@$bf")
  }
  $args += @($uri)
  $r = & curl.exe @args 2>$null
  if ($bf) { Remove-Item $bf }
  Write-Host "=== $name ==="
  Write-Host $r
  Write-Host ""
}

$cervejaA = "3bdf3826-95d3-47dc-acff-3d8131341b06"
$cervejaB = "190af6f8-10b2-4cba-9c96-a5d06eacc775"

Test-Agent "1. analysis Cerveja A" GET "$BASE/api/v1/agent/products/$cervejaA/analysis?branchId=br_default" $null
Test-Agent "2. recurring Bar do Ze" GET "$BASE/api/v1/agent/customers/11999887766/recurring?branchId=br_default" $null

$body3 = '{"branchId":"br_default","customerPhone":"11999887766","customerName":"Bar do Ze","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":50}]}'
Test-Agent "3. check-alert (50 un = mesma compra anterior, estoque 80)" POST "$BASE/api/v1/agent/orders/check-alert" $body3

Test-Agent "4. insights" GET "$BASE/api/v1/agent/insights?branchId=br_default&limit=10" $null

$body5 = '{"branchId":"br_default","customerPhone":"11999887766","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":30}]}'
Test-Agent "5. check-alert 30 un (abaixo de 80% de 50)" POST "$BASE/api/v1/agent/orders/check-alert" $body5

$body6 = '{"branchId":"br_default","customerPhone":"11999887766","items":[{"productId":"'+$cervejaA+'","productName":"Cerveja Pilsen 350ml","quantityBase":10}]}'
Test-Agent "6. check-alert 10 un (muito abaixo)" POST "$BASE/api/v1/agent/orders/check-alert" $body6

Remove-Item $jar -ErrorAction SilentlyContinue
