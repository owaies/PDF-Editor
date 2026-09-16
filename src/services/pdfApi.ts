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

const API_BASE = (import.meta.env.VITE_PDF_API_URL || 'http://localhost:8000').replace(/\/$/, '');

async function pdfRequest(path: string, file: Blob, payload?: unknown): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  const response = await fetch(`${API_BASE}${path}${payload ? `?request=${encodeURIComponent(JSON.stringify(payload))}` : ''}`, {
    method: 'POST',
    body: payload ? (() => { form.append('request', JSON.stringify(payload)); return form; })() : form,
  });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response.blob();
}

export async function inspectTextSpans(file: Blob): Promise<TextSpan[]> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  const response = await fetch(`${API_BASE}/api/pdf/text-spans`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  const data = await response.json() as { spans: TextSpan[] };
  return data.spans;
}

export async function replaceTextSpan(file: Blob, request: {
  pageIndex: number;
  bbox: [number, number, number, number];
  text: string;
  font?: string;
  size?: number;
  color?: number;
}): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  form.append('request', JSON.stringify(request));
  const response = await fetch(`${API_BASE}/api/pdf/replace-text`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response.blob();
}

export async function deletePages(file: Blob, pageIndexes: number[]): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  form.append('request', JSON.stringify({ pageIndexes }));
  const response = await fetch(`${API_BASE}/api/pdf/delete-pages`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response.blob();
}

export async function rotatePage(file: Blob, pageIndex: number, delta = 90): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  form.append('request', JSON.stringify({ pageIndex, delta }));
  const response = await fetch(`${API_BASE}/api/pdf/rotate-page`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response.blob();
}

export async function redact(file: Blob, pageIndex: number, rects: number[][]): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, 'document.pdf');
  form.append('request', JSON.stringify({ pageIndex, rects }));
  const response = await fetch(`${API_BASE}/api/pdf/redact`, { method: 'POST', body: form });
  if (!response.ok) throw new Error((await response.text()) || `PDF API error ${response.status}`);
  return response.blob();
}
