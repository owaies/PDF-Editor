import fitz
import pytest

from app.pdf_service import remove_pages


def _two_page_pdf() -> bytes:
    document = fitz.open()
    document.new_page()
    document.new_page()
    data = document.tobytes()
    document.close()
    return data


def test_remove_pages_rejects_out_of_range_indexes():
    with pytest.raises(ValueError, match="Page index out of range"):
        remove_pages(_two_page_pdf(), [2])


def test_remove_pages_deduplicates_valid_indexes():
    output = remove_pages(_two_page_pdf(), [1, 1])
    document = fitz.open(stream=output, filetype="pdf")

    try:
        assert len(document) == 1
    finally:
        document.close()
