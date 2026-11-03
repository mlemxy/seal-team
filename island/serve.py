"""The seal island's local server: serves the page and hands asks typed on it to the mod.

Started by the mod for one session: python3 serve.py <island folder> <secret>.
Listens on 127.0.0.1 only, on a free port. Prints one JSON line with the port, then
one JSON line per ask ({"seal", "text"}), which the mod turns into a prompt.

An ask is accepted only from the page itself: the secret path, a Host and Origin of
this server, and a JSON body (so another site's page can't post one: the browser would
need a CORS preflight, which this server never allows).
"""

import http.server
import json
import os
import sys
import threading
import time

ROOT, SECRET = sys.argv[1], sys.argv[2]
PREFIX = '/' + SECRET + '/'
MAX_BODY = 8000
port = 0


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _ours(self):
        return self.headers.get('Host') == '127.0.0.1:%d' % port and self.path.startswith(PREFIX)

    def do_GET(self):
        if not self._ours():
            return self.send_error(404)
        self.path = self.path[len(PREFIX) - 1:]
        return super().do_GET()

    def do_HEAD(self):
        if not self._ours():
            return self.send_error(404)
        self.path = self.path[len(PREFIX) - 1:]
        return super().do_HEAD()

    def do_OPTIONS(self):
        self.send_error(405)

    def do_POST(self):
        if not self._ours() or self.path.split('?')[0] != PREFIX + 'ask':
            return self.send_error(404)
        if self.headers.get('Origin') != 'http://127.0.0.1:%d' % port:
            return self.send_error(403)
        if (self.headers.get('Content-Type') or '').split(';')[0].strip() != 'application/json':
            return self.send_error(415)
        size = int(self.headers.get('Content-Length') or 0)
        if size <= 0 or size > MAX_BODY:
            return self.send_error(413)
        try:
            body = json.loads(self.rfile.read(size))
            seal, text = body['seal'], body['text']
            if not isinstance(seal, str) or not isinstance(text, str) or not text.strip():
                raise ValueError
        except (ValueError, KeyError, TypeError):
            return self.send_error(400)
        print(json.dumps({'seal': seal, 'text': text.strip()}), flush=True)
        self.send_response(202)
        self.send_header('Content-Length', '0')
        self.end_headers()


def exit_with_parent():
    # The mod stops this server when it unloads; this covers Claude Code being killed outright.
    parent = os.getppid()
    while os.getppid() == parent:
        time.sleep(2)
    os._exit(0)


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
port = server.server_address[1]
threading.Thread(target=exit_with_parent, daemon=True).start()
print(json.dumps({'port': port}), flush=True)
server.serve_forever()
