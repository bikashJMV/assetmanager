import os
import sys


def main() -> int:
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from main import create_app

    app = create_app()
    paths = {r.path for r in app.routes}
    required = "/api/v1/assignments/assign"
    if required not in paths:
        print(f"FAIL: missing route {required}")
        return 1

    print(f"OK: route registered {required}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
