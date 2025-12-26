import { definePlugin, callable } from "@decky/api";
import {PanelSection, PanelSectionRow, SliderField, Focusable, DialogButton } from "@decky/ui";

import { useState, useEffect, useRef } from "react";
import { FaPlay, FaPause } from "react-icons/fa";
import { FaBackwardStep, FaForwardStep } from "react-icons/fa6";

type TrackInfo = {
  index: number;
  title: string;
  artist?: string;
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
const getVolume = callable<[], number>("get_volume");
const setVolume = callable<[number], void>("set_volume");

let audio: HTMLAudioElement | null = null;

export default definePlugin(() => ({
  name: "SimpleAudio",
  icon: <FaPlay />,
  content: <Content />,
}));

function AutoScrollText({ text, style, }: { text: string; style?: React.CSSProperties; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    const overflowAmount = textEl.scrollWidth - container.clientWidth;

    if (overflowAmount > 0) {
      setShouldScroll(true);
      setAnimationDuration(15);
    } else {
      setShouldScroll(false);
      setAnimationDuration(0);
      textEl.style.transform = "translateX(0)";
    }
  }, [text]);

  return (
    <div
      ref={containerRef}
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        width: "100%",
      }}>
      <div
        ref={textRef}
        key={text}
        style={{
          display: "inline-block",
          animation: shouldScroll
            ? `scrollText ${animationDuration}s linear infinite`
            : "none",
          ...style,
        }}>
        {text}
      </div>
      <style>
        {`
          @keyframes scrollText {
            0% { transform: translateX(0); }
            100% { transform: translateX(-100%); }
          }
        `}
      </style>
    </div>
  );
}

function Content() {
  const [playlist, setPlaylist] = useState<TrackInfo[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [volume, setVolumeState] = useState(1.0);
  const [initialized, setInitialized] = useState(false);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const list = await getPlaylist();
      const initial = await getInitialTrack();
      const vol = await getVolume();
      setPlaylist(list);
      setCurrent(initial);
      setVolumeState(vol);
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
      }
      audio.volume = vol;
      setInitialized(true);
    })();
  }, []);

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

  useEffect(() => {
    if (!audio || playlist.length === 0 || !initialized) return;
    if (audio.src) return;
    loadTrackSilently(current);
  }, [playlist, initialized]);

  const loadTrackSilently = async (index: number) => {
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
    audio.volume = volume;
    audio.load();
    setCurrent(index);
    setPlaying(false);
  };

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
    audio.volume = volume;
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
    if (!audio.src && playlist.length > 0) {
      await playTrack(current);
      return;
    }
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

    setTimeout(() => { isSeekingRef.current = false; }, 150);
  };

  const handleVolumeChange = async (value: number) => {
    const v = Math.min(1, Math.max(0, value));
    setVolumeState(v);
    if (audio) audio.volume = v;
    await setVolume(v);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;

  const track = playlist[current];

  return (
    <PanelSection>
      <style>
        {`
          @keyframes scrollText {
            from { transform: translateX(0%); }
            to { transform: translateX(-100%); }
          }
        `}
      </style>
      <PanelSectionRow>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            marginLeft: -14,
          }}>
          {track?.cover && track?.cover_mime && (
            <img
              src={`data:${track.cover_mime};base64,${track.cover}`}
              style={{
                width: 80,
                height: 80,
                borderRadius: 6,
                marginRight: 10,
                objectFit: "cover",
                flexShrink: 0,
              }}/>
          )}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <AutoScrollText
                text={track?.title ?? "No track selected"}
                style={{ fontWeight: 600 }}/>
              <AutoScrollText
                text={track?.artist ?? "Unknown artist"}
                style={{ fontSize: 12, opacity: 0.75 }}/>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, textAlign: "center" }}>
            {track?.samplerate && `${(track.samplerate / 1000).toFixed(1)} kHz`}
            {track?.channels && ` / ${track.channels} ch${track.channels > 1 ? "s" : ""}`}
            {track?.bitrate && ` / ${Math.round(track.bitrate)} kbps`}
            {track?.bitdepth && ` / ${track.bitdepth}bit`}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "0px" }}>
          <SliderField
            label=""
            value={progress}
            min={0}
            max={ready ? duration : 1}
            step={0.5}
            showValue={false}
            disabled={!ready || error}
            onChange={handleSeek}/>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "4px",
              fontSize: 12,
            }}>
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </PanelSectionRow>
      <Focusable style={{ marginTop: "10px", marginBottom: "10px", display: "flex", width: "100%", }} flow-children="horizontal">
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginRight: "4px" }} onClick={prevTrack}>
          <FaBackwardStep/>
        </DialogButton>
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginRight: "4px", marginLeft: "4px", }} onClick={togglePlay}>
          {playing ? <FaPause /> : <FaPlay />}
        </DialogButton>
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginLeft: "4px", }} onClick={nextTrack}>
          <FaForwardStep/>
        </DialogButton>
      </Focusable>
      <PanelSectionRow>
        <SliderField
          label={`Volume (${Math.round(volume * 100)}%)`}
          value={volume}
          min={0}
          max={1}
          step={0.05}
          showValue={false}
          onChange={handleVolumeChange}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}
