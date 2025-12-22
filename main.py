from __future__ import annotations

import os
import base64
from pathlib import Path
from typing import Optional

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

    async def _main(self):
        music_dir = Path("~/Music").expanduser()
        if music_dir.exists():
            self.playlist = sorted(
                [p for p in music_dir.rglob("*") if p.suffix.lower() in AUDIO_EXTS],
                key=lambda p: p.name.lower(),
            )

        decky.logger.info(f"Found {len(self.playlist)} audio files")

    async def _unload(self):
        decky.logger.info("SimpleAudio backend unloaded")

    def _read_tags(self, path: Path) -> dict:
        try:
            tag: TinyTag = TinyTag.get(path, image=True)

            cover_b64: Optional[str] = None
            cover_mime: Optional[str] = None

            image: Image | None = None

            if tag.images:
                # Prefer front cover, fallback to any
                image = tag.images.front_cover or tag.images.any

            if image is not None and image.data:
                cover_b64 = base64.b64encode(image.data).decode("ascii")
                cover_mime = image.mime_type
            else:
                # Fallback to local cover.png
                cover_b64 = FALLBACK_COVER_B64
                cover_mime = FALLBACK_COVER_MIME

            return {
                "title": tag.title or path.stem,
                "artist": tag.artist,
                "additional_artists": tag.other.get("artist"),
                "album": tag.album,
                "cover": cover_b64,
                "cover_mime": cover_mime,
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
            }

    async def get_playlist(self):
        return [
            {
                "index": i,
                **self._read_tags(path),
            }
            for i, path in enumerate(self.playlist)
        ]

    async def load_track(self, index: int):
        if index < 0 or index >= len(self.playlist):
            raise IndexError("Track index out of range")

        path = self.playlist[index]
        decky.logger.info(f"Loading track: {path}")

        data = path.read_bytes()
        encoded = base64.b64encode(data).decode("ascii")

        return {
            "data": encoded,
            "mime": "audio/mpeg",
            **self._read_tags(path),
        }
