try {
  $r = Invoke-WebRequest "http://localhost:3100/api/integrations/providers" -Headers @{"x-tenant-id"="tnt_default"} -UseBasicParsing -ErrorAction Stop
  Write-Host "STATUS: $($r.StatusCode)"
  Write-Host "BODY (200): $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
} catch {
  Write-Host "ERR: $($_.Exception.Message)"
}
