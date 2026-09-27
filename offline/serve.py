#!/usr/bin/env python3
"""Run chrome-chat against an offline Wikipedia (a Kiwix ZIM file).

    python3 offline/serve.py [--zim PATH] [--kiwix-serve PATH] [--port 8080]

Serves chrome-chat from this repo at http://localhost:8080 and starts Kiwix's
own `kiwix-serve` on 127.0.0.1, proxying it under /kiwix/ -- so the page and
the offline Wikipedia share one origin (no CORS, no mixed content, no Chrome
local-network permission prompt). `/wiki:offline <question>` then reads from
the ZIM instead of wikipedia.org.

Every request is logged with where it went, which is the point of the
exercise: with the model on-device and Wikipedia on disk, a whole
question-and-answer round trip should show nothing but localhost.

Defaults look in ~/Downloads/kiwix/ for the newest .zim and for the
kiwix-tools release unpacked there (download.kiwix.org/release/kiwix-tools/).
"""
import argparse
import glob
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIWIX_DIR = os.path.expanduser('~/Downloads/kiwix')


def newest(pattern):
    hits = sorted(glob.glob(pattern), key=os.path.getmtime)
    return hits[-1] if hits else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--zim', default=newest(os.path.join(KIWIX_DIR, 'wikipedia_*_mini_*.zim')) or newest(os.path.join(KIWIX_DIR, '*.zim')))
    ap.add_argument('--kiwix-serve', default=shutil.which('kiwix-serve') or newest(os.path.join(KIWIX_DIR, 'kiwix-tools_*', 'kiwix-serve')))
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--kiwix-port', type=int, default=8081)
    args = ap.parse_args()
    if not args.zim or not os.path.exists(args.zim):
        sys.exit('No ZIM file found -- pass --zim PATH')
    if not args.kiwix_serve:
        sys.exit('kiwix-serve not found -- pass --kiwix-serve PATH')

    kiwix = subprocess.Popen(
        [args.kiwix_serve, '--address', '127.0.0.1', '--port', str(args.kiwix_port), '--urlRootLocation', '/kiwix', args.zim],
        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    upstream = 'http://127.0.0.1:%d' % args.kiwix_port
    for _ in range(50):  # a 14 GB ZIM opens in well under a second, but don't race it
        try:
            urllib.request.urlopen(upstream + '/kiwix/catalog/v2/entries', timeout=1)
            break
        except OSError:
            time.sleep(0.2)
    book = os.path.basename(args.zim)[:-4]

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=REPO, **kw)

        def do_GET(self):
            if self.path == '/kiwix/book':
                # Which ZIM is loaded -- the page needs its name for search URLs.
                body = book.encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith('/kiwix/'):
                try:
                    with urllib.request.urlopen(upstream + self.path, timeout=30) as r:
                        body, status, ctype = r.read(), r.status, r.headers.get('Content-Type', 'application/octet-stream')
                except urllib.error.HTTPError as e:
                    body, status, ctype = e.read(), e.code, e.headers.get('Content-Type', 'text/plain')
                self.send_response(status)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def log_message(self, fmt, *a):
            where = 'kiwix (on disk)' if self.path.startswith('/kiwix/') else 'chrome-chat files'
            sys.stderr.write('%s  %-18s %s\n' % (time.strftime('%H:%M:%S'), where, self.path[:120]))

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)

    def stop(*_):
        kiwix.terminate()
        sys.exit(0)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print('chrome-chat (offline Wikipedia): http://localhost:%d' % args.port)
    print('ZIM: %s' % args.zim)
    print('Try: /wiki:offline <question>   -- every request is logged below\n')
    try:
        server.serve_forever()
    finally:
        kiwix.terminate()


if __name__ == '__main__':
    main()
