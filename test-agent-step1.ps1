$BASE = "http://localhost:3103"
$ORIGIN = "http://localhost:3103"
$jar = [System.IO.Path]::GetTempFileName()
$enc = New-Object System.Text.UTF8Encoding($False)

function Body([string]$s) {
  $f = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($f, $s, $enc)
  return $f
}

function Get-Body([string]$method, [string]$uri, [string]$body) {
  $args = @("-s","-b",$jar,"-c",$jar,"-H","Origin: $ORIGIN","-X",$method)
  $bf = $null
  if ($body) {
    $bf = Body $body
    $args += @("-H","Content-Type: application/json","--data-binary","@$bf")
  }
  $args += @($uri)
  $r = & curl.exe @args 2>$null
  if ($bf) { Remove-Item $bf }
  return $r
}

# Login
$loginBody = Body '{"email":"admin@demo.com","password":"admin123"}'
& curl.exe -s -o NUL -b $jar -c $jar -H "Content-Type: application/json" -H "Origin: $ORIGIN" -X POST --data-binary "@$loginBody" "$BASE/api/v1/auth/login" 2>$null | Out-Null
Remove-Item $loginBody

Write-Host "=== STEP 1: SEED ==="
Get-Body POST "$BASE/api/v1/dev/seed-agent" '{"branchId":"br_default"}'
Write-Host ""
Write-Host "=== STEP 2: Listar produtos ==="
$prods = Get-Body GET "$BASE/api/v1/products" $null
Write-Host $prods.Substring(0, [Math]::Min(2000, $prods.Length))
Write-Host ""

Remove-Item $jar -ErrorAction SilentlyContinue
