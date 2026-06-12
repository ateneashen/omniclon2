Get-Process omniclon2 -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*backend*' } | Stop-Process -Force
