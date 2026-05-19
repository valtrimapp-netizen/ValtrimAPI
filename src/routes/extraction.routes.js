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
    auth: { required: true, permissionsAll: ['extractions.create'] },
    handler: createExtraction,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/overlay',
    auth: { required: true, permissionsAll: ['extractions.read'] },
    handler: getOverlayPdf,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/extraction',
    auth: { required: true, permissionsAll: ['extractions.read'] },
    handler: getExtractionJson,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/summary',
    auth: { required: true, permissionsAll: ['extractions.read'] },
    handler: getElementSummary,
  },
  {
    method: 'GET',
    path: '/api/extractions/:runId/overlays',
    auth: { required: true, permissionsAll: ['extractions.read'] },
    handler: getDetectionOverlays,
  },
];
