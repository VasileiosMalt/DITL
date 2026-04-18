const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const BINARY_EXT = new Set(['.png','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.ttf','.eot','.pdf','.zip','.tar','.gz','.exe','.dll','.so','.dylib','.pyc','.o','.obj','.class']);

async function scanProject(projectPath, settings) {
  const ignoreDirs = settings?.ignoreDirs || ['node_modules','.git','dist','build','__pycache__','.venv','venv','.next','coverage'];
  const extensions = settings?.extensions || ['.py','.js','.ts','.jsx','.tsx','.yaml','.yml','.json','.toml','.cfg','.ini','.env','.rb','.go','.rs','.java','.kt','.cs','.cpp','.c','.h','.txt','.md','.prompt'];
  const maxSize = (settings?.maxFileSizeKB || 200) * 1024;

  const pattern = '**/*';
  const ignore = ignoreDirs.map(d => `**/${d}/**`);

  const allFiles = await glob(pattern, { cwd: projectPath, nodir: true, ignore, dot: false });

  const files = [];
  for (const rel of allFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;
    if (!extensions.includes(ext)) continue;

    const abs = path.join(projectPath, rel);
    try {
      const stat = fs.statSync(abs);
      if (stat.size > maxSize) continue;
      const content = fs.readFileSync(abs, 'utf-8');
      files.push({ relativePath: rel, absolutePath: abs, content, size: stat.size });
    } catch {}
  }

  return {
    projectPath,
    fileCount: files.length,
    files: files.map(f => ({ relativePath: f.relativePath, absolutePath: f.absolutePath, size: f.size })),
    contents: files.reduce((m, f) => { m[f.relativePath] = f.content; return m; }, {}),
  };
}

module.exports = { scanProject };
