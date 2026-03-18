import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://192.168.1.X:3000")

if not SUPABASE_URL or not SUPABASE_KEY:
    # Not raising an exception here to allow the app to boot up for testing without crashing,
    # but actual DB calls will fail if not set.
    print("WARNING: SUPABASE_URL or SUPABASE_KEY is missing in .env")

# Supabase Client Initialization
supabase: Client = create_client(SUPABASE_URL or "http://localhost", SUPABASE_KEY or "anon-key")
