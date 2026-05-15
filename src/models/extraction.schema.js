export function validateCreateExtraction(payload) {
  const pdfPath = String(payload?.pdfPath || '').trim();
  const page = Number(payload?.page || 0);

  const errors = [];
  if (!pdfPath) {
    errors.push('pdfPath is required');
  }
  if (!Number.isInteger(page) || page < 1) {
    errors.push('page must be a valid 1-based integer');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      pdfPath,
      page,
    },
  };
}
