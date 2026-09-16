from __future__ import annotations

import re

import fitz


SUBSET_RE = re.compile(r"^[A-Z]{6}\+")


def _normalise_font_name(name: str) -> str:
    return SUBSET_RE.sub("", (name or "")).lower()


def _capture_font_buffers(page: fitz.Page, doc: fitz.Document) -> dict[str, bytes]:
    """Capture embedded font programs before source text is redacted."""
    captured: dict[str, bytes] = {}
    try:
        for item in page.get_fonts(full=True):
            xref = int(item[0])
            basefont = str(item[3] or "")
            resource_name = str(item[4] or "")
            try:
                extracted = doc.extract_font(xref)
            except Exception:
                continue
            if not extracted or len(extracted) < 4 or not extracted[3]:
                continue
            font_buffer = extracted[3]
            for name in (basefont, resource_name):
                key = _normalise_font_name(name)
                if key:
                    captured[key] = font_buffer
    except Exception:
        pass
    return captured


def _font_alias(page: fitz.Page, requested: str, captured: dict[str, bytes]) -> str:
    """Register the captured source font, falling back to a close PDF built-in."""
    wanted = _normalise_font_name(requested)
    if not wanted:
        return "helv"

    font_buffer = captured.get(wanted)
    if font_buffer is None:
        for key, buffer in captured.items():
            if wanted in key or key in wanted:
                font_buffer = buffer
                break
    if font_buffer:
        try:
            alias = "pdfedit_" + str(abs(hash(wanted)))[:10]
            page.insert_font(fontname=alias, fontbuffer=font_buffer, set_simple=False)
            return alias
        except Exception:
            pass

    if "courier" in wanted or "mono" in wanted:
        return "cour"
    if "times" in wanted or "serif" in wanted or "roman" in wanted:
        return "tiro"
    return "helv"


def _rgb(value: int) -> tuple[float, float, float]:
    value = int(value) & 0xFFFFFF
    return ((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255)


def _insert_fitted(page: fitz.Page, rect: fitz.Rect, text: str, fontname: str, size: float, color: tuple[float, float, float]) -> None:
    if not text:
        return
    fontsize = max(1.0, float(size))
    while fontsize >= 5.0:
        result = page.insert_textbox(
            rect,
            text,
            fontname=fontname,
            fontsize=fontsize,
            color=color,
            align=fitz.TEXT_ALIGN_LEFT,
            overlay=True,
        )
        if result >= 0:
            return
        fontsize *= 0.92
    raise ValueError("Replacement text does not fit inside the selected PDF text box")


def replace_text_spans(data: bytes, edits: list[dict]) -> bytes:
    """Apply multiple source-span replacements without rasterizing the PDF.

    Only the source text is removed. Existing images and vector graphics are kept,
    so a replacement does not unnecessarily turn a page into a white rectangle.
    The source and target rectangles may differ, allowing an existing text object
    to be moved or resized before export.
    """
    if not edits:
        return data

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        grouped: dict[int, list[dict]] = {}
        for edit in edits:
            page_index = int(edit.get("pageIndex", -1))
            source = edit.get("sourceBBox") or edit.get("bbox")
            target = edit.get("targetBBox") or source
            if not 0 <= page_index < len(doc):
                raise ValueError("Page index out of range")
            if not isinstance(source, list) or len(source) != 4 or not isinstance(target, list) or len(target) != 4:
                raise ValueError("Text replacement rectangles must contain four coordinates")
            source_rect = fitz.Rect(*map(float, source))
            target_rect = fitz.Rect(*map(float, target))
            if source_rect.is_empty or target_rect.is_empty or source_rect.width <= 0 or source_rect.height <= 0:
                raise ValueError("Invalid text replacement rectangle")
            grouped.setdefault(page_index, []).append({**edit, "sourceRect": source_rect, "targetRect": target_rect})

        for page_index, page_edits in grouped.items():
            page = doc[page_index]
            captured_fonts = _capture_font_buffers(page, doc)
            font_aliases: dict[str, str] = {}

            # Transparent redaction removes overlapping text while preserving
            # underlying page graphics/images. The replacement is drawn afterwards.
            for edit in page_edits:
                page.add_redact_annot(edit["sourceRect"], fill=None)
            page.apply_redactions(images=0, graphics=0, text=0)

            for edit in page_edits:
                font_name = str(edit.get("font") or "")
                if font_name not in font_aliases:
                    font_aliases[font_name] = _font_alias(page, font_name, captured_fonts)
                _insert_fitted(
                    page,
                    edit["targetRect"],
                    str(edit.get("text") or ""),
                    font_aliases[font_name],
                    float(edit.get("size") or 11),
                    _rgb(int(edit.get("color") or 0)),
                )

        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()
