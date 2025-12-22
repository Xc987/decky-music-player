import { definePlugin, callable } from "@decky/api";
import { PanelSection, PanelSectionRow, ButtonItem, SliderField } from "@decky/ui";
import { useState, useEffect } from "react";
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

export default definePlugin(() => ({
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
}));

function Content() {
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    getPlaylist().then(setPlaylist);
  }, []);

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
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

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

      {/* Progress slider */}
      <PanelSectionRow>
  <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "0px" }}>
    {/* Slider */}
    <SliderField
      label=""
      value={progress}
      min={0}
      max={duration || 1}
      step={0.5}
      showValue={false}
      onChange={handleSeek}
    />

    {/* Time labels below, aligned with slider edges */}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: 2 }}>
      <span>{formatTime(progress)}</span>
      <span>{formatTime(duration)}</span>
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
