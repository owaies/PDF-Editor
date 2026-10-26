from fastapi.testclient import TestClient

from backend.app.main import app


def test_pdf_processing_errors_do_not_leak_internal_exception_details(monkeypatch):
    def fail_with_private_detail(_data):
        raise RuntimeError("private filesystem path")

    monkeypatch.setattr("backend.app.main.extract_text_spans", fail_with_private_detail)
    client = TestClient(app)
    response = client.post(
        "/api/pdf/text-spans",
        files={"file": ("sample.pdf", b"%PDF-1.4\n", "application/pdf")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Could not inspect PDF text."
    assert "private filesystem path" not in response.text
