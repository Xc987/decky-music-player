from __future__ import annotations

import os
import base64
from pathlib import Path
from typing import Optional
import asyncio
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer
import threading

import decky
from tinytag import TinyTag, Image

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".opus"}

# Preload fallback cover image
FALLBACK_COVER_PATH = Path(os.path.dirname(__file__)) / "assets/cover.png"
FALLBACK_COVER_B64 = (
    base64.b64encode(FALLBACK_COVER_PATH.read_bytes()).decode("ascii")
    if FALLBACK_COVER_PATH.exists()
    else None
)
FALLBACK_COVER_MIME = "image/png"


class Plugin:
    def __init__(self):
        self.playlist: list[Path] = []
        self.playlist_meta: list[dict] = []
        self.http_port: int = 8000  # temporary HTTP server port
        self.http_thread: Optional[threading.Thread] = None

    async def _main(self):
        music_dir = Path("~/Music").expanduser()
        if music_dir.exists():
            self.playlist = sorted(
                [p for p in music_dir.rglob("*") if p.suffix.lower() in AUDIO_EXTS],
                key=lambda p: p.name.lower(),
            )

            # preload metadata
            self.playlist_meta = [self._read_tags(p) for p in self.playlist]

        decky.logger.info(f"Found {len(self.playlist)} audio files")

        # start HTTP server to serve audio files
        self._start_http_server()

    async def _unload(self):
        decky.logger.info("SimpleAudio backend unloaded")
        if self.http_thread:
            # shutdown server by closing the socket
            # (for simplicity, we rely on daemon thread termination)
            self.http_thread = None

    def _read_tags(self, path: Path) -> dict:
        try:
            tag: TinyTag = TinyTag.get(path, image=True)

            cover_b64: Optional[str] = None
            cover_mime: Optional[str] = None
            image: Image | None = None

            if tag.images:
                image = tag.images.front_cover or tag.images.any

            if image is not None and image.data:
                cover_b64 = base64.b64encode(image.data).decode("ascii")
                cover_mime = image.mime_type
            else:
                cover_b64 = FALLBACK_COVER_B64
                cover_mime = FALLBACK_COVER_MIME

            return {
                "title": tag.title or path.stem,
                "artist": tag.artist,
                "additional_artists": tag.other.get("artist"),
                "album": tag.album,
                "cover": cover_b64,
                "cover_mime": cover_mime,
                "filename": path.name,  # will use in HTTP URL
            }

        except Exception as e:
            decky.logger.warning(f"Failed to read tags for {path}: {e}")
            return {
                "title": path.stem,
                "artist": None,
                "additional_artists": None,
                "album": None,
                "cover": FALLBACK_COVER_B64,
                "cover_mime": FALLBACK_COVER_MIME,
                "filename": path.name,
            }

    async def get_playlist(self):
        return [
            {"index": i, **meta}
            for i, meta in enumerate(self.playlist_meta)
        ]

    async def load_track(self, index: int):
        if index < 0 or index >= len(self.playlist):
            raise IndexError("Track index out of range")

        meta = self.playlist_meta[index]
        # return the URL to the local HTTP server
        url = f"http://127.0.0.1:{self.http_port}/{meta['filename']}"
        return {**meta, "url": url}

    def _start_http_server(self):
        if not self.playlist:
            return

        # serve the directory containing audio files
        class CustomHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(Path.home() / "Music"), **kwargs)

            def log_message(self, format, *args):
                return  # silence logging

        def serve():
            with TCPServer(("127.0.0.1", self.http_port), CustomHandler) as httpd:
                httpd.serve_forever()

        self.http_thread = threading.Thread(target=serve, daemon=True)
        self.http_thread.start()
