export function normalizeFoodText(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function diceSimilarity(a: string, b: string): number {
  const x = normalizeFoodText(a).replace(/\s+/g, '');
  const y = normalizeFoodText(b).replace(/\s+/g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const gram = x.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const gram = y.slice(i, i + 2);
    const n = counts.get(gram) ?? 0;
    if (n > 0) {
      overlap++;
      counts.set(gram, n - 1);
    }
  }

  return (2 * overlap) / (x.length + y.length - 2);
}

export function tokenOverlap(query: string, candidate: string): number {
  const q = normalizeFoodText(query).split(' ').filter(t => t.length >= 2);
  const c = new Set(normalizeFoodText(candidate).split(' ').filter(Boolean));
  if (q.length === 0 || c.size === 0) return 0;
  return q.filter(t => c.has(t)).length / q.length;
}
