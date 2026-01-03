import { definePlugin, callable } from "@decky/api";
import { PanelSection, PanelSectionRow, SliderField, Focusable, DialogButton, ModalRoot, showModal } from "@decky/ui";
import { useState, useEffect, useRef } from "react";
import { FaPlay, FaPause } from "react-icons/fa";
import { FaBackwardStep, FaForwardStep } from "react-icons/fa6";
import { MdInfoOutline, MdOutlineRepeat, MdOutlineRepeatOn, MdShuffle, MdShuffleOn, MdOutlinePlaylistPlay } from "react-icons/md";

type TrackInfo = {
  index: number;
  title: string;
  artist?: string;
  album?: string;
  albumartist?: string;
  disc?: number;
  disc_total?: number;
  track?: number;
  track_total?: number;
  genre?: string;
  year?: number;
  duration?: number;
  mime_type?: string;
  full_path?: string;
  filesize?: number;
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
const getTrackMetadata = callable<[number], TrackInfo>("get_track_metadata");
const getInitialTrack = callable<[], number>("get_initial_track");
const getVolume = callable<[], number>("get_volume");
const setVolume = callable<[number], void>("set_volume");
const getRepeat = callable<[], boolean>("get_repeat");
const setRepeat = callable<[boolean], void>("set_repeat");

let audio: HTMLAudioElement | null = null;

export default definePlugin(() => ({name: "SimpleAudio", icon: <FaPlay/>,content: <Content/>}));

function AutoScrollText({ text, style }: { text: string; style?: React.CSSProperties; }) {
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
    <div ref={containerRef} style={{overflow: "hidden", whiteSpace: "nowrap", width: "100%"}}>
      <div ref={textRef} key={text} style={{ display: "inline-block", animation: shouldScroll  ? `scrollText ${animationDuration}s linear infinite`: "none", ...style,}}>
        {text}
      </div>
      <style>
        {` @keyframes scrollText {0% { transform: translateX(0); } 100% { transform: translateX(-100%); }} `}
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
  const [repeat, setRepeatState] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const isSeekingRef = useRef(false);
  const currentRef = useRef(current);
  const repeatRef = useRef(repeat);
  const playlistRef = useRef<TrackInfo[]>(playlist);
  
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    (async () => {
      const list = await getPlaylist();
      const initial = await getInitialTrack();
      const vol = await getVolume();
      const rep = await getRepeat();
      setPlaylist(list);
      setCurrent(initial);
      setVolumeState(vol);
      setRepeatState(rep);
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

    const onEnded = async () => {
      if (!audio) return;

      if (repeatRef.current) {
        audio.currentTime = 0;
        await audio.play();
        return;
      }

      const nextIndex = currentRef.current + 1;
      if (nextIndex < playlistRef.current.length) {
        await playTrack(nextIndex);
      } else {
        setPlaying(false);
      }
    };

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
    (async () => {
      const track = await loadTrack(current);
      updatePlaylistTrack(track);
      if (!audio.src) {
        audio.src = track.url!;
        audio.load();
      }
    })();
  }, [playlist, initialized]);

  const updatePlaylistTrack = (track: TrackInfo) => {
    setPlaylist(prev => {
      const copy = [...prev];
      copy[track.index] = { ...copy[track.index], ...track };
      return copy;
    });
  };
  
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
    updatePlaylistTrack(track);
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
    updatePlaylistTrack(track);
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

  const nextTrack = async () => {
    if (current + 1 >= playlist.length) return;
    if (playing) {
      await playTrack(current + 1);
    } else {
      await loadTrackSilently(current + 1);
    }
  };

  const prevTrack = async () => {
    if (current <= 0) return;
    if (playing) {
      await playTrack(current - 1);
    } else {
      await loadTrackSilently(current - 1);
    }
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

  const toggleRepeat = async () => {
    const next = !repeat;
    setRepeatState(next);
    await setRepeat(next);
  };

  const showPlaylistModal = async () => {
    const updatedPlaylist = await Promise.all(
      playlist.map(async (track) => {
        if (!track.cover) {
          try {
            const meta = await getTrackMetadata(track.index);
            return { ...track, ...meta };
          } catch {
            return track;
          }
        }
        return track;
      })
    );
    setPlaylist(updatedPlaylist);
    showModal(
      <PlaylistModal
        playlist={updatedPlaylist}
        current={current}
        playing={playing}
        onSelect={async (index) => {
          if (playing) {
            await playTrack(index);
          } else {
            await loadTrackSilently(index);
          }
        }}
      />
    );
  };

  function PlaylistModal({playlist, current, playing, onSelect, closeModal}: {playlist: TrackInfo[]; current: number; playing: boolean; onSelect: (index: number) => void; closeModal?: () => void}) {
    return (
      <ModalRoot onCancel={closeModal} onOK={closeModal}>
        <div style={{maxHeight: "65vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6,}}>
          {playlist.map((track, index) => {
            const isCurrent = index === current;
            return (
              <Focusable key={index} onActivate={() => { onSelect(index); closeModal?.();}}>
                <div style={{display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: isCurrent? "rgba(0, 200, 255, 0.2)": "transparent",transition: "background 0.15s"}}>
                  <div style={{ width: 40, height: 40, marginRight: 10, flexShrink: 0 }}>
                    {track.cover && track.cover_mime ? (<img src={`data:${track.cover_mime};base64,${track.cover}`} style={{width: "100%",height: "100%",objectFit: "cover",borderRadius: 4,}}/>
                    ) : (
                      <div style={{width: "100%", height: "100%", background: "#444", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 12}}>
                        ?
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isCurrent ? 600 : 400 }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {track.artist ?? "Unknown artist"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, "0")}`: "--:--"}
                  </div>
                </div>
              </Focusable>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <DialogButton onClick={closeModal}>Close</DialogButton>
        </div>
      </ModalRoot>
    );
  }

  const showTrackMetadataModal = (track: TrackInfo) => { showModal(<TrackMetadataModal track={track} />,undefined); };

  function TrackMetadataModal({ track, closeModal }: { track: TrackInfo; closeModal?: () => void }) {
    return (
      <ModalRoot onCancel={closeModal} onOK={closeModal}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxHeight: "80vh", overflowY: "auto", marginBottom: "8px", gap: 16, borderRadius: 12}}>
          <Focusable onClick={() => {}} onActivate={() => {}}>
            <div tabIndex={0} style={{fontSize: 22, fontWeight: 600,textAlign: "center",width: "100%",cursor: "pointer", borderRadius: 4, padding: "2px 0",transition: "background 0.2s"}}>Cover art</div>
          </Focusable>
          {track.cover && track.cover_mime && (<img src={`data:${track.cover_mime};base64,${track.cover}`} style={{maxHeight: 200, width: "auto", maxWidth: "100%", borderRadius: 12, objectFit: "contain"}}/>)}
          <Focusable onClick={() => {}} onActivate={() => {}}>
            <div tabIndex={0} style={{fontSize: 22, fontWeight: 600, textAlign: "center", width: "100%", cursor: "pointer", borderRadius: 4, padding: "2px 0", transition: "background 0.2s"}}>Details</div>
          </Focusable>
        </div>
          <div style={{ fontSize: 16, lineHeight: 1.6, width: "100%", textAlign: "left"}}> 
            {<div><b>Title:</b> {track.title || "Unknown title"}</div>} 
            {<div><b>Artist:</b> {track.artist || "Unknown artist"}</div>} 
            {<div><b>Album:</b> {track.album || "None"}</div>} 
            {<div><b>Album Artist:</b> {track.albumartist || "Unknown artist"}</div>} 
            {(<div><b>Track:</b> {track.track || "0"} / {track.track_total || "0"}</div>)} 
            {(<div><b>Disc:</b> {track.disc || "0"} / {track.disc_total || "0"}</div>)} 
            {<div><b>Genre:</b> {track.genre || "Unknown genre"}</div>} 
            {<div><b>Year:</b> {track.year || "Unknown year"}</div>} 
            {track.duration && (<div><b>Duration:</b> {Math.floor(track.duration / 60)}:{Math.floor(track.duration % 60).toString().padStart(2, "0")}</div> )} 
            {track.mime_type && <div><b>MIME Type:</b> {track.mime_type}</div>} 
            {track.full_path && (<div><b>Path:</b> {track.full_path}</div>)}
            {track.filesize && (<div><b>Size:</b> {(track.filesize / 1_000_000).toFixed(2)} MB</div>)}
          </div>
        <div style={{ marginTop: 16 }}>
          <DialogButton onClick={closeModal}>Close</DialogButton>
        </div>
      </ModalRoot>
    );
  }

  const track = playlist[current];

  return (
    <PanelSection>
      <PanelSectionRow>
        <div style={{display: "flex",alignItems: "center",width: "100%",marginLeft: -14}}>
          {track?.cover && track?.cover_mime && (<img src={`data:${track.cover_mime};base64,${track.cover}`} style={{width: 80, height: 80, borderRadius: 6, marginRight: 10, objectFit: "cover",flexShrink: 0,}}/>)}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <AutoScrollText text={track?.title ?? "No track selected"}style={{ fontWeight: 600 }}/>
              <AutoScrollText text={track?.artist ?? "Unknown artist"}style={{ fontSize: 12, opacity: 0.75 }}/>
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
          <SliderField label="" value={progress} min={0} max={ready ? duration : 1} step={0.5} showValue={false} disabled={!ready || error} onChange={handleSeek}/>
          <div style={{display: "flex", justifyContent: "space-between", marginTop: "4px",fontSize: 12}}>
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
      <Focusable style={{ marginTop: "10px", marginBottom: "10px", display: "flex", width: "100%", }} flow-children="horizontal">
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginRight: "4px" }} onClick={() => track && showTrackMetadataModal(track)}>
          <MdInfoOutline/>
        </DialogButton>
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginRight: "4px", marginLeft: "4px", }} onClick={toggleRepeat}>
          {repeat ? <MdOutlineRepeatOn /> : <MdOutlineRepeat />}
        </DialogButton>
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginRight: "4px", marginLeft: "4px", }} onClick={togglePlay}>
          <MdShuffle/>
        </DialogButton>
        <DialogButton style={{ flex: 1, height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, minWidth: 0, marginLeft: "4px", }} onClick={showPlaylistModal}>
          <MdOutlinePlaylistPlay/>
        </DialogButton>
      </Focusable>
      <PanelSectionRow>
        <SliderField label={`Volume (${Math.round(volume * 100)}%)`} value={volume} min={0} max={1} step={0.05} showValue={false} onChange={handleVolumeChange}/>
      </PanelSectionRow>
    </PanelSection>
  );
}
