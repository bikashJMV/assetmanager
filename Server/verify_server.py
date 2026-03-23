from fastapi.testclient import TestClient
import sys
import os

# Ensure project root is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from main import app
    client = TestClient(app)
    print("--- API Startup Check ---")
    
    # 1. Health Check
    print("Testing /health...")
    response = client.get("/health")
    print(f"Status: {response.status_code}, Body: {response.json()}")
    
    # 2. Root Check
    print("Testing / ...")
    response = client.get("/")
    print(f"Status: {response.status_code}, Body: {response.json()}")
    
    # 3. Assets Check (Mock search)
    print("Testing /assets search sanitization...")
    response = client.get("/assets?search=Dell, (test)")
    print(f"Status: {response.status_code}, Search result count: {len(response.json())}")
    
    # 4. Error Handling (404 Check)
    print("Testing 404 behavior...")
    response = client.get("/assets/NON_EXISTENT_ID")
    print(f"Status: {response.status_code}, Detail: {response.json().get('detail')}")
    if response.status_code == 404:
        print("PASS: 404 stays 404")
    else:
        print(f"FAIL: Expected 404, got {response.status_code}")

except Exception as e:
    print(f"Runtime Verification FAILED: {str(e)}")
    import traceback
    traceback.print_exc()
