export type Rect = { x: number; y: number; width: number; height: number };

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function containsPoint(rect: Rect, x: number, y: number, padding = 0): boolean {
  return x >= rect.x - padding && x <= rect.x + rect.width + padding && y >= rect.y - padding && y <= rect.y + rect.height + padding;
}

export function center(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function clampRect(rect: Rect, pageWidth: number, pageHeight: number): Rect {
  const x = Math.max(0, Math.min(rect.x, pageWidth));
  const y = Math.max(0, Math.min(rect.y, pageHeight));
  return { x, y, width: Math.max(0, Math.min(rect.width, pageWidth - x)), height: Math.max(0, Math.min(rect.height, pageHeight - y)) };
}
