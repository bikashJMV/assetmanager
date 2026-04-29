# Multi-stage Python build for FastAPI Server

# Stage 1: Builder
FROM python:3.12-slim AS builder

WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install dependencies to a virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Set PATH to use venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy application code
COPY main.py .
COPY app.py .
COPY routers/ ./routers/
COPY repositories/ ./repositories/
COPY schemas/ ./schemas/
COPY services/ ./services/
COPY core/ ./core/
COPY auth/ ./auth/
COPY db/ ./db/
COPY scripts/ ./scripts/

# Expose port
EXPOSE 8000

# Health check (python:slim has no curl; use stdlib)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=5)" || exit 1

# Entrypoint
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
