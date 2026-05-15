export const symbolPrecisionProfile = {
  extractionMode: 'element',
  profile: 'symbol_precision',
  visionMode: 'ambiguous',
  elementRegionScope: 'floor_plan',
  elementMinDensity: 40,
  aggregateMode: 'max',
  vectorDoorMinSize: 8,
  vectorDoorMaxSize: 70,
  vectorDedupeDistance: 12,
  symbolMaxCropsPerPage: 42,
  overlayOnlyTypes: [
    'door',
    'pocket door',
    'bifold door',
    'swing door',
    'sliding door',
    'frame',
    'stack',
    'bypass',
    'casing',
    'shelf pole',
    'shelf cleat',
  ],
  overlayMode: 'point',
};

export function buildExtractorArgs({ pythonScript, pdfPath, page, apiKey, model, outputPath, artifactsDir, visionTasksPath }) {
  const args = [
    pythonScript,
    '--pdf',
    pdfPath,
    '--page',
    String(page),
    '--extraction-mode',
    symbolPrecisionProfile.extractionMode,
    '--model',
    model,
    '--out',
    outputPath,
    '--artifacts-dir',
    artifactsDir,
    '--profile',
    symbolPrecisionProfile.profile,
    '--enable-vector-symbols',
    '--symbol-precision',
    '--use-cache-ir',
    '--on-api-error',
    'skip',
    '--aggregate-mode',
    symbolPrecisionProfile.aggregateMode,
    '--vector-door-min-size',
    String(symbolPrecisionProfile.vectorDoorMinSize),
    '--vector-door-max-size',
    String(symbolPrecisionProfile.vectorDoorMaxSize),
    '--vector-dedupe-distance',
    String(symbolPrecisionProfile.vectorDedupeDistance),
    '--symbol-max-crops-per-page',
    String(symbolPrecisionProfile.symbolMaxCropsPerPage),
    '--vision-mode',
    symbolPrecisionProfile.visionMode,
    '--element-region-scope',
    symbolPrecisionProfile.elementRegionScope,
    '--element-min-density',
    String(symbolPrecisionProfile.elementMinDensity),
  ];

  if (visionTasksPath) {
    args.push('--vision-tasks-out', visionTasksPath);
  } else {
    args.push('--api-key', apiKey);
  }

  return args;
}
