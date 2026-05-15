import { spawnSync } from 'node:child_process';
import { env } from '../../config/env.js';
import { fileExists } from '../../utils/files.js';
import { buildExtractorArgs } from './extractionProfile.js';

export function runHybridExtractor({ pdfPath, page, outputPath, artifactsDir, visionTasksPath }) {
  if (!fileExists(env.pythonExecutable)) {
    return {
      ok: false,
      statusCode: 500,
      error: `Python executable not found at ${env.pythonExecutable}`,
    };
  }

  if (!fileExists(env.hybridExtractorScript)) {
    return {
      ok: false,
      statusCode: 500,
      error: `Hybrid extractor not found at ${env.hybridExtractorScript}`,
    };
  }

  return spawnSync(
    env.pythonExecutable,
    buildExtractorArgs({
      pythonScript: env.hybridExtractorScript,
      pdfPath,
      page,
      apiKey: env.anthropicApiKey,
      model: env.anthropicModel,
      outputPath,
      artifactsDir,
      visionTasksPath,
    }),
    {
      cwd: env.workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    }
  );
}
