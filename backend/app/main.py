import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, field_validator
import math
from .pdf_service import extract_text_spans, remove_pages, rotate_page, redact_page, replace_text_span
from .text_replace import replace_text_spans

app = FastAPI(title="PDF Editor API", version="0.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

class PageRotation(BaseModel):
    pageIndex: int = Field(ge=0)
    delta: int = Field(default=90, ge=-360, le=360, multiple_of=90)

class RedactionRequest(BaseModel):
    pageIndex: int = Field(ge=0)
    rects: list[list[float]] = Field(min_length=1, max_length=200)

    @field_validator("rects")
    @classmethod
    def validate_rects(cls, value):
        if any(len(rect) != 4 for rect in value):
            raise ValueError("Each redaction rectangle must contain exactly four coordinates")
        if any(not all(math.isfinite(float(coord)) for coord in rect) for rect in value):
            raise ValueError("Redaction coordinates must be finite numbers")
        return value

class DeletePagesRequest(BaseModel):
    pageIndexes: list[int] = Field(min_length=1, max_length=200)

class TextReplacementRequest(BaseModel):
    pageIndex: int = Field(ge=0)
    bbox: list[float] = Field(min_length=4, max_length=4)
    text: str = Field(max_length=5000)
    font: str = Field(default="", max_length=200)
    size: float = Field(default=11, gt=0, le=200)
    color: int = Field(default=0, ge=0, le=0xFFFFFF)

class TextReplacementEdit(BaseModel):
    pageIndex: int = Field(ge=0)
    sourceBBox: list[float] = Field(min_length=4, max_length=4)
    targetBBox: list[float] | None = Field(default=None, min_length=4, max_length=4)
    text: str = Field(default="", max_length=5000)
    font: str = Field(default="", max_length=200)
    size: float = Field(default=11, gt=0, le=200)
    color: int = Field(default=0, ge=0, le=0xFFFFFF)

class BatchTextReplacementRequest(BaseModel):
    edits: list[TextReplacementEdit] = Field(min_length=1, max_length=200)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "pdf-editor", "version": "0.4.0"}

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
        out = replace_text_span(data, parsed.pageIndex, parsed.bbox, parsed.text, parsed.font, parsed.size, parsed.color)
        return Response(out, media_type="application/pdf")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(422, f"Could not replace text: {exc}")

@app.post("/api/pdf/replace-text-spans")
async def replace_text_batch(request: str = Form(...), file: UploadFile = File(...)):
    data = await read_pdf(file)
    parsed = parse_request(request, BatchTextReplacementRequest)
    try:
        edits = [edit.model_dump() for edit in parsed.edits]
        for edit in edits:
            if edit.get("targetBBox") is None:
                edit["targetBBox"] = edit["sourceBBox"]
        out = replace_text_spans(data, edits)
        return Response(out, media_type="application/pdf")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(422, f"Could not replace PDF text spans: {exc}")
