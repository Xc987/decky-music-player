import { definePlugin, callable } from "@decky/api";
import { PanelSection, PanelSectionRow, ButtonItem} from "@decky/ui";
import { useState, useEffect, useRef } from "react";
import { FaPlay, FaStop, FaForward, FaBackward } from "react-icons/fa";

type TrackInfo = {
  index: number;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  cover_mime?: string;
  url?: string;
};

const getPlaylist = callable<[], TrackInfo[]>("get_playlist");
const loadTrack = callable<[number], TrackInfo>("load_track");

let audio: HTMLAudioElement | null = null;

export default definePlugin(() => {
  return {
    name: "SimpleAudio",
    icon: <FaPlay />,
    content: <Content />,
    onDismount() {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      }
    },
  };
});

function Content() {
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // in seconds
  const [duration, setDuration] = useState(0); // in seconds

  const progressRef = useRef<number>(0);

  useEffect(() => {
    getPlaylist().then(setPlaylist);
  }, []);

  // Setup audio element and progress tracking
  useEffect(() => {
    if (!audio) audio = new Audio();

    const updateProgress = () => {
      if (audio && audio.duration > 0) {
        setProgress(audio.currentTime);
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setPlaying(false);
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio?.removeEventListener("timeupdate", updateProgress);
      audio?.removeEventListener("ended", onEnded);
    };
  }, []);

  const playTrack = async (index: number = current) => {
    const payload = await loadTrack(index);
    if (!payload.url) return;

    if (!audio) audio = new Audio();
    audio.src = payload.url;
    await audio.play();
    setCurrent(index);
    setPlaying(true);
  };

  const stopTrack = () => {
    if (!audio) return;
    audio.pause();
    setPlaying(false);
  };

  const togglePlay = async () => {
    if (!playing) {
      await playTrack();
    } else {
      stopTrack();
    }
  };

  const nextTrack = async () => {
    if (current + 1 < playlist.length) await playTrack(current + 1);
  };

  const prevTrack = async () => {
    if (current > 0) await playTrack(current - 1);
  };

  const handleSeek = (value: number) => {
  if (audio) {
    audio.currentTime = value;
    setProgress(value);
  }
};


  const track = playlist[current];

  return (
    <PanelSection title="Simple Audio Player">
      {/* Track info with cover */}
      <PanelSectionRow>
        {track?.cover && track?.cover_mime && (
          <img
            src={`data:${track.cover_mime};base64,${track.cover}`}
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              borderRadius: 6,
              marginRight: 12,
            }}
          />
        )}
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>
            {track?.title ?? "No track selected"}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            {track?.artist ?? "Unknown artist"}
          </div>
        </div>
      </PanelSectionRow>

      {/* Progress bar */}
      <PanelSectionRow>
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <input
            type="range"
            min={0}
            max={duration || 1}
            value={progress}
            step={0.01}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleSeek(Number(e.target.value))
            }
            style={{ flex: 1 }}
          />
          <div style={{ fontSize: "10px", marginLeft: 8 }}>
            {formatTime(progress)} / {formatTime(duration)}
          </div>
        </div>
      </PanelSectionRow>

      {/* Playback controls */}
      <PanelSectionRow>
        <ButtonItem onClick={prevTrack} disabled={current === 0}>
          <FaBackward /> Previous
        </ButtonItem>

        <ButtonItem onClick={togglePlay}>
          {playing ? <FaStop /> : <FaPlay />} {playing ? "Stop" : "Play"}
        </ButtonItem>

        <ButtonItem
          onClick={nextTrack}
          disabled={current + 1 >= playlist.length}
        >
          <FaForward /> Next
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

// Helper to format seconds as mm:ss
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
