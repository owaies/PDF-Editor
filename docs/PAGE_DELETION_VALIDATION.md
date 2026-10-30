# PDF page deletion validation

The page-deletion API accepts between 1 and 200 non-negative page indexes.
Indexes are checked against the uploaded PDF before any page is removed. An
out-of-range index returns HTTP 400 instead of being silently ignored. Repeated
valid indexes are deduplicated so a page is removed only once.

Run the focused checks from the backend directory:

```bash
pytest tests/test_request_validation.py tests/test_page_deletion_validation.py
```

Verify negative indexes, indexes equal to the document page count, duplicate
valid indexes, and a normal deletion that leaves the expected pages intact.
