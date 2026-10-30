import math

import pytest
from pydantic import ValidationError

from app.main import (
    DeletePagesRequest,
    PageRotation,
    RedactionRequest,
    TextReplacementEdit,
    TextReplacementRequest,
)


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


@pytest.mark.parametrize("invalid_coordinate", [math.nan, math.inf, -math.inf])
def test_redaction_rejects_all_non_finite_coordinates(invalid_coordinate):
    with pytest.raises(ValidationError):
        RedactionRequest(pageIndex=0, rects=[[0, 0, invalid_coordinate, 10]])


@pytest.mark.parametrize("invalid_coordinate", [math.nan, math.inf, -math.inf])
def test_text_replacement_rejects_all_non_finite_bbox_coordinates(invalid_coordinate):
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

@pytest.mark.parametrize("indexes", [[-1], [0, -1]])
def test_page_deletion_rejects_negative_indexes(indexes):
    with pytest.raises(ValidationError):
        DeletePagesRequest(pageIndexes=indexes)
\n