export interface UnclaimedResult<T> {
  visible: T[];
  hiddenCount: number;
}

/**
 * Common Desk Rule 2 ("One item, one place"): omits items already claimed
 * by the role half and reports how many were hidden so the block can show "+N on the left".
 */
export function filterUnclaimed<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  claimedKeys: ReadonlySet<string>,
): UnclaimedResult<T> {
  const visible: T[] = [];
  let hiddenCount = 0;
  for (const item of items) {
    if (claimedKeys.has(getKey(item))) hiddenCount += 1;
    else visible.push(item);
  }
  return { visible, hiddenCount };
}
