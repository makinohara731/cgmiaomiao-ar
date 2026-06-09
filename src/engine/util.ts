// Small pure helpers shared across engine modules (ported from main.js).
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const pickFrom = <T>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];

/** Weighted random pick: pairs = [[name, weight], …]. */
export function weightedPick(pairs: [string, number][]): string {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [name, w] of pairs) { if ((r -= w) <= 0) return name; }
  return pairs[0][0];
}

/** Local-time YYYY-M-D key (matches main.js localYMD). */
export const localYMD = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};
