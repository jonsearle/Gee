export const RETRIEVAL_POLICY = {
  timeWindowMonths: 12,
  maxResultsPerToolCall: 25,
  maxToolCallsPerRequest: 4,
  maxSurfacedItems: 5,
  targetSurfacedItems: 3,
  maxSemanticVariantsPerTool: 2,
};

export const SCORE_WEIGHTS = {
  entityMatch: 0.35,
  intentMatch: 0.25,
  temporalRelevance: 0.2,
  interactionSignal: 0.1,
  sourceQuality: 0.1,
};

export const SCORE_THRESHOLDS = {
  high: 0.72,
  maybe: 0.55,
};

export const LOW_CONFIDENCE_MESSAGE = 'I didn’t find anything clearly relevant.';
