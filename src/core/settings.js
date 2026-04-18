const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_PATH = path.join(os.homedir(), '.ditl', 'settings.json');

const DEFAULTS = {
  provider: 'openai',        // openai | anthropic | openrouter | ollama
  apiKey: '',
  model: 'gpt-4o-mini',
  openrouterModel: 'anthropic/claude-sonnet-4',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  testCommand: '',
  theme: 'dark',
  maxFileSizeKB: 200,
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', 'coverage'],
  extensions: ['.py', '.js', '.ts', '.jsx', '.tsx', '.yaml', '.yml', '.json', '.toml', '.cfg', '.ini', '.env', '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.cpp', '.c', '.h'],
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}

module.exports = { loadSettings, saveSettings, DEFAULTS };
