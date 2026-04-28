try:
    import fastapi
    import dotenv
    import pydantic
    import qrcode
    print("All third-party libraries imported successfully")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"An error occurred: {e}")
