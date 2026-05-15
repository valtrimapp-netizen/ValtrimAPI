import {
  createExtraction,
  getOverlayPdf,
  getExtractionJson,
  getElementSummary,
  getDetectionOverlays,
} from '../controllers/extraction.controller.js';

export const extractionRoutes = [
  {
    method: 'POST',
    path: '/api/extractions',
    handler: createExtraction,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/overlay',
    handler: getOverlayPdf,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/extraction',
    handler: getExtractionJson,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/summary',
    handler: getElementSummary,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/overlays',
    handler: getDetectionOverlays,
  },
];
