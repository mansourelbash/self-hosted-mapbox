"""Local Arabic speech. Only model installation needs an external download."""
import io
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
import urllib.request
import wave

from piper import PiperVoice

MODEL_DIR = Path('/models')
MODEL_DIR.mkdir(parents=True, exist_ok=True)
BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/'
for name in ('ar_JO-kareem-medium.onnx', 'ar_JO-kareem-medium.onnx.json', 'MODEL_CARD'):
    target = MODEL_DIR / name
    if not target.exists():
        print(f'Downloading {name}', flush=True)
        with urllib.request.urlopen(BASE + name, timeout=180) as response, open(str(target) + '.part', 'wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        os.replace(str(target) + '.part', target)

voice = PiperVoice.load(str(MODEL_DIR / 'ar_JO-kareem-medium.onnx'))
lock = Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Do not record spoken street names.

    def send_bytes(self, status, data, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != '/health':
            self.send_bytes(404, b'Not found', 'text/plain')
            return
        self.send_bytes(200, b'{"ready":true,"voice":"ar_JO-kareem-medium"}', 'application/json')

    def do_POST(self):
        if self.path != '/speak':
            self.send_bytes(404, b'Not found', 'text/plain')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 8192:
                raise ValueError('Invalid size')
            payload = json.loads(self.rfile.read(size))
            text = payload.get('text')
            if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
                raise ValueError('Invalid text')
        except (ValueError, AttributeError):
            self.send_bytes(400, b'Expected text of 1 to 500 characters', 'text/plain')
            return
        if not lock.acquire(blocking=False):
            self.send_bytes(503, b'Speech engine is busy', 'text/plain')
            return
        try:
            audio = io.BytesIO()
            with wave.open(audio, 'wb') as wav:
                voice.synthesize_wav(text, wav)
            self.send_bytes(200, audio.getvalue(), 'audio/wav')
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.send_bytes(500, b'Speech synthesis failed', 'text/plain')
        finally:
            lock.release()

print('Arabic speech ready on port 5001', flush=True)
ThreadingHTTPServer(('0.0.0.0', 5001), Handler).serve_forever()
