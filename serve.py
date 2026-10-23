"""Serves the app on http://localhost:8130 and tells the browser never to cache.

Python's plain http.server lets the browser keep old CSS and JS, so a reload can mix old and new
files. Usage: python3 serve.py [port]
"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8130
handler = functools.partial(NoCacheHandler, directory=Path(__file__).parent)
print(f"Serving Class Check-in at http://localhost:{port} (Ctrl+C to stop)")
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
