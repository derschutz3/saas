try {
  $r = Invoke-WebRequest "http://localhost:3103/integrations/providers" -Headers @{"x-tenant-id"="tnt_default"} -UseBasicParsing -ErrorAction Stop
  Write-Host $r.Content.Substring(0, [Math]::Min(300, $r.Content.Length))
} catch {
  Write-Host "ERR: $($_.Exception.Message)"
}
