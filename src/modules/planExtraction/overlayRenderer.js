import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { env } from '../../config/env.js';
import { fileExists } from '../../utils/files.js';
import { symbolPrecisionProfile } from './extractionProfile.js';

export function renderOverlayPdf({ pdfPath, overlaysJsonPath, outputPdfPath }) {
  const scriptPath = path.join(env.spikeRoot, 'src', 'render_overlays_from_json.py');

  if (!fileExists(env.pythonExecutable)) {
    return { ok: false, error: `Python executable not found at ${env.pythonExecutable}` };
  }
  if (!fileExists(scriptPath)) {
    return { ok: false, error: `Overlay renderer not found at ${scriptPath}` };
  }

  const result = spawnSync(
    env.pythonExecutable,
    [
      scriptPath,
      '--pdf',
      pdfPath,
      '--overlays-in',
      overlaysJsonPath,
      '--out-pdf',
      outputPdfPath,
      '--overlay-mode',
      symbolPrecisionProfile.overlayMode,
      '--only-types',
      symbolPrecisionProfile.overlayOnlyTypes.join(','),
    ],
    {
      cwd: env.workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    }
  );

  if (result.error) {
    return { ok: false, error: result.error.message, stderr: result.stderr };
  }
  if (result.status !== 0) {
    return { ok: false, error: 'Overlay renderer failed', stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
  }

  return { ok: true, stdout: result.stdout, stderr: result.stderr };
}
