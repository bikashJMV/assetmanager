from fastapi import APIRouter, Depends
from core.deps import get_db

router = APIRouter(prefix="/health", tags=["System"])

@router.get("")
def health_check(db=Depends(get_db)):
    """
    Health check endpoint.
    Verifies API is running and Supabase connectivity.
    """
    status = {"api": "running", "database": "unknown"}
    try:
        # Simple query to check DB connection
        db.table("assets").select("*", count="exact").limit(1).execute()
        status["database"] = "connected"
    except Exception:
        status["database"] = "error: connection failed"
    
    return status
