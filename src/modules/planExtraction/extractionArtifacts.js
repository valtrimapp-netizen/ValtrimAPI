import path from 'node:path';
import { env } from '../../config/env.js';

export function createExtractionRun({ page }) {
  const runId = `p${String(page)}-${Date.now()}`;
  const runDir = path.join(env.storageRoot, 'extractions', runId);
  const artifactsDir = path.join(runDir, 'artifacts');

  return {
    runId,
    runDir,
    artifactsDir,
    outputPath: path.join(runDir, 'extraction.json'),
    overlayPath: path.join(runDir, 'overlay.pdf'),
    visionTasksPath: path.join(artifactsDir, 'vision-tasks.json'),
    tileResultsPath: path.join(artifactsDir, 'tile-results.batch.json'),
    apiErrorsPath: path.join(artifactsDir, 'api-errors.json'),
    summaryPath: path.join(artifactsDir, 'element-summary.json'),
    overlaysPath: path.join(artifactsDir, 'detection-overlays.json'),
  };
}
