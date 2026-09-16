# PDF Editor Architecture

## Rendering and coordinates

The browser uses PDF.js for rendering. Editor geometry is stored in PDF document coordinates, not CSS pixels, so zoom and device pixel ratio do not change the document model.

The rendering path is intentionally split into:

1. PDF.js canvas for the original page.
2. An editor overlay for interactive objects.
3. PDF-space geometry for export and future text-span editing.

## Fidelity rules

- Never rasterize an entire PDF merely to make it editable.
- Preserve the original PDF as the source document whenever possible.
- Treat existing text as source spans with bounding boxes, font metadata and page coordinates.
- Treat redaction as content removal, not as a white rectangle drawn over sensitive content.
- Keep browser-only editing available for annotations and overlays.
- Use the optional local PyMuPDF service for structural PDF operations that are difficult or unsafe to reproduce in the browser.

## Text editing

`POST /api/pdf/text-spans` exposes PyMuPDF text spans with page coordinates and font metadata.

`POST /api/pdf/replace-text` removes a selected span using a real redaction operation and inserts replacement text into the same PDF-space rectangle. Font selection is conservative because a PDF font name is not necessarily a reusable installed font. The service therefore maps common serif, sans-serif and monospaced names to PDF built-ins.

This is structurally safer than painting replacement text onto a rasterized page, but it is not a promise of byte-for-byte font preservation. Exact embedded-font reuse remains a separate engine task.

## Backend contract

The API is optional. It is designed to run locally:

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Set `VITE_PDF_API_URL` if the service is not running at `http://localhost:8000`.

## Security and privacy

The frontend is local-first. No account is required. The backend has no persistence layer and processes the uploaded PDF only for the duration of a request. Deploying the backend publicly should add authentication, request limits, HTTPS, and stricter CORS before production use.
