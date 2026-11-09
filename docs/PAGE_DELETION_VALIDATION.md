# PDF page deletion validation

The page-deletion API accepts between 1 and 200 non-negative page indexes.
Indexes are checked against the uploaded PDF before any page is removed. An
out-of-range index returns HTTP 400 instead of being silently ignored. Repeated
valid indexes are deduplicated so a page is removed only once. A request that
would remove every page is rejected with HTTP 400 so the editor never emits an
empty document.

Run the focused checks from the backend directory:

```bash
pytest tests/test_request_validation.py tests/test_page_deletion_validation.py
```

Verify negative indexes, indexes equal to the document page count, duplicate
valid indexes, attempts to delete every page, and a normal deletion that leaves
the expected pages intact.
