from __future__ import annotations

import base64
from pathlib import Path
import decky

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".opus"}

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

    async def get_playlist(self):
        return [
            {
                "index": i,
                "name": p.name,
            }
            for i, p in enumerate(self.playlist)
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
            "name": path.name,
        }
