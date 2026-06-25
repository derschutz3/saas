$conns = Get-NetTCPConnection -LocalPort 3103 -ErrorAction SilentlyContinue
if ($conns) {
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }
  Write-Host "Killed processes on 3103"
} else {
  Write-Host "No process on 3103"
}
