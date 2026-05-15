export function aggregateTileItems(tileResults, { mode = 'max' } = {}) {
  const grouped = new Map();

  for (const result of Array.isArray(tileResults) ? tileResults : []) {
    const pageNumber = result?.page;
    const tileId = result?.tileId;

    for (const item of Array.isArray(result?.items) ? result.items : []) {
      const category = String(item?.category || '').trim();
      const description = String(item?.description || '').trim();
      if (!description) continue;

      const key = `${category}\u0000${description}`;
      const quantity = Number(item?.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      if (!grouped.has(key)) {
        grouped.set(key, {
          description,
          quantity: 0,
          bestQuantity: 0,
          unit: String(item?.unit || 'EA').trim() || 'EA',
          category,
          elementType: String(item?.elementType || '').trim(),
          dimensions: String(item?.dimensions || '').trim(),
          evidence: [],
          sourceTiles: [],
          sourcePages: [],
        });
      }

      const row = grouped.get(key);
      row.quantity = mode === 'sum' ? row.quantity + quantity : Math.max(row.quantity, quantity);
      row.bestQuantity = Math.max(row.bestQuantity, quantity);
      if (tileId) row.sourceTiles.push(tileId);
      if (pageNumber !== undefined && pageNumber !== null) row.sourcePages.push(Number(pageNumber));
      row.evidence.push(...normalizeEvidence(item?.evidence));
    }
  }

  return [...grouped.values()].map((row) => ({
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    elementType: row.elementType,
    dimensions: row.dimensions,
    evidence: unique(row.evidence).slice(0, 6),
    sourceTiles: row.sourceTiles,
    sourcePages: unique(row.sourcePages).sort((left, right) => left - right),
  }));
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.map((item) => String(item || '').trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}
