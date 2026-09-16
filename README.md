# PDF Editor

A free, privacy-first PDF editor built with React, TypeScript, PDF.js and pdf-lib.

## Current foundation

- Local PDF opening and rendering with PDF.js
- High-DPI page rendering
- Page thumbnails and page navigation
- Zoom from 25% to 400%
- Search across PDF text
- Document-space coordinates independent of zoom
- Add text overlays
- Add highlights
- Add vector rectangles
- Insert image support in the object model
- Drag, resize and rotate editable objects
- Exact numeric properties panel
- Undo/redo history
- Keyboard shortcuts
- Local PDF export using pdf-lib
- Light/dark UI
- No account and no automatic document upload

## Run locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Architecture

The viewer uses PDF.js for rendering and a separate editor object layer for user modifications. PDF coordinates are kept in document space so zooming does not change object coordinates.

Export uses pdf-lib and starts from the original PDF bytes. User-created objects are written into the PDF instead of rasterizing the entire document.

## Fidelity roadmap

The next engineering stages are:

1. Robust original-object/text-span inspection.
2. Existing text replacement with font and encoding preservation.
3. True PDF annotations.
4. True PDF redaction and redaction validation.
5. Page reorder/insert/delete/rotate/crop.
6. OCR for scanned PDFs using OCRmyPDF/Tesseract through an optional FastAPI service.
7. Font embedding/substitution diagnostics.
8. Large-document virtualization and worker-based rendering.
9. Automated PDF round-trip and visual regression tests.

## Important design rule

Never convert the whole PDF into an image to implement editing. Preserve the original PDF content and apply structured modifications whenever possible.
