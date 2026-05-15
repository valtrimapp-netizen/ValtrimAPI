import { readJsonIfExists, writeJson } from '../../utils/files.js';
import { symbolPrecisionProfile } from './extractionProfile.js';
import { aggregateTileItems } from './resultAggregation.js';
import { buildElementSummary } from './elementSummary.js';

export function postProcessExtractionArtifacts(run) {
  const tileResults = readJsonIfExists(run.tileResultsPath);
  const pythonAggregated = readJsonIfExists(run.outputPath);
  const rows = Array.isArray(tileResults)
    ? aggregateTileItems(tileResults, { mode: symbolPrecisionProfile.aggregateMode })
    : Array.isArray(pythonAggregated)
      ? pythonAggregated
      : [];

  const summary = buildElementSummary(rows);

  writeJson(run.outputPath, rows);
  writeJson(run.summaryPath, summary);

  return {
    rows,
    summary,
    tileResults,
  };
}
