# Step 2: Remove self-signed certificates
$removed = 0
Get-ChildItem "Cert:\LocalMachine\Root" -EA SilentlyContinue | Where-Object {
    $_.Subject -match 'self-serve\.windsurf|Dao' -or $_.FriendlyName -match 'Dao'
} | ForEach-Object {
    Write-Host "Removing: $($_.Subject) [$($_.Thumbprint)]"
    try {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","LocalMachine")
        $store.Open("ReadWrite")
        $store.Remove($_)
        $store.Close()
        Write-Host "  Removed OK"
        $removed++
    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
    }
}
Write-Host "Removed $removed certificates"
