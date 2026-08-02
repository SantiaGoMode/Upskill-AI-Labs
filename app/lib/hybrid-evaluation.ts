import type { DeterministicEvalResult, RubricBand } from "./attempt-types";

export const rubricDimensions = ["grounding", "completeness", "judgment", "efficiency", "guardrails"] as const;
export type RubricDimension = (typeof rubricDimensions)[number];

export type JudgeDimension = {
  band: RubricBand;
  rationale: string;
  evidence: string[];
};

export type JudgeEvaluation = {
  dimensions: Record<RubricDimension, JudgeDimension>;
  overallRationale: string;
};

export type JudgeRecord = JudgeEvaluation & {
  id: string;
  provider: string;
  model: string;
  judgeIndex: number;
};

export type EnsembleDimension = {
  band: RubricBand;
  confidence: "Low" | "Medium" | "High";
  votes: Record<RubricBand, number>;
  provisional: boolean;
};

export type EnsembleResult = {
  dimensions: Record<RubricDimension, EnsembleDimension>;
  judgeCount: number;
};

const bandOrder: RubricBand[] = ["Developing", "Capable", "Strong"];

export function isRubricBand(value: unknown): value is RubricBand {
  return typeof value === "string" && bandOrder.includes(value as RubricBand);
}

export function aggregateJudges(judges: JudgeRecord[], agreement?: Record<RubricDimension, number | null>): EnsembleResult {
  const dimensions = Object.fromEntries(rubricDimensions.map((dimension) => {
    const votes: Record<RubricBand, number> = { Developing: 0, Capable: 0, Strong: 0 };
    for (const judge of judges) votes[judge.dimensions[dimension].band] += 1;
    const ranked = bandOrder.map((band) => ({ band, count: votes[band] }))
      .sort((a, b) => b.count - a.count || bandOrder.indexOf(a.band) - bandOrder.indexOf(b.band));
    const winner = ranked[0];
    const confidence = winner.count === judges.length ? "High" : winner.count >= Math.ceil(judges.length / 2) ? "Medium" : "Low";
    return [dimension, {
      band: winner.band,
      confidence,
      votes,
      provisional: agreement?.[dimension] != null && (agreement[dimension] as number) < 0.75,
    }];
  })) as Record<RubricDimension, EnsembleDimension>;
  return { dimensions, judgeCount: judges.length };
}

export type CalibrationPair = {
  ensemble: Record<RubricDimension, RubricBand>;
  human: Record<RubricDimension, RubricBand>;
};

// Quadratic-weighted Cohen's kappa is used as the blueprint's permitted alpha-equivalent
// for two raters: the ensemble consensus and the facilitator calibration score.
export function agreementByDimension(pairs: CalibrationPair[]): Record<RubricDimension, number | null> {
  return Object.fromEntries(rubricDimensions.map((dimension) => [dimension, weightedKappa(
    pairs.map((pair) => [pair.ensemble[dimension], pair.human[dimension]]),
  )])) as Record<RubricDimension, number | null>;
}

function weightedKappa(pairs: Array<[RubricBand, RubricBand]>): number | null {
  if (pairs.length < 2) return null;
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const [left, right] of pairs) matrix[bandOrder.indexOf(left)][bandOrder.indexOf(right)] += 1;
  const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = [0, 1, 2].map((column) => matrix.reduce((sum, row) => sum + row[column], 0));
  const total = pairs.length;
  let observed = 0;
  let expected = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const weight = ((row - column) ** 2) / 4;
      observed += weight * (matrix[row][column] / total);
      expected += weight * ((rowTotals[row] * columnTotals[column]) / (total * total));
    }
  }
  if (expected === 0) return observed === 0 ? 1 : null;
  return Math.max(-1, Math.min(1, 1 - observed / expected));
}

export function deterministicAsJudge(result: DeterministicEvalResult): JudgeEvaluation {
  return {
    dimensions: Object.fromEntries(rubricDimensions.map((dimension) => [dimension, {
      band: result.dimensions[dimension].band,
      rationale: result.dimensions[dimension].nextStep,
      evidence: result.dimensions[dimension].evidence,
    }])) as Record<RubricDimension, JudgeDimension>,
    overallRationale: result.summary,
  };
}
