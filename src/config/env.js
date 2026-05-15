import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(apiRoot, '..');

loadEnvFile(path.join(apiRoot, '.env'));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  visionOwner: process.env.VISION_OWNER || 'node',
  spikeRoot: process.env.SPIKE_ROOT || path.join(workspaceRoot, 'Valtrim Inc', 'spike'),
  pythonExecutable: process.env.PYTHON_EXECUTABLE || path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe'),
  hybridExtractorScript:
    process.env.HYBRID_EXTRACTOR_SCRIPT || path.join(workspaceRoot, 'Valtrim Inc', 'spike', 'src', 'hybrid_extract_from_pdf.py'),
  storageRoot: process.env.STORAGE_ROOT || path.join(apiRoot, 'storage'),
  apiRoot,
  workspaceRoot,
};
