export function buildTileSystemPrompt({ catalogItems = [], calibrationMode = false, focusCategories = [], extractionMode = 'element' } = {}) {
  const catalogLines = catalogItems.map((item) => `  - [${item.category}] ${item.description}`).join('\n');
  const cleanFocusCategories = focusCategories.map((category) => String(category || '').trim()).filter(Boolean);

  const calibrationRules = calibrationMode
    ? `
- Calibration mode: maximize recall. Prefer including plausible carpentry items over missing them.
- For interior/exterior door openings, include corresponding frame items when the opening clearly exists.
- For closet/W.I.C. regions, include shelf/pole, shelf/cleat, bypass and stack items when dimensions/layout strongly suggest them.
- If unsure between two close catalog options, choose the closest dimension/model match and include evidence.
`
    : '';

  const focusRules = cleanFocusCategories.length
    ? `\n- Focus pass: prioritize these categories first: ${cleanFocusCategories.join(', ')}.`
    : '';

  const precisionRules = calibrationMode
    ? ''
    : `
- Precision mode: do not infer carpentry items from room names, fixture symbols, or isolated dimensions alone.
- Require at least one direct visual cue for each item (opening break, swing arc, pocket symbol, slider/bypass symbol, explicit door/frame annotation, or closet millwork block).
- If cues are weak or conflicting, return [] instead of guessing.
`;

  if (extractionMode === 'element') {
    return `You are reviewing a cropped region from a residential architectural floor plan.

Domain context: California residential plan sets (door schedules, elevations, and model tags may appear near symbols).

The PDF itself is vector-derived, but some visible labels may be outlined instead of selectable text.
Your task is to identify only the carpentry elements visible in THIS crop, without mapping to any catalog.

Output ONLY a valid JSON array. No markdown.

Each array item must have this exact shape:
{
  "elementType": "<door|pocket door|bifold door|swing door|sliding door|frame|shelf pole|shelf cleat|stack|bypass|casing|other>",
  "dimensions": "<short human-readable dimensions or size string>",
  "anchor": {"xNorm": <0..1>, "yNorm": <0..1>},
  "quantity": <integer>,
  "unit": "EA",
  "evidence": ["short reason 1", "short reason 2"]
}

Rules:
- Do not use catalog names or catalog categories.
- Focus on doors (including subtypes: pocket, bifold, swing, sliding), door frames, bypass units, stacks, shelf/pole, shelf/cleat and casing.
- Ignore title blocks, general notes, plumbing fixtures, furniture and non-carpentry symbols.
- Count only items that are primarily inside the crop.
- Architectural symbol cues (use these explicitly):
  - Single swing door: straight leaf/opening line plus ~90-degree swing arc.
  - Double door: two opposing arcs or paired leaves meeting at center.
  - Exterior door cue: opening on perimeter wall or wall adjacent to exterior/garage; linework may look heavier.
  - Interior door cue: opening inside habitable/interior partition walls.
- Do not classify header-height notes (e.g., HDR, HGT, TYP, F.F.) as doors/frames unless a real door/opening symbol is clearly visible at the same location.
- Use standardized human-readable dimensions when possible, such as 2'-6" x 6'-8" instead of raw plan shorthand like 2068.
- If size appears as 3/0 x 8/0 (or similar), normalize it to 3'0" x 8'0" in dimensions.
- Set anchor.xNorm and anchor.yNorm on the actual symbol/opening center, not the center of the crop.
- Do not place anchors in empty space; every anchor must land on visible geometry/text cue for that item.
- Important recall rule: do not skip visible door openings or closet systems. Prefer including probable doors/stacks over missing them.
- Door subtypes: pocket doors have a pocket symbol or "POCKET" label; bifold doors have "BIFOLD" or "BI-FOLD" label; sliding doors have "SLIDING", "SLIDER", or "BI-PASS" label; swing doors have swing arcs, hinges, or "SWING"/"HINGE" label. If subtype is unclear, use generic "door".
- Frame rule: output frame only when there is explicit frame/opening evidence; do not auto-duplicate every door as frame without a separate cue.
- Stack cues: labels containing STACK and nearby closet/W.I.C. millwork blocks with dimension strings.
- Bypass cues: labels such as BI-PASS/BYPASS and sliding closet opening symbols.
- If you output a door/stack/bypass item, always include the strongest cue in evidence.
- Do not output duplicate items for the same physical symbol; merge into one row with quantity 1 unless there are clearly separate symbols.
- If model/elevation tags are visible near the symbol (e.g., S8201, S8600, TS100, A/B/C), capture them in evidence.
- If thickness/value/model/elevation is not clearly readable, do not invent; omit from dimensions and state uncertainty in evidence.
- If an item is ambiguous but still likely, include it with the best elementType and dimensions you can infer.
- If there is no symbol/opening cue and only text nearby, do not output an item.
- If nothing relevant is visible, return [].
${calibrationRules}${precisionRules}${focusRules}
`;
  }

  return `You are reviewing a cropped region from a residential architectural floor plan.

The PDF itself is vector-derived, but some visible labels may be outlined instead of selectable text.
Your task is to identify only carpentry / millwork items visible in THIS crop and map them to the closest catalog description.

Output ONLY a valid JSON array. No markdown.

Each array item must have this exact shape:
{
  "description": "<exact catalog description>",
  "quantity": <integer>,
  "unit": "EA",
  "category": "<catalog category>",
  "evidence": ["short reason 1", "short reason 2"]
}

Rules:
- Use ONLY descriptions from the catalog.
- Focus on doors, door frames, bypass units, stacks, shelf/pole, shelf/cleat and casing.
- Ignore title blocks, general notes, plumbing fixtures, furniture and non-carpentry symbols.
- Count only items that are primarily inside the crop.
- Do not infer items from dimensions or room labels alone; require at least one direct symbol/opening cue.
- If cues are weak or conflicting, return [] instead of guessing.
- If an item is ambiguous but still likely, include it with the best exact catalog description.
- If nothing relevant is visible, return [].
${calibrationRules}${precisionRules}${focusRules}

Catalog:
${catalogLines}
`;
}

export function buildTileUserPrompt(tile) {
  const hintLines = [];
  const drawingCount = tile?.drawingCount || 0;
  const wordCount = tile?.wordCount || 0;

  if (!wordCount) {
    hintLines.push('No selectable text detected in this crop (words=0). Use geometry-first reasoning: find door/opening symbols (leaf + arc, opening breaks, pocket/slider marks).');
    hintLines.push('Ignore standalone annotation strings unless they are attached to a visible door/opening symbol.');
  }

  if (Array.isArray(tile?.nearbyDimensions) && tile.nearbyDimensions.length) {
    hintLines.push(`Nearby dimension strings from vector parse: ${tile.nearbyDimensions.slice(0, 18).join(', ')}`);
  }
  if (tile?.symbolHint) {
    hintLines.push(`Symbol candidate hint: ${tile.symbolHint}`);
  }
  if (tile?.symbolCandidate) {
    hintLines.push('This crop is centered on one likely door/opening symbol. Resolve the exact symbol and do not ignore it.');
  }

  return [
    `Tile id: ${tile.id}`,
    `Tile bbox: ${JSON.stringify(tile.bbox)}`,
    `Vector density: drawings=${drawingCount} words=${wordCount}`,
    ...hintLines,
    'Extract the carpentry BOM items for this crop only.',
  ].join('\n');
}
