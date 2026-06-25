Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3001,3103) } | ForEach-Object {
  try {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host ("Killed PID " + $_.OwningProcess + " on port " + $_.LocalPort)
  } catch {
    Write-Host ("Skip: " + $_.Exception.Message)
  }
}
Start-Sleep -Seconds 1
Write-Host "---"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3001,3103) } | Format-Table -AutoSize
