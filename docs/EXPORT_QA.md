# PDF export regression plan

Test the editor across these operations:

- Open and render a multi-page PDF.
- Zoom and navigate without changing document-space coordinates.
- Add text, highlights, rectangles, and images.
- Move, resize, rotate, then undo and redo edits.
- Replace existing text and verify it remains selectable when the source PDF supports it.
- Export and reopen the result in an independent PDF viewer.

For text replacement, test short replacements, longer text that needs fitting, and PDFs with embedded fonts.
