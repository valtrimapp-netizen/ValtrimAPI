export function buildElementSummary(rows) {
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const elementType = String(row?.elementType || row?.category || 'other').trim().toLowerCase() || 'other';
    const dimensions = String(row?.dimensions || '').trim();
    const quantity = Number(row?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const key = `${elementType}\u0000${dimensions}`;
    grouped.set(key, (grouped.get(key) || 0) + quantity);
  }

  const summaryRows = [...grouped.entries()]
    .map(([key, quantity]) => {
      const [elementType, dimensions] = key.split('\u0000');
      return {
        elementType,
        dimensions,
        quantity,
        unit: 'EA',
      };
    })
    .sort((left, right) => {
      const byType = left.elementType.localeCompare(right.elementType);
      return byType || left.dimensions.localeCompare(right.dimensions);
    });

  const totalsByType = new Map();
  for (const row of summaryRows) {
    totalsByType.set(row.elementType, (totalsByType.get(row.elementType) || 0) + row.quantity);
  }

  return {
    totalDistinctRows: summaryRows.length,
    totalQuantity: summaryRows.reduce((total, row) => total + row.quantity, 0),
    totalsByType: [...totalsByType.entries()]
      .map(([elementType, quantity]) => ({ elementType, quantity }))
      .sort((left, right) => left.elementType.localeCompare(right.elementType)),
    rows: summaryRows,
  };
}
