from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from .pdf_service import extract_text_spans, remove_pages, rotate_page, redact_page, replace_text_span

app = FastAPI(title="PDF Editor API", version="0.3.0")
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
    return {"status": "ok", "service": "pdf-editor", "version": "0.3.0"}

async def read_pdf(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF file")
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Invalid PDF file")
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "PDF is larger than the 100 MB local editing limit")
    return data

@app.post("/api/pdf/text-spans")
async def text_spans(file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        return {"spans": extract_text_spans(data)}
    except Exception as exc:
        raise HTTPException(422, f"Could not inspect PDF text: {exc}")

@app.post("/api/pdf/delete-pages")
async def delete_pages(request: DeletePagesRequest, file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        out = remove_pages(data, request.pageIndexes)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not delete pages: {exc}")

@app.post("/api/pdf/rotate-page")
async def rotate(request: PageRotation, file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        out = rotate_page(data, request.pageIndex, request.delta)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not rotate page: {exc}")

@app.post("/api/pdf/redact")
async def redact(request: RedactionRequest, file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        out = redact_page(data, request.pageIndex, request.rects)
        return Response(out, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(422, f"Could not apply redaction: {exc}")

@app.post("/api/pdf/replace-text")
async def replace_text(request: TextReplacementRequest, file: UploadFile = File(...)):
    data = await read_pdf(file)
    try:
        out = replace_text_span(
            data,
            request.pageIndex,
            request.bbox,
            request.text,
            request.font,
            request.size,
            request.color,
        )
        return Response(out, media_type="application/pdf")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(422, f"Could not replace text: {exc}")
