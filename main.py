from __future__ import annotations

import os
import json
import base64
from pathlib import Path
from typing import Optional
import threading

import decky
from tinytag import TinyTag, Image
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".opus"}

CONFIG_DIR = Path("~/homebrew/settings/Music Player").expanduser()
CONFIG_FILE = CONFIG_DIR / "config.json"

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
        self.http_port: int = 8082
        self.http_thread: Optional[threading.Thread] = None
        self.config: dict = {}

    # ---------------- CONFIG ---------------- #

    def _load_or_create_config(self) -> dict:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        if not CONFIG_FILE.exists():
            config = {
                "audio_library": str(Path("~/Music").expanduser()),
                "last_played": None,
            }
            CONFIG_FILE.write_text(json.dumps(config, indent=2))
            return config

        return json.loads(CONFIG_FILE.read_text())

    def _save_config(self):
        CONFIG_FILE.write_text(json.dumps(self.config, indent=2))

    # ---------------- MAIN ---------------- #

    async def _main(self):
        self.config = self._load_or_create_config()

        music_dir = Path(self.config["audio_library"]).expanduser()
        if music_dir.exists():
            self.playlist = sorted(
                [p for p in music_dir.rglob("*") if p.suffix.lower() in AUDIO_EXTS],
                key=lambda p: p.name.lower(),
            )
            self.playlist_meta = [self._read_tags(p) for p in self.playlist]

        if self.playlist and self.config.get("last_played") is None:
            self.config["last_played"] = self.playlist[0].name
            self._save_config()

        decky.logger.info(f"Found {len(self.playlist)} audio files")
        self._start_http_server()

    async def _unload(self):
        decky.logger.info("SimpleAudio backend unloaded")
        self.http_thread = None

    # ---------------- TAGS ---------------- #

    def _read_tags(self, path: Path) -> dict:
        try:
            tag: TinyTag = TinyTag.get(path, image=True)

            image: Image | None = None
            if tag.images:
                image = tag.images.front_cover or tag.images.any

            if image and image.data:
                cover_b64 = base64.b64encode(image.data).decode("ascii")
                cover_mime = image.mime_type
            else:
                cover_b64 = FALLBACK_COVER_B64
                cover_mime = FALLBACK_COVER_MIME

            return {
                "title": tag.title or path.stem,
                "artist": tag.artist,
                "album": tag.album,
                "cover": cover_b64,
                "cover_mime": cover_mime,
                "filename": path.name,
            }

        except Exception as e:
            decky.logger.warning(f"Tag read failed for {path}: {e}")
            return {
                "title": path.stem,
                "artist": None,
                "album": None,
                "cover": FALLBACK_COVER_B64,
                "cover_mime": FALLBACK_COVER_MIME,
                "filename": path.name,
            }

    # ---------------- RPC ---------------- #

    async def get_playlist(self):
        return [{"index": i, **meta} for i, meta in enumerate(self.playlist_meta)]

    async def get_initial_track(self) -> int:
        last = self.config.get("last_played")
        if not last:
            return 0

        for i, path in enumerate(self.playlist):
            if path.name == last:
                return i
        return 0

    async def load_track(self, index: int):
        if index < 0 or index >= len(self.playlist):
            raise IndexError("Track index out of range")

        meta = self.playlist_meta[index]
        self.config["last_played"] = meta["filename"]
        self._save_config()

        return {
            **meta,
            "url": f"http://127.0.0.1:{self.http_port}/{meta['filename']}",
        }

    # ---------------- HTTP ---------------- #

    def _start_http_server(self):
        if not self.playlist:
            return

        music_dir = Path(self.config["audio_library"]).expanduser()

        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(music_dir), **kwargs)

            def log_message(self, format, *args):
                pass

        def serve():
            with TCPServer(("127.0.0.1", self.http_port), Handler) as httpd:
                httpd.serve_forever()

        self.http_thread = threading.Thread(target=serve, daemon=True)
        self.http_thread.start()
