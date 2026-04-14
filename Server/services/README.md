# Server Services

This directory contains utility services and orchestrators used by the FastAPI backend to handle complex operations that don't belong strictly in route handlers or database models.

## Structure

*   `qr_service.py`: Provides the core logic for generating QR codes (both raw PNG bytes and Base64-encoded PNG data URIs) that point to the frontend asset scanning URL.
*   `qr_label_pdf_service.py`: Uses `reportlab` to build print-ready, formatted A4 PDFs of QR labels for multiple assets. It handles dynamic text resizing, bounding boxes, and multi-page layouts.
*   `notifications/`: The email notification orchestrator responsible for dispatching domain events out to the Email Microservice (e.g., when an asset is assigned/returned or a user is created). See the `notifications/` directory for its own detailed `README.md`.

## Principles

*   **Statelessness**: Service classes and modules remain mostly stateless, relying on the central configuration defined in `core.settings`.
*   **Separation of Concerns**: Heavy dependency-laden operations (like PDF generation or external HTTP calls) are isolated in this directory to keep the FastAPI route handlers thin.
