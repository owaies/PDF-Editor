import fitz


def open_pdf(data: bytes) -> fitz.Document:
    return fitz.open(stream=data, filetype="pdf")


def extract_text_spans(data: bytes):
    doc = open_pdf(data)
    try:
        result = []
        for page_index, page in enumerate(doc):
            page_dict = page.get_text("dict")
            for block_index, block in enumerate(page_dict.get("blocks", [])):
                if block.get("type") != 0:
                    continue
                for line_index, line in enumerate(block.get("lines", [])):
                    for span_index, span in enumerate(line.get("spans", [])):
                        result.append({
                            "id": f"p{page_index}-b{block_index}-l{line_index}-s{span_index}",
                            "pageIndex": page_index,
                            "text": span.get("text", ""),
                            "bbox": list(span.get("bbox", (0, 0, 0, 0))),
                            "font": span.get("font", ""),
                            "size": span.get("size", 0),
                            "color": span.get("color", 0),
                            "flags": span.get("flags", 0),
                            "origin": list(span.get("origin", (0, 0))),
                        })
        return result
    finally:
        doc.close()


def remove_pages(data: bytes, page_indexes: list[int]) -> bytes:
    doc = open_pdf(data)
    try:
        if any(index < 0 or index >= len(doc) for index in page_indexes):
            raise ValueError("Page index out of range")

        valid = sorted(set(page_indexes), reverse=True)
        if len(valid) >= len(doc):
            raise ValueError("A PDF must retain at least one page")

        for index in valid:
            doc.delete_page(index)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def rotate_page(data: bytes, page_index: int, delta: int) -> bytes:
    doc = open_pdf(data)
    try:
        if not 0 <= page_index < len(doc):
            raise ValueError("Page index out of range")
        page = doc[page_index]
        page.set_rotation((page.rotation + delta) % 360)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def redact_page(data: bytes, page_index: int, rects: list[list[float]]) -> bytes:
    doc = open_pdf(data)
    try:
        if not 0 <= page_index < len(doc):
            raise ValueError("Page index out of range")
        page = doc[page_index]
        for coords in rects:
            if len(coords) != 4:
                continue
            page.add_redact_annot(fitz.Rect(*coords), fill=(1, 1, 1))
        page.apply_redactions()
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def _font_for_name(name: str) -> str:
    """Map common PDF font names to PyMuPDF built-ins when needed."""
    n = (name or "").lower()
    if "courier" in n or "mono" in n:
        return "cour"
    if "times" in n or "serif" in n or "roman" in n:
        return "tiro"
    return "helv"


def _rgb_from_int(value: int) -> tuple[float, float, float]:
    value = int(value) & 0xFFFFFF
    return ((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255)


def replace_text_span(
    data: bytes,
    page_index: int,
    bbox: list[float],
    text: str,
    font: str = "",
    size: float = 11,
    color: int = 0,
) -> bytes:
    """Replace one text span while preserving unrelated page graphics/images."""
    if len(bbox) != 4:
        raise ValueError("bbox must contain four coordinates")
    doc = open_pdf(data)
    try:
        if not 0 <= page_index < len(doc):
            raise ValueError("Page index out of range")
        rect = fitz.Rect(*bbox)
        if rect.is_empty or rect.width <= 0 or rect.height <= 0:
            raise ValueError("Invalid text span rectangle")

        page = doc[page_index]
        page.add_redact_annot(rect, fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)

        if text:
            page.insert_textbox(
                rect,
                text,
                fontname=_font_for_name(font),
                fontsize=max(1, float(size)),
                color=_rgb_from_int(int(color)),
                align=fitz.TEXT_ALIGN_LEFT,
                overlay=True,
            )

        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()
