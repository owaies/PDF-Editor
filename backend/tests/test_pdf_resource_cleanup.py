import fitz
import pytest

from app import pdf_service


def _one_page_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Resource cleanup")
    data = document.tobytes()
    document.close()
    return data


@pytest.mark.parametrize(
    ("operation", "arguments"),
    [
        ("remove_pages", ([1],)),
        ("rotate_page", (1, 90)),
        ("redact_page", (1, [[0, 0, 20, 20]],)),
        ("replace_text_span", (1, [0, 0, 20, 20], "replacement")),
    ],
)
def test_invalid_page_operations_close_the_document(monkeypatch, operation, arguments):
    document = fitz.open(stream=_one_page_pdf(), filetype="pdf")
    monkeypatch.setattr(pdf_service, "open_pdf", lambda _data: document)

    with pytest.raises(ValueError, match="Page index out of range"):
        getattr(pdf_service, operation)(b"unused", *arguments)

    assert document.is_closed


def test_text_extraction_closes_the_document_after_success(monkeypatch):
    document = fitz.open(stream=_one_page_pdf(), filetype="pdf")
    monkeypatch.setattr(pdf_service, "open_pdf", lambda _data: document)

    spans = pdf_service.extract_text_spans(b"unused")

    assert any(span["text"] == "Resource cleanup" for span in spans)
    assert document.is_closed
