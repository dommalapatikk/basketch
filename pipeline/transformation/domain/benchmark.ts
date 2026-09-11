// Benchmark scoring — the model bake-off and the permanent regression gate.
//
// WHY macro-F1 and not accuracy:
// the Denner set is severely imbalanced. beauty-hygiene alone is 66 of 291 rows,
// and the top three classes are over half the set. A model that only ever
// answered with the three biggest categories would post a flattering overall
// accuracy while being useless — the tomato-purée bug in a new costume.
// Macro-F1 averages per class, so ignoring a rare class costs the same as
// ignoring a common one.
//
// WHY provenance is kept apart:
// 251 rows carry Denner's own labels. 40 are ours, hand-written for products
// Denner files under 'Sonstiges'. Mixing them would let our own guesses flatter
// the result, so both are always reported separately (D1).
//
// This module imports no infrastructure.

export type Provenance = 'denner' | 'derived'

export type BenchmarkRow = {
  readonly productName: string
  readonly descriptor: string | null
  readonly category: string
  readonly subCategory: string
  readonly provenance: Provenance
}

export type Prediction = {
  readonly productName: string
  readonly category: string
  readonly subCategory: string
}

export type Score = {
  readonly total: number
  readonly correct: number
  /** Rows the model returned no prediction for. Counted as wrong, never ignored. */
  readonly missing: number
  readonly accuracy: number
  readonly macroF1: number
  /** Per-category recall — which classes the model is weak on. */
  readonly perCategory: Record<string, number>
}

export type BenchmarkResult = {
  /** Denner's own labels only. The honest number. */
  readonly denner: Score
  /** Our hand-written labels only. */
  readonly derived: Score
  readonly combined: Score
}

/** Predictions keyed by product name; later duplicates are ignored. */
function index(predictions: readonly Prediction[]): Map<string, Prediction> {
  const m = new Map<string, Prediction>()
  for (const p of predictions) if (!m.has(p.productName)) m.set(p.productName, p)
  return m
}

/**
 * Macro-averaged F1 across every class present in the truth set.
 *
 * A class the model invents (predicted, never true) still counts against
 * precision — otherwise hallucinating categories would be free.
 */
export function macroF1(truth: readonly BenchmarkRow[], predictions: readonly Prediction[]): number {
  if (truth.length === 0) return 0
  const byName = index(predictions)

  const classes = new Set<string>()
  for (const t of truth) classes.add(t.category)
  for (const p of predictions) classes.add(p.category)

  let sum = 0
  let counted = 0

  for (const cls of classes) {
    let tp = 0
    let fp = 0
    let fn = 0

    for (const t of truth) {
      const predicted = byName.get(t.productName)?.category ?? null
      if (t.category === cls && predicted === cls) tp++
      else if (t.category !== cls && predicted === cls) fp++
      else if (t.category === cls && predicted !== cls) fn++
    }

    // A class that neither appears in truth nor was predicted is not scored.
    if (tp + fp + fn === 0) continue

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

    sum += f1
    counted++
  }

  return counted === 0 ? 0 : sum / counted
}

function score(truth: readonly BenchmarkRow[], predictions: readonly Prediction[]): Score {
  const byName = index(predictions)

  let correct = 0
  let missing = 0
  const hits: Record<string, number> = {}
  const totals: Record<string, number> = {}

  for (const t of truth) {
    totals[t.category] = (totals[t.category] ?? 0) + 1
    const p = byName.get(t.productName)
    if (!p) {
      missing++
      continue
    }
    if (p.category === t.category) {
      correct++
      hits[t.category] = (hits[t.category] ?? 0) + 1
    }
  }

  const perCategory: Record<string, number> = {}
  for (const [cls, n] of Object.entries(totals)) perCategory[cls] = n === 0 ? 0 : (hits[cls] ?? 0) / n

  return {
    total: truth.length,
    correct,
    missing,
    accuracy: truth.length === 0 ? 0 : correct / truth.length,
    macroF1: macroF1(truth, predictions),
    perCategory,
  }
}

export function scoreBenchmark(
  truth: readonly BenchmarkRow[],
  predictions: readonly Prediction[],
): BenchmarkResult {
  return {
    denner: score(
      truth.filter((r) => r.provenance === 'denner'),
      predictions,
    ),
    derived: score(
      truth.filter((r) => r.provenance === 'derived'),
      predictions,
    ),
    combined: score(truth, predictions),
  }
}
