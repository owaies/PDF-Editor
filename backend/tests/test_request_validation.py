import pytest
from pydantic import ValidationError

from backend.app.main import PageRotation, RedactionRequest, TextReplacementRequest


def test_page_rotation_requires_quarter_turn_increments():
    with pytest.raises(ValidationError):
        PageRotation(pageIndex=0, delta=45)


def test_redaction_requires_four_coordinates_per_rectangle():
    with pytest.raises(ValidationError):
        RedactionRequest(pageIndex=0, rects=[[1.0, 2.0, 3.0]])


def test_redaction_rejects_non_finite_coordinates():
    with pytest.raises(ValidationError):
        RedactionRequest(pageIndex=0, rects=[[0.0, 0.0, float("nan"), 10.0]])


def test_text_replacement_rejects_non_finite_bounding_boxes():
    with pytest.raises(ValidationError):
        TextReplacementRequest(
            pageIndex=0,
            bbox=[0.0, 0.0, 100.0, float("inf")],
            text="replacement",
        )
