export const computeCoverage = (activeCount: number, totalCount: number): number => {
  if (totalCount <= 0 || activeCount <= 0) return 0;
  if (activeCount >= totalCount) return 1;
  return activeCount / totalCount;
};
