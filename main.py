from __future__ import annotations

import os
import json
import base64
from pathlib import Path
from typing import Optional
import threading
import decky
import mimetypes
from tinytag import TinyTag, Image
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer

config_file = Path("~/homebrew/settings/Music Player").expanduser() / "config.json"
cache_file = Path("~/homebrew/settings/Music Player").expanduser() / "metadata_cache.json"

cover_art_path = Path(os.path.dirname(__file__)) / "assets/cover.png"
fallback_cover_b64 = (
    base64.b64encode(cover_art_path.read_bytes()).decode("ascii")
    if cover_art_path.exists()
    else None
)

class Plugin:
    def __init__(self):
        self.playlist: list[Path] = []
        self.playlist_meta: list[dict] = []
        self.http_port: int = 8082
        self.http_thread: Optional[threading.Thread] = None
        self.config: dict = {}
        self.metadata_cache: dict = {}
    async def _main(self):
        self.config = self._config()
        self._load_metadata_cache()
        music_dir = Path(self.config["audio_library"]).expanduser()
        if music_dir.exists():
            supported_exts = {ext.lower() for ext in TinyTag.SUPPORTED_FILE_EXTENSIONS}
            self.playlist = sorted([p for p in music_dir.rglob("*") if p.is_file() and p.suffix.lower() in supported_exts],key=lambda p: p.name.lower())
            self.playlist_meta = [self._get_cached_meta(p) for p in self.playlist]
        if self.playlist and not self.config.get("last_played"):
            self.config["last_played"] = self.playlist[0].name
            self._save_config()
        self._start_http_server()

    def _config(self):
        Path("~/homebrew/settings/Music Player").expanduser().mkdir(parents=True, exist_ok=True)
        if not config_file.exists():
            cfg = {"audio_library": str(Path("~/Music").expanduser()), "last_played": None, "volume": 1.0, "repeat": False}
            config_file.write_text(json.dumps(cfg, indent=2))
            return cfg
        return json.loads(config_file.read_text())

    def _save_config(self):
        config_file.write_text(json.dumps(self.config, indent=2))

    def _load_metadata_cache(self):
        if cache_file.exists():
            try:
                self.metadata_cache = json.loads(cache_file.read_text())
            except Exception:
                self.metadata_cache = {}
        else:
            self.metadata_cache = {}

    def _save_metadata_cache(self):
        cache_file.write_text(json.dumps(self.metadata_cache, indent=2))

    def _get_cached_meta(self, path: Path):
        key = str(path.resolve())
        if key in self.metadata_cache:
            meta = self.metadata_cache[key]
        else:
            meta = self._read_tags_basic(path)
            self.metadata_cache[key] = meta
            self._save_metadata_cache()
        return meta

    def _read_tags_basic(self, path: Path):
        try:
            tag = TinyTag.get(path)
            return {
                "title": tag.title or path.stem,
                "artist": tag.artist,
                "album": tag.album,
                "albumartist": tag.albumartist,
                "disc": tag.disc,
                "disc_total": tag.disc_total,
                "track": tag.track,
                "track_total": tag.track_total,
                "genre": tag.genre,
                "year": tag.year,
                "duration": tag.duration,
                "mime_type": mimetypes.guess_type(str(path))[0],
                "full_path": str(path),
                "filesize": tag.filesize,
                "filename": path.name,
                "bitrate": tag.bitrate,
                "samplerate": tag.samplerate,
                "channels": tag.channels,
                "bitdepth": getattr(tag, "bitdepth", None),
                "cover": None,
                "cover_mime": None
            }
        except Exception as e:
            return {
                "title": path.stem,
                "artist": None,
                "album": None,
                "albumartist": None,
                "disc": None,
                "disc_total": None,
                "track": None,
                "track_total": None,
                "genre": None,
                "year": None,
                "duration": None,
                "mime_type": mimetypes.guess_type(str(path))[0],
                "full_path": str(path),
                "filesize": None,
                "filename": path.name,
                "bitrate": None,
                "samplerate": None,
                "channels": None,
                "bitdepth": None,
                "cover": None,
                "cover_mime": None
            }

    def _read_cover_art(self, index: int):
        """Load cover art lazily"""
        meta = self.playlist_meta[index]
        if meta.get("cover") is None:
            try:
                tag = TinyTag.get(meta["full_path"], image=True)
                image = tag.images.front_cover or tag.images.any if tag.images else None
                if image and image.data:
                    cover = base64.b64encode(image.data).decode("ascii")
                    mime = image.mime_type
                else:
                    cover = fallback_cover_b64
                    mime = "image/png"
                meta["cover"] = cover
                meta["cover_mime"] = mime
                self.metadata_cache[str(Path(meta["full_path"]).resolve())] = meta
                self._save_metadata_cache()
            except Exception:
                meta["cover"] = fallback_cover_b64
                meta["cover_mime"] = "image/png"
        return meta

    async def get_playlist(self):
        return [{"index": i, **meta} for i, meta in enumerate(self.playlist_meta)]

    async def get_initial_track(self):
        last = self.config.get("last_played")
        if not last:
            return 0
        for i, p in enumerate(self.playlist):
            if p.name == last:
                return i
        return 0

    async def load_track(self, index: int):
        meta = self.playlist_meta[index]
        try:
            tag = TinyTag.get(meta["full_path"], image=True)
            image = tag.images.front_cover or tag.images.any if tag.images else None
            if image and image.data:
                cover = base64.b64encode(image.data).decode("ascii")
                mime = image.mime_type
            else:
                cover = fallback_cover_b64
                mime = "image/png"
        except Exception:
            cover = fallback_cover_b64
            mime = "image/png"
        track_data = {**meta, "cover": cover, "cover_mime": mime}
        self.config["last_played"] = meta["filename"]
        self._save_config()
        return {**track_data, "url": f"http://127.0.0.1:{self.http_port}/{meta['filename']}"}

    async def get_volume(self):
        return float(self.config.get("volume", 1.0))

    async def set_volume(self, volume: float):
        self.config["volume"] = max(0.0, min(1.0, float(volume)))
        self._save_config()

    async def get_repeat(self):
        return bool(self.config.get("repeat", False))

    async def set_repeat(self, value: bool):
        self.config["repeat"] = bool(value)
        self._save_config()

    def _start_http_server(self):
        if not self.playlist:
            return
        music_dir = Path(self.config["audio_library"]).expanduser()

        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(music_dir), **kwargs)

            def log_message(self, *_):
                pass

            def send_head(self):
                path = self.translate_path(self.path)
                if not os.path.isfile(path):
                    self.send_error(404, "File not found")
                    return None
                f = open(path, "rb")
                fs = os.fstat(f.fileno())
                size = fs.st_size
                range_header = self.headers.get("Range")
                if range_header:
                    start, end = range_header.replace("bytes=", "").split("-")
                    start = int(start)
                    end = int(end) if end else size - 1
                    self.send_response(206)
                    self.send_header("Content-Type", self.guess_type(path))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                    self.send_header("Content-Length", str(end - start + 1))
                    self.end_headers()
                    f.seek(start)
                    self.wfile.write(f.read(end - start + 1))
                    f.close()
                    return None
                self.send_response(200)
                self.send_header("Content-Type", self.guess_type(path))
                self.send_header("Content-Length", str(size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                return f

        def serve():
            with ThreadingTCPServer(("127.0.0.1", self.http_port), Handler) as httpd:
                httpd.serve_forever()

        self.http_thread = threading.Thread(target=serve, daemon=True)
        self.http_thread.start()
