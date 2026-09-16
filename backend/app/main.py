import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from .pdf_service import extract_text_spans, remove_pages, rotate_page, redact_page, replace_text_span

app = FastAPI(title="PDF Editor API", version="0.3.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class PageRotation(BaseModel):
    pageIndex: int
    delta: int = 90

class RedactionRequest(BaseModel):
    pageIndex: int
    rects: list[list[float]]

class DeletePagesRequest(BaseModel):
    pageIndexes: list[int]

class TextReplacementRequest(BaseModel):
    pageIndex: int
    bbox: list[float]
    text: str
    font: str = ""
    size: float = 11
    color: int = 0

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "pdf-editor", "version": "0.3.1"}

async def read_pdf(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF file")
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Invalid PDF file")
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "PDF is larger than the 100 MB local editing limit")
    return data

def parse_request(raw: str, model: type[BaseModel]) -> BaseModel:
    try:
        return model.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(400, f"Invalid request: {exc}") from exc

@app.post("/api/pdf/text-spans")
async def text_spans(file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        return {"spans": extract_text_spans(data)}
    except Exception as exc:
        raise HTTPException(422, f"Could not inspect PDF text: {exc}")

@app.post("/api/pdf/delete-pages")
async def delete_pages(request: str = Form(...), file: UploadFile = File(...)):
    data = await read_pdf(file)
    parsed = parse_request(request, DeletePagesRequest)
    try:
        out = remove_pages(data, parsed.pageIndexes)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not delete pages: {exc}")

@app.post("/api/pdf/rotate-page")
async def rotate(request: str = Form(...), file: UploadFile = File(...)):
    data = await read_pdf(file)
    parsed = parse_request(request, PageRotation)
    try:
        out = rotate_page(data, parsed.pageIndex, parsed.delta)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not rotate page: {exc}")

@app.post("/api/pdf/redact")
async def redact(request: str = Form(...), file: UploadFile = File(...)):
    data = await read_pdf(file)
    parsed = parse_request(request, RedactionRequest)
    try:
        out = redact_page(data, parsed.pageIndex, parsed.rects)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not apply redaction: {exc}")

@app.post("/api/pdf/replace-text")
async def replace_text(request: str = Form(...), file: UploadFile = File(...)):
    data = await read_pdf(file)
    parsed = parse_request(request, TextReplacementRequest)
    try:
        out = replace_text_span(
            data,
            parsed.pageIndex,
            parsed.bbox,
            parsed.text,
            parsed.font,
            parsed.size,
            parsed.color,
        )
        return Response(out, media_type="application/pdf")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(422, f"Could not replace text: {exc}")
