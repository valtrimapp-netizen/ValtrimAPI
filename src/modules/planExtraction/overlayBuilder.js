const elementTypeRules = [
  ['bypass', 'bypass'],
  ['shelf pole', 'shelf pole'],
  ['shelf cleat', 'shelf cleat'],
  ['stack', 'stack'],
  ['casing', 'casing'],
  ['frame', 'frame'],
  ['jamb', 'frame'],
  ['pocket door', 'pocket door'],
  ['bifold door', 'bifold door'],
  ['swing door', 'swing door'],
  ['sliding door', 'sliding door'],
  ['door', 'door'],
];

export function buildDetectionOverlays(tileResults) {
  const overlays = [];

  for (const result of Array.isArray(tileResults) ? tileResults : []) {
    const pageNumber = Number(result?.page || 0);
    const tileId = String(result?.tileId || '');
    const bbox = result?.bbox;
    if (!pageNumber || !tileId || !bbox) continue;

    for (const item of Array.isArray(result?.items) ? result.items : []) {
      const quantity = Number(item?.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const kind = normalizeOverlayKind(item);
      const xNorm = clamp01(Number(item?.anchor?.xNorm ?? 0.5));
      const yNorm = clamp01(Number(item?.anchor?.yNorm ?? 0.5));
      const width = Number(bbox.width ?? bbox.x1 - bbox.x0);
      const height = Number(bbox.height ?? bbox.y1 - bbox.y0);

      overlays.push({
        page: pageNumber,
        tileId,
        kind,
        quantity: Math.trunc(quantity),
        bbox,
        point: {
          x: round2(Number(bbox.x0) + width * xNorm),
          y: round2(Number(bbox.y0) + height * yNorm),
        },
        evidence: Array.isArray(item?.evidence) ? item.evidence : [],
      });
    }
  }

  return overlays;
}

function normalizeOverlayKind(item) {
  const raw = String(item?.elementType || item?.category || '').trim().toLowerCase();
  if (!raw) return 'other';

  for (const [needle, mapped] of elementTypeRules) {
    if (needle.includes(' ')) {
      const parts = needle.split(' ');
      if (parts.every((part) => raw.includes(part))) return mapped;
      continue;
    }
    if (raw.includes(needle)) return mapped;
  }
  return raw;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
