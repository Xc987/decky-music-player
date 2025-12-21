from __future__ import annotations

import base64
from pathlib import Path
import decky

class Plugin:
    async def _main(self):
        decky.logger.info("SimpleAudio backend ready")

    async def _unload(self):
        decky.logger.info("SimpleAudio backend unloaded")

    async def load_audio(self):
        path = Path("~/audio.mp3").expanduser().resolve()
        decky.logger.info(f"Loading audio file: {path}")

        if not path.exists() or not path.is_file():
            raise FileNotFoundError(f"File not found: {path}")

        data = path.read_bytes()
        encoded = base64.b64encode(data).decode("ascii")

        return {
            "data": encoded,
            "mime": "audio/mpeg",
        }
