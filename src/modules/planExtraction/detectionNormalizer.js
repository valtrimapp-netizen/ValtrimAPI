const elementTypeRules = [
  ['bypass', 'bypass'],
  ['shelf pole', 'shelf pole'],
  ['shelf cleat', 'shelf cleat'],
  ['stack', 'stack'],
  ['casing', 'casing'],
  ['frame', 'frame'],
  ['pocket door', 'pocket door'],
  ['bifold door', 'bifold door'],
  ['swing door', 'swing door'],
  ['sliding door', 'sliding door'],
  ['door', 'door'],
];

export function normalizeVisionItems(items, { catalogItems = [], enforceCatalogExact = false, extractionMode = 'element' } = {}) {
  const catalogLookup = new Map();
  for (const item of catalogItems) {
    const description = String(item?.description || '').trim();
    if (!description) continue;
    catalogLookup.set(canonicalizeText(description), {
      description,
      category: String(item?.category || '').trim(),
    });
  }

  const normalized = [];
  for (const row of Array.isArray(items) ? items : []) {
    if (!row || typeof row !== 'object') continue;

    const quantity = Number(row.quantity ?? row.qty ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const evidence = normalizeEvidence(row.evidence);
    if (extractionMode === 'element') {
      const rawDescription = String(row.description || '').trim();
      let rawType = String(row.elementType || row.element_type || row.category || rawDescription).trim();
      let dimensions = String(row.dimensions || row.size || '').trim();

      rawType = stripBracketPrefix(rawType);
      dimensions = stripBracketPrefix(dimensions);
      dimensions = dimensions ? parseDimensionFromText(dimensions) : parseDimensionFromText(rawDescription) || parseDimensionFromText(evidence.slice(0, 3).join(' '));

      const elementType = inferElementType(rawType, dimensions, rawDescription, evidence);
      const anchor = normalizeAnchor(row.anchor, row);
      if (!elementType && !dimensions) continue;

      normalized.push({
        description: `${elementType} ${dimensions}`.trim(),
        elementType,
        dimensions,
        anchor,
        quantity: Math.trunc(quantity),
        unit: String(row.unit || 'EA').trim() || 'EA',
        category: elementType,
        evidence: evidence.slice(0, 4),
      });
      continue;
    }

    let description = stripBracketPrefix(String(row.description || '').trim());
    if (!/[A-Za-z]/.test(description)) continue;

    let category = String(row.category || '').trim();
    if (enforceCatalogExact && catalogLookup.size) {
      const catalogItem = catalogLookup.get(canonicalizeText(description));
      if (!catalogItem) continue;
      description = catalogItem.description;
      category ||= catalogItem.category;
    }

    normalized.push({
      description,
      quantity: Math.trunc(quantity),
      unit: String(row.unit || 'EA').trim() || 'EA',
      category,
      evidence: evidence.slice(0, 4),
    });
  }

  return normalized;
}

export function parseJsonArrayResponse(rawText) {
  let text = String(rawText || '').trim();
  if (text.startsWith('```')) {
    text = text
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('```'))
      .join('\n')
      .trim();
  }

  const start = text.indexOf('[');
  if (start === -1) {
    throw new Error('Claude response did not contain a JSON array');
  }

  const arrayText = extractJsonArrayText(text.slice(start));
  return JSON.parse(arrayText);
}

function extractJsonArrayText(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(0, index + 1);
    }
  }

  throw new Error('Claude response JSON array was not closed');
}

function normalizeElementType(value) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[\/]+/g, ' ').replace(/\s+/g, ' ');
  if (!cleaned) return 'other';

  for (const [needle, mapped] of elementTypeRules) {
    if (needle.includes(' ')) {
      const parts = needle.split(' ');
      if (parts.every((part) => cleaned.includes(part))) return mapped;
      continue;
    }
    if (cleaned.includes(needle)) return mapped;
  }

  return cleaned;
}

function inferElementType(rawType, rawDimension, rawDescription, evidenceItems) {
  const base = normalizeElementType(rawType);
  if (base && base !== 'other') return base;

  const blob = [rawType, rawDimension, rawDescription, ...evidenceItems].join(' ').toLowerCase();
  for (const [needle, mapped] of [
    ['pocket door', 'pocket door'],
    ['bifold', 'bifold door'],
    ['swing', 'swing door'],
    ['sliding', 'sliding door'],
    ['bypass', 'bypass'],
    ['shelf', 'shelf pole'],
    ['cleat', 'shelf cleat'],
    ['stack', 'stack'],
    ['casing', 'casing'],
    ['frame', 'frame'],
    ['jamb', 'frame'],
    ['door', 'door'],
  ]) {
    if (blob.includes(needle)) return mapped;
  }

  return 'other';
}

function parseDimensionFromText(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  const fiveDigits = compact.match(/\b(\d{5})\b/);
  if (fiveDigits) {
    const token = fiveDigits[1];
    return formatFeetInches(Number(token[0]), Number(token.slice(1, 3)), Number(token[3]), Number(token[4]));
  }

  const fourDigits = compact.match(/\b(\d{4})\b/);
  if (fourDigits) {
    const token = fourDigits[1];
    return formatFeetInches(Number(token[0]), Number(token[1]), Number(token[2]), Number(token[3]));
  }

  const slash = text.match(/(\d+)\s*\/\s*(\d+)\s*[Xx]\s*(\d+)\s*\/\s*(\d+)/);
  if (slash) return formatFeetInches(Number(slash[1]), Number(slash[2]), Number(slash[3]), Number(slash[4]));

  const dash = text.match(/(\d+)\s*'\s*-?\s*(\d+)\s*"?\s*[Xx]\s*(\d+)\s*'\s*-?\s*(\d+)\s*"?/);
  if (dash) return formatFeetInches(Number(dash[1]), Number(dash[2]), Number(dash[3]), Number(dash[4]));

  return String(value || '').trim();
}

function formatFeetInches(widthFt, widthIn, heightFt, heightIn) {
  return `${widthFt}'${widthIn}" X ${heightFt}'${heightIn}"`;
}

function normalizeAnchor(anchor, row) {
  const source = anchor && typeof anchor === 'object' ? anchor : row;
  const xNorm = clamp01(Number(source.xNorm ?? 0.5));
  const yNorm = clamp01(Number(source.yNorm ?? 0.5));
  return { xNorm, yNorm };
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.map((item) => String(item || '').trim()).filter(Boolean);
}

function stripBracketPrefix(value) {
  if (value.startsWith('[') && value.includes(']')) return value.split(']').slice(1).join(']').trim();
  return value;
}

function canonicalizeText(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
