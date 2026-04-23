const fs = require('fs');
const path = require('path');

async function run(installPath, assetsPath, log) {
  // Check if installPath itself is the root or if it contains the folder
  let repoRoot = installPath;
  if (fs.existsSync(path.join(installPath, 'sbox-public'))) {
      repoRoot = path.join(installPath, 'sbox-public');
  }

  const icoSource = path.join(assetsPath, 'assets', '3box logo.ico');
  const pngSource = path.join(assetsPath, 'assets', '3box logo.png');

  log(`Starting Rebrand to 3box in ${repoRoot}...`);

  if (!fs.existsSync(icoSource) || !fs.existsSync(pngSource)) {
    throw new Error('3box logo.ico or 3box logo.png not found in Setup/assets!');
  }

  // 1. Replace Icons and Logos
  log('Updating Icons and Logos...');
  const iconTargets = [
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
  ];

  for (const target of iconTargets) {
    const dest = path.join(repoRoot, target);
    if (fs.existsSync(path.dirname(dest))) {
      fs.copyFileSync(icoSource, dest);
      log(`  Updated ${target}`);
    }
  }

  const pngTargets = [
    "game/core/tools/images/logo_grayscale.png",
    "game/core/tools/images/logo_rounded.png",
    "game/core/tools/images/start_screen/logo.png",
    "game/core/tools/images/splash_screen.png",
    "game/core/tools/images/model_editor/appicon.png",
    "game/addons/tools/assets/sbox.png",
    "game/addons/menu/Assets/ui/3box.png"
  ];

  for (const target of pngTargets) {
    const dest = path.join(repoRoot, target);
    if (fs.existsSync(path.dirname(dest))) {
      fs.copyFileSync(pngSource, dest);
      log(`  Updated ${target}`);
    }
  }

  // 2. Modify Build Tool
  log('Patching DownloadPublicArtifacts.cs...');
  const artifactStepPath = path.join(repoRoot, 'engine/Tools/SboxBuild/Steps/DownloadPublicArtifacts.cs');
  if (fs.existsSync(artifactStepPath)) {
    let content = fs.readFileSync(artifactStepPath, 'utf8');
    if (!content.includes('Skip downloading images')) {
      const oldText = `if ( nativeBinariesOnly && !entry.Path.StartsWith( "game/bin/", StringComparison.OrdinalIgnoreCase ) )
                        {
                                Interlocked.Increment( ref skippedCount );
                                return;
                        }`;
      const newText = `if ( nativeBinariesOnly && !entry.Path.StartsWith( "game/bin/", StringComparison.OrdinalIgnoreCase ) )
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
                        }`;
      // Note: Powershell -replace is case-insensitive by default. JS .replace with string is case-sensitive.
      // We might need to be careful here if the formatting differs.
      content = content.replace(oldText, newText);
      fs.writeFileSync(artifactStepPath, content);
      log(`  Patched ${artifactStepPath}`);
    }
  }

  // 3. String Replacements
  log('Performing String Replacements...');
  const extensions = ['.cs', '.csproj', '.sln', '.bat', '.razor', '.scss', '.md'];
  
  async function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (file === 'obj' || file === 'bin' || file === '.git') continue;
        await walk(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (extensions.includes(ext)) {
          processFile(fullPath, ext, file, log);
        }
      }
    }
  }

  function processFile(filePath, ext, fileName, log) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Global renames
    content = content.replace(/s&box/g, '3box');
    content = content.replace(/S&box/g, '3box');
    
    // Specific UI/Title renames
    content = content.replace(/Welcome to the sbox editor/g, 'Welcome to the 3box editor');
    content = content.replace(/Welcome to sbox/g, 'Welcome to 3box');
    
    // AssemblyNames
    content = content.replace(/<AssemblyName>sbox/g, '<AssemblyName>3box');
    content = content.replace(/InternalsVisibleTo\( "sbox/g, 'InternalsVisibleTo( "3box');
    
    // Executable names in strings
    content = content.replace(/"sbox\.exe"/g, '"3box.exe"');
    content = content.replace(/"sbox-dev\.exe"/g, '"3box-dev.exe"');
    content = content.replace(/"sbox-launcher\.exe"/g, '"3box-launcher.exe"');
    content = content.replace(/Plat_SetModuleFilename\( \$"\{GamePath\}\\sbox\.exe" \)/g, 'Plat_SetModuleFilename( $"{GamePath}\\\\3box.exe" )');

    // Special case: Revert BackendTitle in Global.cs
    if (fileName === 'Global.cs') {
      content = content.replace(/public static string BackendTitle => "3box\.game";/g, 'public static string BackendTitle => "sbox.game";');
    }

    // Special case: Fix URLs that might have been accidentally renamed
    content = content.replace(/3box\.game/g, 'sbox.game');
    
    // SCSS logo fixes
    if (ext === '.scss') {
      content = content.replace(/\/ui\/sbox-logo-square\.svg/g, '/ui/3box.png');
      content = content.replace(/\/ui\/sbox_ident_default\.svg/g, '/ui/3box.png');
    }
    
    // Razor logo fixes
    if (ext === '.razor') {
      content = content.replace(/\/ui\/sbox-logo-square\.svg/g, '/ui/3box.png');
      content = content.replace(/https:\/\/cdn\.sbox\.game\/asset\/facepunch\.testbed\/logo\.51722a86\.png/g, '/ui/3box.png');
    }

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      log(`  Updated ${filePath}`);
    }
  }

  await walk(repoRoot);

  // 4. Update Windows Icon Cache
  log('Refreshing Windows Icon Cache...');
  const command = `powershell -command "$code = '[DllImport(\\"shell32.dll\\")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);'; $type = Add-Type -MemberDefinition $code -Name 'Shell32' -Namespace 'Win32' -PassThru; $type::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)"`;
  const { execSync } = require('child_process');
  execSync(command);
  log('  Icon cache refreshed.');

  log('Rebrand Complete!');
}

module.exports = { run };
