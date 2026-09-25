# PDF Editor privacy model

The editor is designed around local document processing.

## Document handling
PDF content should remain local unless a feature explicitly requires a remote service.

## Editing
Existing text can be processed through the local PyMuPDF engine. Export starts from the original PDF bytes rather than requiring a server-stored copy.

## User expectations
Do not add automatic document persistence or uploads without making the behavior explicit in the product.

## Release checks
Verify that sample PDFs are not written to persistent application storage and that local export continues to work offline.
