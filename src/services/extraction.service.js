import path from 'node:path';
import { createExtractionRun } from '../modules/planExtraction/extractionArtifacts.js';
import { postProcessExtractionArtifacts } from '../modules/planExtraction/extractionPostProcessor.js';
import { runHybridExtractor } from '../modules/planExtraction/hybridExtractor.js';
import { runVisionTasks } from '../modules/planExtraction/visionTaskRunner.js';
import { buildDetectionOverlays } from '../modules/planExtraction/overlayBuilder.js';
import { renderOverlayPdf } from '../modules/planExtraction/overlayRenderer.js';
import { env } from '../config/env.js';
import { ensureDir, fileExists, readJsonIfExists, writeJson } from '../utils/files.js';

export async function runSymbolExtraction({ pdfPath, page }) {
  if (!env.anthropicApiKey) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Missing ANTHROPIC_API_KEY in Valtrim API/.env',
    };
  }

  const resolvedPdfPath = path.resolve(pdfPath);
  if (!fileExists(resolvedPdfPath)) {
    return {
      ok: false,
      statusCode: 400,
      error: `PDF not found: ${resolvedPdfPath}`,
    };
  }

  const safePage = String(page);
  const run = createExtractionRun({ page: safePage });
  ensureDir(run.runDir);
  ensureDir(run.artifactsDir);

  const result = runHybridExtractor({
    pdfPath: resolvedPdfPath,
    page: safePage,
    outputPath: run.outputPath,
    artifactsDir: run.artifactsDir,
    visionTasksPath: env.visionOwner === 'node' ? run.visionTasksPath : null,
  });

  if (result.ok === false) {
    return result;
  }

  if (result.error) {
    return {
      ok: false,
      statusCode: 500,
      error: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status,
    };
  }

  const files = {
    extractedJson: run.outputPath,
    artifactsDir: run.artifactsDir,
    summaryJson: run.summaryPath,
    overlaysJson: run.overlaysPath,
    visionTasksJson: run.visionTasksPath,
    tileResultsJson: run.tileResultsPath,
    apiErrorsJson: run.apiErrorsPath,
    overlayPdf: run.overlayPath,
  };

  if (result.status !== 0) {
    return {
      ok: false,
      statusCode: 500,
      runId: run.runId,
      page: Number(safePage),
      files,
      error: 'Hybrid extractor failed',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status,
    };
  }

  if (env.visionOwner === 'node') {
    const vectorTileResults = readJsonIfExists(run.tileResultsPath) || [];
    const visionTasks = readJsonIfExists(run.visionTasksPath) || [];
    const vision = await runVisionTasks(visionTasks, { onApiError: 'skip' });
    writeJson(run.tileResultsPath, [...vectorTileResults, ...vision.tileResults]);
    writeJson(run.apiErrorsPath, vision.apiErrors);
  }

  const tileResults = readJsonIfExists(run.tileResultsPath) || [];
  const overlays = buildDetectionOverlays(tileResults);
  writeJson(run.overlaysPath, overlays);

  const overlayRender = renderOverlayPdf({
    pdfPath: resolvedPdfPath,
    overlaysJsonPath: run.overlaysPath,
    outputPdfPath: run.overlayPath,
  });

  const postProcessed = postProcessExtractionArtifacts(run);
  const summary = postProcessed.summary;
  const apiErrors = readJsonIfExists(run.apiErrorsPath);

  return {
    ok: result.status === 0,
    statusCode: 200,
    runId: run.runId,
    page: Number(safePage),
    files,
    summary,
    itemCount: postProcessed.rows.length,
    overlayCount: Array.isArray(overlays) ? overlays.length : 0,
    overlayRendered: overlayRender.ok,
    overlayError: overlayRender.ok ? undefined : overlayRender.error,
    apiErrorCount: Array.isArray(apiErrors) ? apiErrors.length : 0,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status,
  };
}
