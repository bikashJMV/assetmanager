import sys
import traceback
from services.qr_label_pdf_service import qr_label_pdf_service

try:
    pdf_bytes = qr_label_pdf_service.build_pdf(["TEST-1234"])
    print(f"Success! PDF bytes length: {len(pdf_bytes)}")
except Exception as e:
    print("Error occurred!")
    traceback.print_exc()
