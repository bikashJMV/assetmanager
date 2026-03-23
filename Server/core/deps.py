from core.supabase import supabase

def get_db():
    """
    Dependency to provide the Supabase client.
    Can be used for easier testing/mocking.
    """
    return supabase
