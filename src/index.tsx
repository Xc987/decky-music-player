import { definePlugin, callable } from "@decky/api";
import { PanelSection, PanelSectionRow, ButtonItem } from "@decky/ui";
import { useState, useEffect } from "react";
import { FaPlay, FaStop } from "react-icons/fa";

type AudioPayload = {
  data: string;
  mime?: string;
};

const loadAudio = callable<[], AudioPayload>("load_audio");

let audio: HTMLAudioElement | null = null;

function decodeToObjectURL(payload: AudioPayload): string {
  let base64 = payload.data;
  let mime = payload.mime ?? "audio/mpeg";

  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mime = match[1];
      base64 = match[2];
    }
  }

  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: mime });
  return URL.createObjectURL(blob);
}

async function playAudio() {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
  }

  const payload = await loadAudio();
  const url = decodeToObjectURL(payload);

  audio.src = url;
  audio.volume = 1.0;
  await audio.play();
}

function stopAudio() {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  audio.src = "";
}

function Content() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (audio && !audio.paused) {
      setPlaying(true);
    }
  }, []);

  return (
    <PanelSection title="Simple Audio Player">
      <PanelSectionRow>
        <ButtonItem
          onClick={async () => {
            if (!playing) {
              await playAudio();
              setPlaying(true);
            } else {
              stopAudio();
              setPlaying(false);
            }
          }}
        >
          {playing ? <FaStop /> : <FaPlay />}{" "}
          {playing ? "Stop ~/audio.mp3" : "Play ~/audio.mp3"}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}


export default definePlugin(() => ({
  name: "SimpleAudio",
  icon: <FaPlay />,
  content: <Content />,
  onDismount() {
    stopAudio();
  },
}));