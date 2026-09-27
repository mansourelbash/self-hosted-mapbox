import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeaker } from "./voice-guidance.js";
import { createServerSpeaker } from "./server-speaker.js";
const SERVER_VOICE = {
  voiceURI: "self-hosted-ar",
  name: "كريم — عربي أردني",
  lang: "ar-JO",
  localService: true,
  server: true,
};

export function useVoice() {
  const [voices, setVoices] = useState([SERVER_VOICE]),
    [selected, setSelected] = useState(SERVER_VOICE.voiceURI),
    [status, setStatus] = useState("الصوت جاهز");
  const speaker = useRef(null);
  const server = useRef(null);
  if (!server.current)
    server.current = createServerSpeaker({ onStatus: setStatus });
  if (!speaker.current)
    speaker.current = createSpeaker(
      window.speechSynthesis,
      window.SpeechSynthesisUtterance,
      setStatus,
    );
  useEffect(() => {
    const synth = window.speechSynthesis;
    const refresh = () => {
      const arabic = (synth?.getVoices() || [])
        .filter((v) => /^ar(?:[-_]|$)/i.test(v.lang))
        .sort((a, b) => Number(b.localService) - Number(a.localService));
      setVoices([SERVER_VOICE, ...arabic]);
    };
    refresh();
    synth?.addEventListener("voiceschanged", refresh);
    return () => {
      synth?.removeEventListener("voiceschanged", refresh);
      speaker.current.cancel();
      server.current.dispose();
    };
  }, []);
  const chosen = voices.find((v) => v.voiceURI === selected) || voices[0];
  const speak = useCallback(
    (text, interrupt = false) =>
      chosen.server
        ? server.current.speak(text, interrupt)
        : speaker.current.speak(text, chosen, interrupt),
    [chosen],
  );
  const cancel = useCallback(() => {
    speaker.current.cancel();
    server.current.cancel();
  }, []);
  return {
    voices,
    selected: chosen?.voiceURI || "",
    setSelected,
    status,
    speak,
    cancel,
  };
}
