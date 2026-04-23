// DOM Elements
const pages = {
    welcome: document.getElementById('page-welcome'),
    path: document.getElementById('page-path'),
    download: document.getElementById('page-download'),
    crack: document.getElementById('page-crack'),
    finalize: document.getElementById('page-finalize'),
    done: document.getElementById('page-done')
};

const btns = {
    start: document.getElementById('btn-start'),
    browse: document.getElementById('btn-browse'),
    goDownload: document.getElementById('btn-go-download'),
    download: document.getElementById('btn-download'),
    goCrack: document.getElementById('btn-go-crack'),
    launchCracker: document.getElementById('btn-launch-cracker'),
    goFinalize: document.getElementById('btn-go-finalize'),
    update: document.getElementById('btn-update'),
    cleanInstall: document.getElementById('btn-clean-install'),
    createShortcut: document.getElementById('btn-create-shortcut'),
    finish: document.getElementById('btn-finish')
};

const inputPath = document.getElementById('input-path');
const envStatus = document.getElementById('env-status');
const diskSpaceStatus = document.getElementById('disk-space');
const consoleOutput = document.getElementById('console-output');
const finalizeOutput = document.getElementById('finalize-output');
const finalizeConsole = document.getElementById('finalize-console');
const stepIndicator = document.getElementById('step-indicator');
const existingActions = document.getElementById('existing-install-actions');
const standardActions = document.getElementById('standard-actions');

let selectedPath = '';
let appPath = '';
let installType = 'new'; // 'new', 'update', 'clean'
let isBuilding = false;

// Cache app path
window.electron.getAppPath().then(p => { appPath = p; });

// ─── Step Indicator ──────────────────────────────────────────────────────────

const pageToStep = {
    welcome: 0,
    path: 1,
    download: 2,
    crack: 3,
    finalize: 4,
    done: 5
};

