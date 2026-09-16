# PDF Editor

A free, privacy-first PDF editor built with React, TypeScript, PDF.js, pdf-lib and an optional local PyMuPDF engine.

## Current foundation

- Local PDF opening and rendering with PDF.js
- High-DPI page rendering
- Page thumbnails and page navigation
- Zoom from 25% to 400%
- Search across PDF text
- Document-space coordinates independent of zoom
- Selectable existing PDF text spans
- Existing text editing through the local PyMuPDF engine
- Embedded-font reuse when the source font program can be extracted
- Automatic text fitting when replacement text is longer than the source box
- Add text overlays
- Add highlights
- Add vector rectangles
- Insert image support
- Drag, resize and rotate editable objects
- Exact numeric properties panel
- Undo/redo history
- Keyboard shortcuts
- Local PDF export using pdf-lib
- True structural replacement for modified existing text
- Light/dark UI
- No account and no automatic document persistence

## Run locally

Frontend:

```bash
npm install
npm run dev
```

High-fidelity existing-text editing requires the local PDF engine:

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\\Scripts\\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Then:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The frontend defaults to `http://localhost:8000`. Set `VITE_PDF_API_URL` when the backend runs elsewhere.

Build:

```bash
npm run build
```

Backend checks:

```bash
PYTHONPATH=backend pytest backend/tests -q
```

## High-fidelity text editing

The browser first asks the local engine for PDF text spans. Each selected span keeps its source bounding box, source font name, source font size and source color.

When an existing text object is changed, export sends the original source rectangle and the edited target rectangle to:

`POST /api/pdf/replace-text-spans`

PyMuPDF removes the original source text as PDF content and inserts replacement text as vector/text content. The engine captures embedded font programs before redaction and reuses them when extraction is possible. If the source font cannot be reused, it falls back to a conservative built-in PDF font mapping.

This is substantially more faithful than rasterizing a page or simply painting a white rectangle over the original text. It is not guaranteed to preserve every unusual PDF feature, such as Type 3 fonts, complex writing systems, or text drawn as vector outlines.

## Architecture

The viewer uses PDF.js for rendering and a separate editor object layer for user modifications. PDF coordinates are kept in document space so zooming does not change object coordinates.

Export starts from the original PDF bytes. Existing-text changes go through PyMuPDF when the local engine is available. Newly created objects are then added with pdf-lib. The original document is never rasterized as an editing strategy.

## Fidelity roadmap

1. True PDF annotations.
2. True redaction UI with validation.
3. Page reorder/insert/delete/rotate/crop.
4. OCR for scanned PDFs using OCRmyPDF/Tesseract through the optional local service.
5. Font embedding/substitution diagnostics and more font-format coverage.
6. Large-document virtualization and worker-based rendering.
7. Automated visual regression and PDF round-trip suites.

## Important design rule

Never convert the whole PDF into an image to implement editing. Preserve the original PDF content and apply structured modifications whenever possible.
