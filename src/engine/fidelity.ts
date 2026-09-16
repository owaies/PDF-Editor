export type FidelityIssue = { code: string; severity: 'info' | 'warning' | 'error'; message: string };

export function inspectExport(source: { pageCount: number; fileSize: number }, exported: { pageCount: number; fileSize: number }): FidelityIssue[] {
  const issues: FidelityIssue[] = [];
  if (source.pageCount !== exported.pageCount) issues.push({ code: 'PAGE_COUNT', severity: 'error', message: `Page count changed from ${source.pageCount} to ${exported.pageCount}.` });
  if (exported.fileSize === 0) issues.push({ code: 'EMPTY_EXPORT', severity: 'error', message: 'Exported PDF is empty.' });
  if (source.fileSize > 0 && exported.fileSize < source.fileSize * 0.05) issues.push({ code: 'SIZE_COLLAPSE', severity: 'warning', message: 'Exported PDF is dramatically smaller than the source and may have lost content.' });
  return issues;
}

export function approximatelyEqual(a: number, b: number, tolerance = 0.01) { return Math.abs(a - b) <= tolerance; }