function updateSteps(activeStep) {
    if (activeStep === 0) {
        stepIndicator.style.display = 'none';
        return;
    }
    stepIndicator.style.display = 'flex';

    const steps = stepIndicator.querySelectorAll('.step');
    const lines = stepIndicator.querySelectorAll('.step-line');

    steps.forEach((step, i) => {
        const num = i + 1;
        step.classList.remove('active', 'completed');
        if (num < activeStep) step.classList.add('completed');
        else if (num === activeStep) step.classList.add('active');
    });

    lines.forEach((line, i) => {
        line.classList.remove('completed');
        if (i + 1 < activeStep) line.classList.add('completed');
    });
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function showPage(pageId) {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    pages[pageId].classList.add('active');
    updateSteps(pageToStep[pageId]);

    if (pageId === 'finalize') {
        runFinalize();
    }
}

function appendToConsole(text, target = consoleOutput) {
    target.textContent += text;
    target.parentElement.scrollTop = target.parentElement.scrollHeight;
}

// Back buttons
document.querySelectorAll('.back-btn').forEach(btn => {
    btn.onclick = () => {
        if (isBuilding) return;
        const target = btn.dataset.back;
        if (target) showPage(target);
    };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pj(...parts) {
    return parts.join('\\').replace(/\/+/g, '\\').replace(/\\+/g, '\\');
}

function resetListeners() {
    window.electron.removeAllListeners('command-output');
    window.electron.removeAllListeners('command-finished');
}

function runCommand(command, args, cwd, logTarget = consoleOutput) {
    return new Promise((resolve) => {
        resetListeners();
        window.electron.onCommandOutput((data) => appendToConsole(data, logTarget));
        window.electron.onCommandFinished((code) => {
            resetListeners();
            resolve(code);
        });
        window.electron.runCommand(command, args, cwd);
    });
}

function runRebrand(logTarget = consoleOutput) {
    return new Promise((resolve) => {
        resetListeners();
        window.electron.onCommandOutput((data) => appendToConsole(data, logTarget));
        window.electron.onCommandFinished((code) => {
            resetListeners();
            resolve(code);
        });
        window.electron.runRebrand(selectedPath);
    });
}

function refreshIconCache(logTarget = consoleOutput) {
    return new Promise((resolve) => {
        resetListeners();
        window.electron.onCommandOutput((data) => appendToConsole(data, logTarget));
        window.electron.onCommandFinished((code) => {
            resetListeners();
            resolve(code);
        });
        window.electron.refreshIconCache();
    });
}

function runResourceHacker(rhExe, targetExe, icoPath, logTarget = consoleOutput) {
    return new Promise((resolve) => {
        resetListeners();
        window.electron.onCommandOutput((data) => appendToConsole(data, logTarget));
        window.electron.onCommandFinished((code) => {
            resetListeners();
            resolve(code);
        });
        window.electron.runResourceHacker(rhExe, targetExe, icoPath);
    });
}

async function applyIcons(repoPath, logTarget = consoleOutput) {
    const icoPath = pj(appPath, 'Setup', 'assets', '3box logo.ico');
    const rhExe   = pj(appPath, 'Setup', 'resourcehacker', 'ResourceHacker.exe');

    const exes = [
        '3box.exe',
        '3box-dev.exe',
        '3box-launcher.exe',
        '3box-standalone.exe',
        '3box-server.exe',
        'benchmark.exe'
    ];

    const gameDir = pj(repoPath, 'game');

    for (const exe of exes) {
        const exePath = pj(gameDir, exe);
        appendToConsole(`\nApplying icon to ${exe}...\n`, logTarget);
        appendToConsole(`  Path: ${exePath}\n`, logTarget);

        const code = await runResourceHacker(rhExe, exePath, icoPath, logTarget);

        if (code !== 0) {
            appendToConsole(`  Warning: ResourceHacker exited with code ${code} for ${exe}\n`, logTarget);
        }
    }

    appendToConsole('\nClearing Windows icon cache...\n', logTarget);
    const cacheCode = await refreshIconCache(logTarget);
    if (cacheCode !== 0) {
        appendToConsole('Warning: Icon cache refresh returned a non-zero exit code.\n', logTarget);
    }

    appendToConsole('Icons applied successfully.\n', logTarget);
}

// ─── Page: Welcome ───────────────────────────────────────────────────────────

btns.start.onclick = () => {
    showPage('path');
    checkEnvironment();
};

// ─── Page: Path ──────────────────────────────────────────────────────────────

btns.browse.onclick = async () => {
    const p = await window.electron.selectFolder();
    if (p) {
        selectedPath = p;
        inputPath.value = p;
        await checkEnvironment();
        await checkDiskSpace();
        await checkExistingInstall();
    }
};

async function checkEnvironment() {
    envStatus.textContent = 'Checking environment...';
    envStatus.style.color = '';
    const checks = await window.electron.checkEnv();
    if (checks.git) {
        envStatus.textContent = '✓ Git found';
        envStatus.style.color = '#3fb950';
    } else {
        envStatus.textContent = '✗ Git not found. Please install Git for Windows.';
        envStatus.style.color = '#f85149';
    }
    updateContinueState();
}

async function checkDiskSpace() {
    if (!selectedPath) {
        diskSpaceStatus.textContent = 'Select a folder to check available space.';
        diskSpaceStatus.style.color = '';
        return;
    }
    diskSpaceStatus.textContent = 'Checking disk space...';
    const freeGB = await window.electron.checkDiskSpace(selectedPath);
    if (freeGB === null) {
        diskSpaceStatus.textContent = 'Unable to check disk space';
        diskSpaceStatus.style.color = '#f85149';
    } else if (freeGB >= 10) {
        diskSpaceStatus.textContent = `✓ ${freeGB.toFixed(1)} GB free`;
        diskSpaceStatus.style.color = '#3fb950';
    } else {
        diskSpaceStatus.textContent = `✗ ${freeGB.toFixed(1)} GB free (10 GB required)`;
        diskSpaceStatus.style.color = '#f85149';
    }
    updateContinueState();
}

async function checkExistingInstall() {
    if (!selectedPath) return;
    const repoPath = pj(selectedPath, 'sbox-public');
    const exists = await window.electron.checkPathExists(repoPath);
    if (exists) {
        existingActions.classList.remove('hidden');
        standardActions.classList.add('hidden');
    } else {
        existingActions.classList.add('hidden');
        standardActions.classList.remove('hidden');
    }
    updateContinueState();
}

function updateContinueState() {
    const gitOk = envStatus.style.color === 'rgb(63, 185, 80)';
    const spaceOk = diskSpaceStatus.style.color === 'rgb(63, 185, 80)';
    const canProceed = selectedPath && gitOk && spaceOk;

    btns.goDownload.disabled = !canProceed;
    if (btns.update) btns.update.disabled = !canProceed;
    if (btns.cleanInstall) btns.cleanInstall.disabled = !canProceed;
}

btns.goDownload.onclick = () => {
    installType = 'new';
    showPage('download');
};

if (btns.update) {
    btns.update.onclick = () => {
        installType = 'update';
        showPage('download');
    };
}

if (btns.cleanInstall) {
    btns.cleanInstall.onclick = () => {
        installType = 'clean';
        showPage('download');
    };
}

// ─── Page: Download ──────────────────────────────────────────────────────────

btns.download.onclick = async () => {
    isBuilding = true;
    btns.download.disabled = true;
    btns.goCrack.disabled = true;
    consoleOutput.textContent = '';

    const repoPath = pj(selectedPath, 'sbox-public');

    // Disk space double-check
    const freeGB = await window.electron.checkDiskSpace(selectedPath);
    if (freeGB === null || freeGB < 10) {
        appendToConsole('Error: Not enough disk space. At least 10 GB is required.\n');
        isBuilding = false;
        btns.download.disabled = false;
        return;
    }

    if (installType === 'clean') {
        appendToConsole('Removing existing installation for clean install...\n');
        const ok = await window.electron.deleteFolder(repoPath);
        if (!ok) appendToConsole('Warning: Could not fully remove existing folder.\n');
    }

    if (installType === 'new' || installType === 'clean') {
        appendToConsole('Cloning sbox-public...\n');
        const code = await runCommand('git', ['clone', 'https://github.com/Facepunch/sbox-public.git'], selectedPath);
        if (code !== 0) {
            appendToConsole(`\nGit clone failed (exit ${code}).\n`);
            isBuilding = false;
            btns.download.disabled = false;
            return;
        }
    } else if (installType === 'update') {
        appendToConsole('Updating existing installation (git pull)...\n');
        const code = await runCommand('git', ['pull'], repoPath);
        if (code !== 0) {
            appendToConsole(`\nGit pull failed (exit ${code}).\n`);
            isBuilding = false;
            btns.download.disabled = false;
            return;
        }
    }

    // Bootstrap 1
    appendToConsole('\nRunning bootstrap.bat...\n');
    let code = await runCommand('bootstrap.bat', [], repoPath);
    if (code !== 0) {
        appendToConsole(`\nBootstrap failed (exit ${code}).\n`);
        isBuilding = false;
        btns.download.disabled = false;
        return;
    }

    // Rebrand
    appendToConsole('\nRebranding source files...\n');
    code = await runRebrand();
    if (code !== 0) {
        appendToConsole(`\nRebrand failed (exit ${code}).\n`);
        isBuilding = false;
        btns.download.disabled = false;
        return;
    }

    // Bootstrap 2
    appendToConsole('\nRunning bootstrap.bat again to apply rebrand...\n');
    code = await runCommand('bootstrap.bat', [], repoPath);
    if (code !== 0) {
        appendToConsole(`\nSecond bootstrap failed (exit ${code}).\n`);
        isBuilding = false;
        btns.download.disabled = false;
        return;
    }

    // Icons
    appendToConsole('\nApplying icons to executables...\n');
    await applyIcons(repoPath);

    appendToConsole('\n✓ Build complete! Click Next to continue.\n');
    btns.goCrack.disabled = false;
    isBuilding = false;
};

btns.goCrack.onclick = () => showPage('crack');

// ─── Page: Crack ─────────────────────────────────────────────────────────────

btns.launchCracker.onclick = () => window.electron.launchTool('cracker');
btns.goFinalize.onclick = () => showPage('finalize');

// ─── Page: Finalize (Auto) ───────────────────────────────────────────────────

async function runFinalize() {
    isBuilding = true;
    const repoPath = pj(selectedPath, 'sbox-public');
    finalizeOutput.textContent = '';
    finalizeConsole.classList.remove('hidden');

    appendToConsole('Applying icons to executables...\n', finalizeOutput);
    await applyIcons(repoPath, finalizeOutput);

    appendToConsole('\nRebranding source files...\n', finalizeOutput);
    const code = await runRebrand(finalizeOutput);

    isBuilding = false;

    if (code === 0) {
        appendToConsole('\n✓ Finalizing complete!\n', finalizeOutput);
        setTimeout(() => showPage('done'), 1200);
    } else {
        appendToConsole(`\nRebrand finished with code ${code}. You may need to restart the installer.\n`, finalizeOutput);
    }
}

// ─── Page: Done ──────────────────────────────────────────────────────────────

btns.createShortcut.onclick = async () => {
    const devExe = pj(selectedPath, 'sbox-public', 'game', '3box-dev.exe');
    try {
        await window.electron.createDesktopShortcut(devExe);
        document.getElementById('shortcut-status').textContent = '✓ Desktop shortcut created.';
        document.getElementById('shortcut-status').style.color = '#3fb950';
    } catch (err) {
        document.getElementById('shortcut-status').textContent = 'Error creating shortcut: ' + err.message;
        document.getElementById('shortcut-status').style.color = '#f85149';
    }
};

btns.finish.onclick = () => window.close();
