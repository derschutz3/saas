$conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3103 }
foreach ($c in $conn) {
  $pid_ = $c.OwningProcess
  try {
    $proc = Get-Process -Id $pid_ -ErrorAction Stop
    Write-Host ("PID " + $pid_ + " -> " + $proc.ProcessName + " (CLI: " + $proc.CommandLine + ")")
    Stop-Process -Id $pid_ -Force -ErrorAction Stop
    Write-Host ("  killed")
  } catch {
    Write-Host ("Skip PID " + $pid_ + ": " + $_.Exception.Message)
  }
}
Start-Sleep -Seconds 2
$conn2 = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3103 }
Write-Host ("Apos cleanup: " + $conn2.Count + " conexoes na 3103")
