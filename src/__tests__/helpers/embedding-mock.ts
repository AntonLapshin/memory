// Deterministic embedding generator for tests.
// Generates 768-dim float arrays with controlled cosine similarity between them.

const DIM = 768;

/**
 * Generate a pseudo-random-looking but deterministic embedding from a seed.
 * Vector is normalized to unit length (matching nomic-embed-text behavior).
 */
export function deterministicEmbedding(seed: number): number[] {
  let s = seed;
  const vec: number[] = [];
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;

  for (let i = 0; i < DIM; i++) {
    s = (a * s + c) % m;
    vec.push((s / m - 0.5) * 2); // range [-1, 1]
  }

  // Normalize to unit length
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm > 1e-10) {
    for (let i = 0; i < DIM; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Generate an embedding that has a specific cosine similarity to `base`.
 * The returned vector is guaranteed to be unit length.
 */
export function embeddingWithSimilarity(
  base: number[],
  alpha: number,
  seed: number,
): number[] {
  const baseNorm = Math.sqrt(base.reduce((sum, b) => sum + b * b, 0));
  const unitBase = baseNorm > 1e-10
    ? base.map((b) => b / baseNorm)
    : base;

  const random = deterministicEmbedding(seed);

  const dot = unitBase.reduce((sum, b, i) => sum + b * random[i], 0);
  const orthogonal = random.map((r, i) => r - dot * unitBase[i]);

  const orthNorm = Math.sqrt(orthogonal.reduce((sum, o) => sum + o * o, 0));
  const unitOrth = orthNorm > 1e-10
    ? orthogonal.map((o) => o / orthNorm)
    : deterministicEmbedding(seed + 99999);

  const beta = Math.sqrt(Math.max(0, 1 - alpha * alpha));
  return unitBase.map((b, i) => alpha * b + beta * unitOrth[i]);
}

/**
 * Predicted score using the current formula: max(0, 1 - L2_distance) rounded to 2 decimals.
 */
export function predictedScore(cosSim: number): number {
  const l2 = Math.sqrt(Math.max(0, 2 * (1 - cosSim)));
  return Math.round(Math.max(0, 1 - l2) * 100) / 100;
}
