/**
 * Where a card being dragged along a row belongs: after every other card whose slot is centred left
 * of `x`. `mids` are the slots' centres as the row stands now, so the others keep their order.
 */
export function orderByX(ids: string[], dragId: string, x: number, mids: Record<string, number>): string[] {
  const others = ids.filter((id) => id !== dragId);
  const at = others.filter((id) => mids[id] < x).length;
  return [...others.slice(0, at), dragId, ...others.slice(at)];
}
