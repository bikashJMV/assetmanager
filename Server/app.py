from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import base64
import io
import qrcode
from Config.db import supabase, FRONTEND_URL
from models import AssetLogCreate

app = FastAPI(title="Asset Management System API - Demo")

# CORS setup (allow all for demo simplicity)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "AMS API is running"}

def generate_qr_base64(asset_id: str) -> str:
    qr_url = f"{FRONTEND_URL}/scan/{asset_id}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"

@app.get("/assets")
def get_assets(search: Optional[str] = Query(None, description="Search term for assets")):
    try:
        query = supabase.table("assets").select("*")
        if search:
            query = query.or_(f"asset_id.ilike.%{search}%,brand.ilike.%{search}%,model.ilike.%{search}%,assigned_to.ilike.%{search}%")
        response = query.execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/assets")
def create_asset(asset: dict):
    try:
        # Insert the asset
        response = supabase.table("assets").insert(asset).execute()
        created = response.data[0]

        # Auto-generate QR and create log entry
        qr_code = generate_qr_base64(created["asset_id"])
        supabase.table("asset_logs").insert({
            "asset_id": created["asset_id"],
            "note": "Auto-generated on asset creation",
            "qr_code": qr_code
        }).execute()

        # Return asset + QR together
        created["qr_code"] = qr_code
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/assets/{asset_id}")
def get_asset(asset_id: str):
    try:
        response = supabase.table("assets").select("*").eq("asset_id", asset_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Asset not found")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/logs/{asset_id}")
def get_logs_for_asset(asset_id: str):
    """Fetch the most recent log (with QR) for a specific asset."""
    try:
        response = supabase.table("asset_logs").select("*").eq("asset_id", asset_id).order("created_at", desc=True).limit(1).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="No log found for this asset")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/scan/{asset_id}")
def scan_asset(asset_id: str):
    # Just a shortcut to get_asset for simplicity as per requirements
    return get_asset(asset_id)

@app.get("/logs")
def get_logs():
    try:
        response = supabase.table("asset_logs").select("*").order("created_at", desc=True).limit(50).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/logs")
def create_log(log_data: AssetLogCreate):
    try:
        # Check if asset exists
        asset_check = supabase.table("assets").select("asset_id").eq("asset_id", log_data.asset_id).execute()
        if not asset_check.data:
            raise HTTPException(status_code=404, detail=f"Asset with id {log_data.asset_id} not found")

        # Generate QR Code directing to the frontend scan page
        qr_url = f"{FRONTEND_URL}/scan/{log_data.asset_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        qr_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        qr_data_uri = f"data:image/png;base64,{qr_base64}"

        # Insert Log
        log_entry = {
            "asset_id": log_data.asset_id,
            "note": log_data.note,
            "qr_code": qr_data_uri
        }
        response = supabase.table("asset_logs").insert(log_entry).execute()
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
