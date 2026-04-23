# RebrandTo3box.ps1
# Automates the rebranding of s&box to 3box

Write-Host "Starting Rebrand to 3box..." -ForegroundColor Cyan

$RepoRoot = Get-Location

# 1. Replace Icons and Logos
Write-Host "Updating Icons and Logos..." -ForegroundColor Yellow

# Ensure source files exist
if (-not (Test-Path "3box.ico") -or -not (Test-Path "3box.png")) {
    Write-Error "3box.ico or 3box.png not found in root! Please provide them."
    exit
}

$IconTargets = @(
    "engine/Launcher/Sbox/sbox.ico",
    "engine/Launcher/SboxBench/sbox.ico",
    "engine/Launcher/SboxDev/sbox-dev.ico",
    "engine/Launcher/SboxProfiler/sbox-profiler.ico",
    "engine/Launcher/SboxServer/sbox-server.ico",
    "engine/Launcher/SboxStandalone/sbox.ico",
    "engine/Launcher/StandaloneTest/icon.ico",
    "engine/Tools/MenuBuild/icon.ico",
    "engine/Tools/ShaderCompiler/icon.ico",
    "game/core/tools/images/start_screen/game.ico"
)

foreach ($target in $IconTargets) {
    $dest = Join-Path $RepoRoot $target
    if (Test-Path (Split-Path $dest)) {
        Copy-Item "3box.ico" $dest -Force
        Write-Host "  Updated $target"
    }
}

$PngTargets = @(
    "game/core/tools/images/logo_grayscale.png",
    "game/core/tools/images/logo_rounded.png",
    "game/core/tools/images/start_screen/logo.png",
    "game/core/tools/images/splash_screen.png",
    "game/core/tools/images/model_editor/appicon.png",
    "game/addons/tools/assets/sbox.png",
    "game/addons/menu/Assets/ui/3box.png"
)

foreach ($target in $PngTargets) {
    $dest = Join-Path $RepoRoot $target
    if (Test-Path (Split-Path $dest)) {
        Copy-Item "3box.png" $dest -Force
        Write-Host "  Updated $target"
    }
}

# 2. Modify Build Tool to skip overwriting branding
Write-Host "Patching DownloadPublicArtifacts.cs..." -ForegroundColor Yellow
$ArtifactStepPath = "engine/Tools/SboxBuild/Steps/DownloadPublicArtifacts.cs"
if (Test-Path $ArtifactStepPath) {
    $content = Get-Content $ArtifactStepPath -Raw
    if ($content -notmatch "Skip downloading images") {
        $oldText = 'if ( nativeBinariesOnly && !entry.Path.StartsWith( "game/bin/", StringComparison.OrdinalIgnoreCase ) )
                        {
                                Interlocked.Increment( ref skippedCount );
                                return;
                        }'
        $newText = 'if ( nativeBinariesOnly && !entry.Path.StartsWith( "game/bin/", StringComparison.OrdinalIgnoreCase ) )
                        {
                                Interlocked.Increment( ref skippedCount );
                                return;
                        }

                        // Skip downloading images and icons to preserve custom branding
                        if ( entry.Path.EndsWith( ".ico", StringComparison.OrdinalIgnoreCase ) ||
                             entry.Path.EndsWith( ".png", StringComparison.OrdinalIgnoreCase ) ||
                             entry.Path.EndsWith( ".svg", StringComparison.OrdinalIgnoreCase ) )
                        {
                                Interlocked.Increment( ref skippedCount );
                                return;
                        }'
        $content = $content.Replace($oldText, $newText)
        Set-Content $ArtifactStepPath $content
        Write-Host "  Patched $ArtifactStepPath"
    }
}

# 3. String Replacements
Write-Host "Performing String Replacements..." -ForegroundColor Yellow

$FilesToProcess = Get-ChildItem -Recurse -Include *.cs,*.csproj,*.sln,*.bat,*.razor,*.scss,*.md | Where-Object { 
    $_.FullName -notmatch "\\obj\\" -and $_.FullName -notmatch "\\bin\\" -and $_.FullName -notmatch "\\\.git\\"
}

foreach ($file in $FilesToProcess) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content

    # Global renames
    $content = $content -replace "s&box", "3box"
    $content = $content -replace "S&box", "3box"
    
    # Specific UI/Title renames
    $content = $content -replace "Welcome to the sbox editor", "Welcome to the 3box editor"
    $content = $content -replace "Welcome to sbox", "Welcome to 3box"
    
    # AssemblyNames
    $content = $content -replace "<AssemblyName>sbox", "<AssemblyName>3box"
    $content = $content -replace 'InternalsVisibleTo\( "sbox', 'InternalsVisibleTo( "3box'
    
    # Executable names in strings
    $content = $content -replace '"sbox.exe"', '"3box.exe"'
    $content = $content -replace '"sbox-dev.exe"', '"3box-dev.exe"'
    $content = $content -replace '"sbox-launcher.exe"', '"3box-launcher.exe"'
    $content = $content -replace 'Plat_SetModuleFilename\( \$"\{GamePath\}\\sbox.exe" \)', 'Plat_SetModuleFilename( $"{GamePath}\\3box.exe" )'

    # Special case: Revert BackendTitle in Global.cs
    if ($file.Name -eq "Global.cs") {
        $content = $content -replace 'public static string BackendTitle => "3box.game";', 'public static string BackendTitle => "sbox.game";'
    }

    # Special case: Fix URLs that might have been accidentally renamed
    $content = $content -replace "3box\.game", "sbox.game"
    # EXCEPT we want BackendTitle to say sbox.game (which we handled above)
    # AND README.md should probably have sbox.game URLs but 3box text.
    
    # SCSS logo fixes
    if ($file.Extension -eq ".scss") {
        $content = $content -replace '/ui/sbox-logo-square\.svg', '/ui/3box.png'
        $content = $content -replace '/ui/sbox_ident_default\.svg', '/ui/3box.png'
    }
    
    # Razor logo fixes
    if ($file.Extension -eq ".razor") {
        $content = $content -replace '/ui/sbox-logo-square\.svg', '/ui/3box.png'
        $content = $content -replace 'https://cdn.sbox.game/asset/facepunch.testbed/logo.51722a86.png', '/ui/3box.png'
    }

    if ($content -ne $originalContent) {
        Set-Content $file.FullName $content
        Write-Host "  Updated $($file.FullName)"
    }
}

Write-Host "Rebrand Complete! Run Bootstrap.bat to rebuild." -ForegroundColor Green
