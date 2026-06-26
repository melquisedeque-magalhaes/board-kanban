const STEP = 1000;

export function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next! - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}
