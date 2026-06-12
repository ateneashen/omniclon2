# Kill any running OmniClon 2 app and its Python backend sidecars
Get-Process -Name 'omniclon2' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name 'python' -ErrorAction SilentlyContinue | Where-Object {
    $p = $_.Path
    $p -like '*\OmniClon2\*' -or $p -like '*\Klonin\*'
} | Stop-Process -Force
Start-Sleep -Milliseconds 500
