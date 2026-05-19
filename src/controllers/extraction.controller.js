import path from 'node:path';
import fs from 'node:fs';
import { validateCreateExtraction } from '../models/extraction.schema.js';
import { runSymbolExtraction } from '../services/extraction.service.js';
import { env } from '../config/env.js';
import { fileExists } from '../utils/files.js';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '../utils/errors.js';

export async function createExtraction(req, res) {
  const body = req.body ?? {};
  const validation = validateCreateExtraction(body);

  if (!validation.ok) {
    throw new UnprocessableEntityError('Invalid extraction request', validation.errors);
  }

  const extraction = await runSymbolExtraction(validation.value);
  res.status(extraction.statusCode).json(extraction);
}

export function getOverlayPdf(req, res) {
  serveRunArtifact(req, res, { relativePath: 'overlay.pdf', contentType: 'application/pdf' });
}

export function getExtractionJson(req, res) {
  serveRunArtifact(req, res, { relativePath: 'extraction.json', contentType: 'application/json; charset=utf-8' });
}

export function getElementSummary(req, res) {
  serveRunArtifact(req, res, { relativePath: 'artifacts/element-summary.json', contentType: 'application/json; charset=utf-8' });
}

export function getDetectionOverlays(req, res) {
  serveRunArtifact(req, res, { relativePath: 'artifacts/detection-overlays.json', contentType: 'application/json; charset=utf-8' });
}

function serveRunArtifact(req, res, { relativePath, contentType }) {
  const runId = String(req.params?.runId || '').trim();
  if (!runId || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new BadRequestError('Invalid runId');
  }

  const filePath = path.join(env.storageRoot, 'extractions', runId, ...relativePath.split('/'));
  if (!fileExists(filePath)) {
    throw new NotFoundError(`Artifact not found: ${relativePath}`);
  }

  const stat = fs.statSync(filePath);
  const fileName = `${runId}-${path.basename(filePath)}`;
  res
    .set('Content-Type', contentType || 'application/octet-stream')
    .set('Content-Length', String(stat.size))
    .set('Content-Disposition', `inline; filename="${fileName}"`)
    .status(200);
  fs.createReadStream(filePath).pipe(res);
}

