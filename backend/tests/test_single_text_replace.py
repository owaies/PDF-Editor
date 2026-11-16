import fitz
import pytest

from app.pdf_service import replace_text_span


def _source_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=320, height=220)
    page.insert_text((30, 90), "Original text", fontsize=18)
    data = document.tobytes()
    document.close()
    return data


def test_single_span_replacement_reduces_font_size_when_needed():
    output = replace_text_span(
        _source_pdf(),
        0,
        [20, 40, 250, 110],
        "A longer replacement sentence that needs more room than the original text.",
        font="Helvetica",
        size=24,
        color=0,
    )

    document = fitz.open(stream=output, filetype="pdf")
    try:
        assert "A longer replacement sentence" in document[0].get_text()
        spans = [
            span
            for block in document[0].get_text("dict")["blocks"]
            if block.get("type") == 0
            for line in block.get("lines", [])
            for span in line.get("spans", [])
        ]
        assert spans
        assert max(span["size"] for span in spans) < 24
    finally:
        document.close()


def test_single_span_replacement_rejects_text_that_cannot_fit():
    with pytest.raises(ValueError, match="does not fit"):
        replace_text_span(
            _source_pdf(),
            0,
            [20, 40, 35, 45],
            "A" * 5000,
            font="Helvetica",
            size=11,
            color=0,
        )
