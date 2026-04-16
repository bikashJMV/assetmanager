# Server Services

This directory contains utility services and orchestrators used by the FastAPI backend to handle complex operations that don't belong strictly in route handlers or database models.

## Structure

*   [`qr_service.py`](./qr_service.py) — QR PNG bytes and Base64 data URIs for asset scan URLs.
*   [`qr_label_pdf_service.py`](./qr_label_pdf_service.py) — A4 PDF sheets of QR labels (`reportlab`).
*   [`notifications/`](./notifications/) — Email notification orchestration (adapter + orchestrator). See [`notifications/README.md`](./notifications/README.md).

## Principles

*   **Statelessness**: Service classes and modules remain mostly stateless, relying on the central configuration defined in `core.settings`.
*   **Separation of Concerns**: Heavy dependency-laden operations (like PDF generation or external HTTP calls) are isolated in this directory to keep the FastAPI route handlers thin.
