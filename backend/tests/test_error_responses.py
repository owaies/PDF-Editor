import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from app.main import text_spans


def test_pdf_processing_errors_do_not_leak_internal_exception_details(monkeypatch):
    def fail_with_private_detail(_data):
        raise RuntimeError("private filesystem path")

    monkeypatch.setattr("app.main.extract_text_spans", fail_with_private_detail)
    upload = UploadFile(filename="sample.pdf", file=BytesIO(b"%PDF-1.4\n"))

    with pytest.raises(HTTPException) as raised:
        asyncio.run(text_spans(upload))

    assert raised.value.status_code == 422
    assert raised.value.detail == "Could not inspect PDF text."
    assert "private filesystem path" not in raised.value.detail
