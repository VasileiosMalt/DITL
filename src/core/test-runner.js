const { spawn } = require('child_process');
const path = require('path');

/**
 * Runs the project's test suite and streams output.
 * Auto-detects test command if not provided.
 */
function runTests(projectPath, command) {
  return new Promise((resolve) => {
    const cmd = command || detectTestCommand(projectPath);
    if (!cmd) {
      return resolve({ success: false, output: 'No test command found. Configure one in Settings.', duration: 0 });
    }

    const parts = cmd.split(/\s+/);
    const start = Date.now();
    let output = '';

    const proc = spawn(parts[0], parts.slice(1), {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 300000, // 5 min max
    });

    proc.stdout?.on('data', (d) => { output += d.toString(); });
    proc.stderr?.on('data', (d) => { output += d.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.slice(-50000), // last 50k chars
        exitCode: code,
        duration: Date.now() - start,
        command: cmd,
      });
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: err.message, duration: Date.now() - start, command: cmd });
    });
  });
}

function detectTestCommand(projectPath) {
  const fs = require('fs');
  const pkg = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const p = JSON.parse(fs.readFileSync(pkg, 'utf-8'));
      if (p.scripts?.test && p.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        return 'npm test';
      }
    } catch {}
  }
  // Python
  if (fs.existsSync(path.join(projectPath, 'pytest.ini')) || fs.existsSync(path.join(projectPath, 'setup.cfg'))) {
    return 'python -m pytest -v';
  }
  if (fs.existsSync(path.join(projectPath, 'Makefile'))) {
    const mk = fs.readFileSync(path.join(projectPath, 'Makefile'), 'utf-8');
    if (mk.includes('test:')) return 'make test';
  }
  return null;
}

module.exports = { runTests };
