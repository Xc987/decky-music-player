import { definePlugin, callable } from "@decky/api";
import {
  PanelSection,
  PanelSectionRow,
  SliderField,
  Focusable,
  DialogButton
} from "@decky/ui";
import { useState, useEffect, useRef } from "react";
import { FaPlay, FaPause } from "react-icons/fa";
import { FaBackwardStep, FaForwardStep } from "react-icons/fa6";

type TrackInfo = {
  index: number;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  cover_mime?: string;
  url?: string;
  bitrate?: number;
  samplerate?: number;
  channels?: number;
  bitdepth?: number;
};

const getPlaylist = callable<[], TrackInfo[]>("get_playlist");
const loadTrack = callable<[number], TrackInfo>("load_track");
const getInitialTrack = callable<[], number>("get_initial_track");

let audio: HTMLAudioElement | null = null;

export default definePlugin(() => ({
  name: "SimpleAudio",
  icon: <FaPlay />,
  content: <Content />,
}));

function Content() {
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const isSeekingRef = useRef(false);

  // ---------- INITIAL LOAD ----------
  useEffect(() => {
    (async () => {
      const list = await getPlaylist();
      const initial = await getInitialTrack();
      setPlaylist(list);
      setCurrent(initial);
    })();
  }, []);

  // ---------- AUDIO SETUP ----------
  useEffect(() => {
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
    }

    setPlaying(!audio.paused);
    setProgress(audio.currentTime || 0);
    setDuration(audio.duration || 0);
    setReady(!isNaN(audio.duration) && audio.duration > 0);

    const onLoadedMetadata = () => {
      if (!audio) return;
      setDuration(audio.duration);
      setReady(audio.duration > 0);
      setError(false);
    };

    const onTimeUpdate = () => {
      if (!audio || isSeekingRef.current) return;
      setProgress(audio.currentTime);
    };

    const onEnded = () => setPlaying(false);

    const onError = () => {
      setError(true);
      setReady(false);
      setPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio?.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio?.removeEventListener("timeupdate", onTimeUpdate);
      audio?.removeEventListener("ended", onEnded);
      audio?.removeEventListener("error", onError);
    };
  }, []);

  // ---------- LOAD INITIAL TRACK (ONLY ONCE) ----------
  useEffect(() => {
    if (!audio || playlist.length === 0) return;
    if (audio.src) return;
    playTrack(current);
  }, [playlist]);

  const playTrack = async (index: number) => {
    if (!audio) return;

    setError(false);
    setReady(false);
    setProgress(0);
    setDuration(0);

    const track = await loadTrack(index);
    if (!track.url) {
      setError(true);
      return;
    }

    audio.src = track.url;
    audio.load();

    try {
      await audio.play();
      setCurrent(index);
      setPlaying(true);
    } catch {
      setError(true);
    }
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
    if (!audio || !ready || error) return;

    isSeekingRef.current = true;

    const safeValue = Math.min(
      Math.max(0, value),
      Math.max(0, audio.duration - 0.25)
    );

    audio.currentTime = safeValue;
    setProgress(safeValue);

    setTimeout(() => {
      isSeekingRef.current = false;
    }, 150);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;

  const track = playlist[current];

  return (
    <PanelSection>
      <PanelSectionRow>
        {track?.cover && track?.cover_mime && (
          <img
            src={`data:${track.cover_mime};base64,${track.cover}`}
            style={{ width: 64, height: 64, borderRadius: 6, marginRight: 8 }}
          />
        )}
        <div>
          <div style={{ fontWeight: 600 }}>
            {track?.title ?? "No track selected"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {track?.artist ?? "Unknown artist"}
            {track?.bitrate && ` • ${track.bitrate} kbps`}
            {track?.samplerate && ` • ${track.samplerate} Hz`}
            {track?.channels && ` • ${track.channels} channel${track.channels > 1 ? "s" : ""}`}
            {track?.bitdepth && ` • ${track.bitdepth}-bit`}
          </div>
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{display: "flex", flexDirection: "column", width: "100%", padding: "0px"}}>
          <SliderField
            label=""
            value={progress}
            min={0}
            max={ready ? duration : 1}
            step={0.5}
            showValue={false}
            disabled={!ready || error}
            onChange={handleSeek}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
            }}
          >
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </PanelSectionRow>
      <Focusable style={{marginTop: "10px", marginBottom: "10px", display: "flex", width: "100%",}}
flow-children="horizontal">
  <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0,marginRight: "4px"}}
    onClick={prevTrack}
  >
    <FaBackwardStep />
  </DialogButton>

  <DialogButton style={{flex: 1, height: "40px", display: "flex",alignItems: "center",justifyContent: "center", padding: 0,minWidth: 0,marginRight: "4px", marginLeft: "4px", }}
    onClick={togglePlay}
  >
    {playing ? <FaPause /> : <FaPlay />}
  </DialogButton>

  <DialogButton style={{flex: 1,height: "40px",display: "flex",alignItems: "center",justifyContent: "center",padding: 0,minWidth: 0,marginLeft: "4px", }}
    onClick={nextTrack}
  >
    <FaForwardStep />
  </DialogButton>
</Focusable>
    </PanelSection>
  );
}
