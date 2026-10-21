import pytest
from pydantic import ValidationError

from app.main import RedactionRequest, TextReplacementEdit, TextReplacementRequest


@pytest.mark.parametrize(
    "rect",
    [
        [10, 10, 0, 20],
        [0, 0, 10, 0],
        [0, 10, 10, 0],
    ],
)
def test_redaction_rejects_rectangles_without_positive_area(rect):
    with pytest.raises(ValidationError):
        RedactionRequest(pageIndex=0, rects=[rect])


@pytest.mark.parametrize("rect", [[10, 10, 0, 20], [0, 0, 10, 0]])
def test_single_text_replacement_rejects_degenerate_bbox(rect):
    with pytest.raises(ValidationError):
        TextReplacementRequest(pageIndex=0, bbox=rect, text="replacement")


@pytest.mark.parametrize("field", ["sourceBBox", "targetBBox"])
def test_batch_text_replacement_rejects_degenerate_bboxes(field):
    payload = {
        "pageIndex": 0,
        "sourceBBox": [0, 0, 10, 10],
        "targetBBox": [0, 0, 10, 10],
        "text": "replacement",
    }
    payload[field] = [10, 10, 0, 20]
    with pytest.raises(ValidationError):
        TextReplacementEdit(**payload)
