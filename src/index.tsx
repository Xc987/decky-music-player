import { definePlugin, callable } from "@decky/api";
import { PanelSection, PanelSectionRow, ButtonItem } from "@decky/ui";
import { useState, useEffect } from "react";
import { FaPlay, FaStop, FaForward, FaBackward } from "react-icons/fa";

type TrackInfo = {
  index: number;
  name: string;
};

type AudioPayload = {
  data: string;
  mime?: string;
  name?: string;
};

const getPlaylist = callable<[], TrackInfo[]>("get_playlist");
const loadTrack = callable<[number], AudioPayload>("load_track");

let audio: HTMLAudioElement | null = null;

function decodeToObjectURL(payload: AudioPayload): string {
  const binary = atob(payload.data);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([buffer], {
    type: payload.mime ?? "audio/mpeg",
  });
  return URL.createObjectURL(blob);
}

async function playIndex(index: number) {
  if (!audio) {
    audio = new Audio();
  }

  const payload = await loadTrack(index);
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
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    getPlaylist().then(setPlaylist);
  }, []);

  const play = async (index: number = current) => {
    await playIndex(index);
    setCurrent(index);
    setPlaying(true);
  };

  const next = async () => {
    if (current + 1 < playlist.length) {
      await play(current + 1);
    }
  };

  const prev = async () => {
    if (current > 0) {
      await play(current - 1);
    }
  };

  return (
    <PanelSection title="Simple Audio Player">
      <PanelSectionRow>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          {playlist.length > 0
            ? playlist[current]?.name
            : "No audio files found in ~/Music"}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem onClick={prev} disabled={current === 0}>
          <FaBackward /> Previous
        </ButtonItem>

        <ButtonItem
          onClick={async () => {
            if (!playing) {
              await play();
            } else {
              stopAudio();
              setPlaying(false);
            }
          }}
        >
          {playing ? <FaStop /> : <FaPlay />}{" "}
          {playing ? "Stop" : "Play"}
        </ButtonItem>

        <ButtonItem
          onClick={next}
          disabled={current + 1 >= playlist.length}
        >
          <FaForward /> Next
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