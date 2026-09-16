from __future__ import annotations

import re

import fitz


SUBSET_RE = re.compile(r"^[A-Z]{6}\+")


def _normalise_font_name(name: str) -> str:
    return SUBSET_RE.sub("", (name or "")).lower()


def _font_alias(page: fitz.Page, doc: fitz.Document, requested: str) -> str:
    """Register the source PDF font when its embedded program can be extracted.

    PDF font names often contain subset prefixes and are not valid browser or
    system font identifiers. Reusing the embedded font program gives replacement
    text much closer glyph metrics and appearance than substituting Helvetica.
    """
    wanted = _normalise_font_name(requested)
    if not wanted:
        return "helv"

    try:
        for item in page.get_fonts(full=True):
            xref = int(item[0])
            basefont = str(item[3] or "")
            resource_name = str(item[4] or "")
            candidates = {_normalise_font_name(basefont), _normalise_font_name(resource_name)}
            if wanted not in candidates and not any(wanted in c or c in wanted for c in candidates if c):
                continue
            extracted = doc.extract_font(xref)
            if not extracted or len(extracted) < 4:
                continue
            _, ext, _, font_buffer = extracted
            if not font_buffer:
                continue
            alias = f"pdfedit_{xref}"
            page.insert_font(fontname=alias, fontbuffer=font_buffer, set_simple=False)
            return alias
    except Exception:
        pass

    n = wanted
    if "courier" in n or "mono" in n:
        return "cour"
    if "times" in n or "serif" in n or "roman" in n:
        return "tiro"
    return "helv"


def _rgb(value: int) -> tuple[float, float, float]:
    value = int(value) & 0xFFFFFF
    return ((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255)


def _insert_fitted(page: fitz.Page, rect: fitz.Rect, text: str, fontname: str, size: float, color: tuple[float, float, float]) -> None:
    if not text:
        return
    fontsize = max(1.0, float(size))
    last_result = None
    while fontsize >= 5.0:
        last_result = page.insert_textbox(
            rect,
            text,
            fontname=fontname,
            fontsize=fontsize,
            color=color,
            align=fitz.TEXT_ALIGN_LEFT,
            overlay=True,
        )
        if last_result >= 0:
            return
        fontsize *= 0.92
    raise ValueError("Replacement text does not fit inside the selected PDF text box")


def replace_text_spans(data: bytes, edits: list[dict]) -> bytes:
    """Apply multiple source-span replacements in one PyMuPDF document pass.

    Each edit contains pageIndex, sourceBBox, targetBBox, text, font, size and
    color. The source rectangle is removed as actual PDF content; replacement
    text is then inserted as vector/text content. Unmodified PDF objects are
    preserved and the document is never rasterized.
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
            font_aliases: dict[str, str] = {}
            for edit in page_edits:
                source_rect: fitz.Rect = edit["sourceRect"]
                page.add_redact_annot(source_rect, fill=(1, 1, 1))
            page.apply_redactions()

            for edit in page_edits:
                font_name = str(edit.get("font") or "")
                if font_name not in font_aliases:
                    font_aliases[font_name] = _font_alias(page, doc, font_name)
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
