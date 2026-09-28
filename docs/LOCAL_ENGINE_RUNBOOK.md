# PDF Local Engine Runbook

High-fidelity existing-text editing uses the optional local Python engine under backend/.

## Setup

Create a Python virtual environment, install backend requirements, and start the FastAPI service with uvicorn. The frontend can be pointed to another backend address through VITE_PDF_API_URL.

## Verification

Use the backend tests for text-replacement behavior, then exercise a real PDF through text-span extraction and existing-text replacement. Confirm the resulting PDF opens successfully and preserves unrelated page graphics and images.

Keep the local engine optional so the browser editor can still provide its local PDF workflows without a persistent backend account or document store.
