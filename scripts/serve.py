#!/usr/bin/env python3
"""Local static preview with HTTP byte ranges for audio seeking; no dependencies."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    base_path = ""

    def send_head(self):
        self.byte_range = None
        request_path = unquote(urlsplit(self.path).path)
        prefix = self.base_path
        if prefix:
            if request_path == prefix:
                self.send_response(301)
                self.send_header("Location", prefix + "/")
                self.end_headers()
                return None
            if not request_path.startswith(prefix + "/"):
                self.send_error(404)
                return None
            request_path = request_path[len(prefix):]
        path = (ROOT / request_path.lstrip("/")).resolve()
        if not path.is_relative_to(ROOT) or any(part.startswith(".") for part in path.relative_to(ROOT).parts):
            self.send_error(404)
            return None
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            self.send_error(404)
            return None
        stream = path.open("rb")
        size = path.stat().st_size
        start, end = 0, size - 1
        requested_range = self.headers.get("Range")
        if requested_range:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested_range.strip())
            if match and (match[1] or match[2]):
                if match[1]:
                    start = int(match[1])
                    end = min(int(match[2]), size - 1) if match[2] else size - 1
                else:
                    start = max(0, size - int(match[2]))
            if not match or not (match[1] or match[2]) or not 0 <= start <= end < size:
                stream.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            self.byte_range = (start, end)
        self.send_response(206 if self.byte_range else 200)
        self.send_header("Content-Type", self.guess_type(str(path)))
        if path.suffix in {".html", ".js", ".json", ".css"}:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(max(0, end - start + 1)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        if self.byte_range:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return stream

    def copyfile(self, source, outputfile):
        start, end = self.byte_range or (0, source.seek(0, 2) - 1)
        source.seek(start)
        remaining = end - start + 1
        try:
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Switching a player intentionally cancels its in-flight download.


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--base-path", default="", help="e.g. /MEGA to simulate a GitHub project URL")
    args = parser.parse_args()
    PreviewHandler.base_path = "/" + args.base_path.strip("/") if args.base_path.strip("/") else ""
    server = ThreadingHTTPServer((args.bind, args.port), PreviewHandler)
    print(f"MEGA preview: http://{args.bind}:{args.port}{PreviewHandler.base_path}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
