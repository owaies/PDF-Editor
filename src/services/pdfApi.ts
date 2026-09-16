export type TextSpan = {
  id: string;
  pageIndex: number;
  text: string;
  bbox: [number, number, number, number];
  font: string;
  size: number;
  color: number;
  flags: number;
  origin: [number, number];
};

export type TextReplacementEdit = {
  pageIndex: number;
  sourceBBox: [number, number, number, number];
  targetBBox?: [number, number, number, number];
  text: string;
  font?: string;
  size?: number;
  color?: number;
};

// Empty means same-origin. This makes the production Vercel deployment use its
// own /api routes while still allowing VITE_PDF_API_URL for a separate backend.
const API_BASE = (import.meta.env.VITE_PDF_API_URL || '').replace(/\/$/, '');

async function postMultipart(path: string, file: Blob, request?: unknown): Promise<Response> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  if (request !== undefined) form.append('request', JSON.stringify(request));
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response;
}

export async function inspectTextSpans(file: Blob): Promise<TextSpan[]> {
  const response = await postMultipart('/api/pdf/text-spans', file);
  const data = await response.json() as { spans: TextSpan[] };
  return data.spans;
}

export async function replaceTextSpans(file: Blob, edits: TextReplacementEdit[]): Promise<Blob> {
  if (!edits.length) return file;
  return (await postMultipart('/api/pdf/replace-text-spans', file, { edits })).blob();
}

export async function replaceTextSpan(file: Blob, request: TextReplacementEdit): Promise<Blob> {
  return (await postMultipart('/api/pdf/replace-text', file, {
    pageIndex: request.pageIndex,
    bbox: request.sourceBBox,
    text: request.text,
    font: request.font,
    size: request.size,
    color: request.color,
  })).blob();
}

export async function deletePages(file: Blob, pageIndexes: number[]): Promise<Blob> {
  return (await postMultipart('/api/pdf/delete-pages', file, { pageIndexes })).blob();
}

export async function rotatePage(file: Blob, pageIndex: number, delta = 90): Promise<Blob> {
  return (await postMultipart('/api/pdf/rotate-page', file, { pageIndex, delta })).blob();
}

export async function redact(file: Blob, pageIndex: number, rects: number[][]): Promise<Blob> {
  return (await postMultipart('/api/pdf/redact', file, { pageIndex, rects })).blob();
}
