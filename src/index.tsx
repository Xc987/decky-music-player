import { definePlugin, callable } from "@decky/api";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  SliderField,
} from "@decky/ui";
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
const getInitialTrack = callable<[], number>("get_initial_track");

let audio: HTMLAudioElement | null = null;

export default definePlugin(() => ({
  name: "SimpleAudio",
  icon: <FaPlay />,
  content: <Content />,
  onDismount() {
    // keep audio alive
  },
}));

function Content() {
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  // ---------- INITIAL LOAD ----------
  useEffect(() => {
    (async () => {
      const list = await getPlaylist();
      setPlaylist(list);

      const index = await getInitialTrack();
      setCurrent(index);
    })();
  }, []);

  // ---------- AUDIO SETUP ----------
  useEffect(() => {
    if (!audio) {
      audio = new Audio();
    } else {
      setPlaying(!audio.paused);
      setProgress(audio.currentTime || 0);
      setDuration(audio.duration || 0);
      setReady(!isNaN(audio.duration) && audio.duration > 0);
    }

    const onTime = () => {
      if (!audio) return;
      setProgress(audio.currentTime);
    };

    const onMeta = () => {
      if (!audio) return;
      setDuration(audio.duration);
      setReady(true);
    };

    const onEnded = () => {
      setPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio?.removeEventListener("timeupdate", onTime);
      audio?.removeEventListener("loadedmetadata", onMeta);
      audio?.removeEventListener("ended", onEnded);
    };
  }, []);

  // ---------- LOAD INITIAL TRACK ----------
  useEffect(() => {
    if (!audio || audio.src !== "" || playlist.length === 0) return;

    (async () => {
      const track = await loadTrack(current);
      if (!track.url) return;

      audio!.src = track.url;
      audio!.load(); // IMPORTANT
      setReady(false);
    })();
  }, [playlist]);

  // ---------- CONTROLS ----------
  const playTrack = async (index = current) => {
    if (!audio) return;

    const track = await loadTrack(index);
    if (!track.url) return;

    if (audio.src !== track.url) {
      audio.src = track.url;
      audio.load(); // REQUIRED
      setReady(false);
    }

    await audio.play();
    setCurrent(index);
    setPlaying(true);
  };

  const togglePlay = async () => {
    if (!audio) return;

    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const nextTrack = () => {
    if (current + 1 < playlist.length) playTrack(current + 1);
  };

  const prevTrack = () => {
    if (current > 0) playTrack(current - 1);
  };

  const handleSeek = (value: number) => {
    if (!audio || !ready) return;
    audio.currentTime = value;
    setProgress(value);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;

  const track = playlist[current];

  return (
    <PanelSection title="Simple Audio Player">
      {/* Track Info */}
      <PanelSectionRow>
        {track?.cover && track?.cover_mime && (
          <img
            src={`data:${track.cover_mime};base64,${track.cover}`}
            style={{ width: 64, height: 64, borderRadius: 6 }}
          />
        )}
        <div>
          <div style={{ fontWeight: 600 }}>
            {track?.title ?? "No track selected"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {track?.artist ?? "Unknown artist"}
          </div>
        </div>
      </PanelSectionRow>

      {/* Progress */}
      <PanelSectionRow>
        <div style={{display: "flex", flexDirection: "column", width: "100%", padding: "0px"}}>
          <SliderField
            value={progress}
            min={0}
            max={ready ? duration : 1}
            step={0.5}
            showValue={false}
            disabled={!ready}
            onChange={handleSeek}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </PanelSectionRow>

      {/* Controls */}
      <PanelSectionRow>
        <ButtonItem onClick={prevTrack} disabled={current === 0}>
          <FaBackward /> Previous
        </ButtonItem>

        <ButtonItem onClick={togglePlay}>
          {playing ? <FaStop /> : <FaPlay />} {playing ? "Stop" : "Play"}
        </ButtonItem>

        <ButtonItem onClick={nextTrack} disabled={current + 1 >= playlist.length}>
          <FaForward /> Next
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
