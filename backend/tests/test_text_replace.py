import fitz

from app.text_replace import replace_text_spans


def _first_text_span(doc: fitz.Document):
    page = doc[0]
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span.get("text"):
                    return span
    raise AssertionError("No text span was created")


def test_replace_text_span_preserves_page_and_text_layer():
    source = fitz.open()
    page = source.new_page(width=400, height=300)
    page.insert_text((72, 100), "Hello PDF", fontsize=18, fontname="helv", color=(0.1, 0.2, 0.3))
    source_bytes = source.tobytes()
    span = _first_text_span(source)
    source.close()

    result = replace_text_spans(source_bytes, [{
        "pageIndex": 0,
        "sourceBBox": list(span["bbox"]),
        "targetBBox": [72, 75, 240, 110],
        "text": "Edited PDF",
        "font": span.get("font", "Helvetica"),
        "size": span.get("size", 18),
        "color": span.get("color", 0),
    }])

    edited = fitz.open(stream=result, filetype="pdf")
    assert len(edited) == 1
    text = edited[0].get_text()
    assert "Edited PDF" in text
    assert "Hello PDF" not in text
    assert edited[0].get_text("dict")["blocks"]
    edited.close()
