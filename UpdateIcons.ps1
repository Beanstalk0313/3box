
$ResourceHackerPath = "D:\Applications\3box\Setup\resourcehacker\ResourceHacker.exe"
$TargetExe = "D:\Applications\3box\Setup\steam_cracker\steam_auto_cracker_gui.exe"
$IconPath = "D:\Applications\3box\Setup\assets\3box logo.ico"

Write-Host "Updating icon for $TargetExe..." -ForegroundColor Cyan

# 1. Delete the existing icon group
& $ResourceHackerPath -open $TargetExe -save $TargetExe -action delete -mask ICONGROUP,1,0 -log CONSOLE

# 2. Add the new icon group
& $ResourceHackerPath -open $TargetExe -save $TargetExe -resource $IconPath -action addoverwrite -mask ICONGROUP,1,0 -log CONSOLE

Write-Host "Icon updated. Refreshing Windows icon cache..." -ForegroundColor Yellow

# 3. Clear Icon Cache
$explorerCachePath = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Explorer"
taskkill /f /im explorer.exe
Get-ChildItem -Path $explorerCachePath -Filter "iconcache_*.db" | ForEach-Object {
    attrib -h $_.FullName
    Remove-Item $_.FullName -Force
}

# 4. Restart Explorer
Start-Process explorer.exe

Write-Host "Rebrand icon update complete." -ForegroundColor Green
