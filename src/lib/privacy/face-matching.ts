export type FaceMatchStatus = "similar" | "changed";

// OpenCV's published SFace LFW cosine threshold; real capture conditions still require validation.
export const SFACE_COSINE_THRESHOLD = 0.363;

export function cosineSimilarity(
  left: Float32Array,
  right: Float32Array,
): number | null {
  if (left.length === 0 || left.length !== right.length) return null;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    const leftValue = left[i];
    const rightValue = right[i];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftNorm * rightNorm);
  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  return dot / denominator;
}

export function compareCaptureFaces(
  reference: Float32Array | null,
  embeddings: readonly Float32Array[],
  threshold = SFACE_COSINE_THRESHOLD,
): { status: FaceMatchStatus; reference: Float32Array | null } {
  if (embeddings.length === 0) {
    return { status: "changed", reference };
  }

  const nextReference = reference ?? embeddings[0];
  const allSimilar = embeddings.every((embedding) => {
    const score = cosineSimilarity(nextReference, embedding);
    return score !== null && score >= threshold;
  });

  return {
    status: allSimilar ? "similar" : "changed",
    reference: nextReference,
  };
}

export interface Point2D {
  x: number;
  y: number;
}

export interface AffineTransform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const SFACE_LANDMARK_TEMPLATE: readonly Point2D[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

export function getSFaceAlignmentTransform(
  sourcePoints: readonly Point2D[],
): AffineTransform2D | null {
  if (
    sourcePoints.length !== SFACE_LANDMARK_TEMPLATE.length ||
    sourcePoints.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    return null;
  }

  const sourceMean = sourcePoints.reduce(
    (mean, point) => ({ x: mean.x + point.x / 5, y: mean.y + point.y / 5 }),
    { x: 0, y: 0 },
  );
  const targetMean = SFACE_LANDMARK_TEMPLATE.reduce(
    (mean, point) => ({ x: mean.x + point.x / 5, y: mean.y + point.y / 5 }),
    { x: 0, y: 0 },
  );

  let denominator = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < sourcePoints.length; i++) {
    const source = sourcePoints[i];
    const target = SFACE_LANDMARK_TEMPLATE[i];
    const sourceX = source.x - sourceMean.x;
    const sourceY = source.y - sourceMean.y;
    const targetX = target.x - targetMean.x;
    const targetY = target.y - targetMean.y;

    denominator += sourceX * sourceX + sourceY * sourceY;
    a += sourceX * targetX + sourceY * targetY;
    b += sourceX * targetY - sourceY * targetX;
  }

  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  a /= denominator;
  b /= denominator;
  const e = targetMean.x - a * sourceMean.x + b * sourceMean.y;
  const f = targetMean.y - b * sourceMean.x - a * sourceMean.y;

  if (![a, b, e, f].every(Number.isFinite)) return null;
  return { a, b, c: -b, d: a, e, f };
}
