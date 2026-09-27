# PDF API limits

The local PDF API accepts PDF uploads for inspection and editing.

## Current limit
Requests are rejected above the documented 100 MB PDF editing limit.

## Validation
The service checks the filename extension and PDF header before processing.

## Regression
Test the smallest valid PDF, a malformed file, a non-PDF renamed file, and a payload just above the size limit.

## Client behavior
Surface the server's validation message without hiding the actual failure behind a generic success state.
