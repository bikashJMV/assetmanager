from supabase import create_client, Client
from .settings import settings

# Initialize Supabase Client
supabase: Client = create_client(settings.VITE_SUPABASE_URL, settings.VITE_SUPABASE_KEY)
