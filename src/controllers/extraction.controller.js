import path from 'node:path';
import { validateCreateExtraction } from '../models/extraction.schema.js';
import { runSymbolExtraction } from '../services/extraction.service.js';
import { readJsonBody } from '../utils/body.js';
import { sendJson, streamFile } from '../utils/http.js';
import { corsHeaders } from '../middlewares/cors.js';
import { env } from '../config/env.js';
import { fileExists } from '../utils/files.js';

export async function createExtraction(req, res) {
  const body = await readJsonBody(req);
  const validation = validateCreateExtraction(body);

  if (!validation.ok) {
    sendJson(
      res,
      400,
      {
        error: 'Invalid extraction request',
        details: validation.errors,
      },
      corsHeaders()
    );
    return;
  }

  const extraction = await runSymbolExtraction(validation.value);
  sendJson(res, extraction.statusCode, extraction, corsHeaders());
}

export function getOverlayPdf(req, res) {
  serveRunArtifact(req, res, {
    relativePath: 'overlay.pdf',
    contentType: 'application/pdf',
  });
}

export function getExtractionJson(req, res) {
  serveRunArtifact(req, res, {
    relativePath: 'extraction.json',
    contentType: 'application/json; charset=utf-8',
  });
}

export function getElementSummary(req, res) {
  serveRunArtifact(req, res, {
    relativePath: 'artifacts/element-summary.json',
    contentType: 'application/json; charset=utf-8',
  });
}

export function getDetectionOverlays(req, res) {
  serveRunArtifact(req, res, {
    relativePath: 'artifacts/detection-overlays.json',
    contentType: 'application/json; charset=utf-8',
  });
}

function serveRunArtifact(req, res, { relativePath, contentType }) {
  const runId = String(req.params?.runId || '').trim();
  if (!runId || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    sendJson(res, 400, { error: 'Invalid runId' }, corsHeaders());
    return;
  }

  const filePath = path.join(env.storageRoot, 'extractions', runId, ...relativePath.split('/'));
  if (!fileExists(filePath)) {
    sendJson(res, 404, { error: 'Artifact not found', runId, file: relativePath }, corsHeaders());
    return;
  }

  const fileName = `${runId}-${path.basename(filePath)}`;
  streamFile(res, filePath, { contentType, fileName, headers: corsHeaders() });
}
