import math

import pytest
from pydantic import ValidationError

from app.main import RedactionRequest, TextReplacementEdit, TextReplacementRequest


@pytest.mark.parametrize("invalid_coordinate", [math.nan, math.inf, -math.inf])
def test_redaction_rejects_non_finite_coordinates(invalid_coordinate):
    with pytest.raises(ValidationError):
        RedactionRequest(pageIndex=0, rects=[[0, 0, invalid_coordinate, 10]])


@pytest.mark.parametrize("invalid_coordinate", [math.nan, math.inf, -math.inf])
def test_text_replacement_rejects_non_finite_bbox_coordinates(invalid_coordinate):
    with pytest.raises(ValidationError):
        TextReplacementRequest(
            pageIndex=0,
            bbox=[10, 10, 100, invalid_coordinate],
            text="Updated",
        )


@pytest.mark.parametrize("invalid_coordinate", [math.nan, math.inf, -math.inf])
def test_batch_text_replacement_rejects_non_finite_bbox_coordinates(invalid_coordinate):
    with pytest.raises(ValidationError):
        TextReplacementEdit(
            pageIndex=0,
            sourceBBox=[10, 10, invalid_coordinate, 100],
            text="Updated",
        )
