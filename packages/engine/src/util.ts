/** Deep clone of plain JSON data (BattleState is always plain JSON). */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out as T;
  }
  return value;
}
