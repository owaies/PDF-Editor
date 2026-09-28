# PDF Editor Data Flow

The browser remains the primary editor surface. PDF.js renders source pages, while the editor maintains document-space coordinates for user-created and modified objects.

## Export path

The application keeps the original PDF bytes as the source document. Existing text edits are sent to the local PyMuPDF engine, while newly created objects are added through the browser export layer.

This separation prevents zoom from changing saved coordinates and avoids turning the full document into a raster image as the normal editing strategy.

## Review boundary

When changing geometry or export behavior, test both on-screen placement and exported PDF placement at multiple zoom levels.
