// Resume audio in the click handler, before awaiting local speech synthesis.
export function createServerSpeaker({
  fetchAudio = fetch,
  makeContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  onStatus,
}) {
  let context,
    controller,
    source,
    busy = false,
    generation = 0;
  function cancel() {
    generation++;
    controller?.abort();
    controller = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source = null;
    }
    busy = false;
  }
  return {
    cancel,
    dispose() {
      cancel();
      context?.close();
    },
    speak(text, interrupt = false) {
      if (busy && !interrupt) return false;
      cancel();
      const id = generation;
      try {
        context ||= makeContext();
      } catch {
        onStatus("المتصفح لا يدعم تشغيل الصوت.");
        return false;
      }
      busy = true;
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = setTimeout(() => {
        if (id === generation) {
          cancel();
          onStatus("تأخر تشغيل الصوت. اضغط «تجربة الصوت» للمحاولة مجددًا.");
        }
      }, 30000);
      onStatus("جارٍ تجهيز الصوت…");
      const resumed = context.resume();
      (async () => {
        try {
          await resumed;
          if (id !== generation) return;
          let response;
          for (let retry = 0; retry < 4; retry++) {
            response = await fetchAudio("/speech/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text }),
              signal,
            });
            if (response.status !== 503) break;
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (signal.aborted) throw new Error("aborted");
          }
          if (!response.ok) throw new Error("server");
          const buffer = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (id !== generation) return;
          clearTimeout(timeout);
          if (context.state !== "running") throw new Error("blocked");
          source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.onended = () => {
            if (id === generation) {
              busy = false;
              source = null;
              onStatus("الصوت جاهز");
            }
          };
          source.start();
          onStatus("جارٍ النطق بالعربية…");
        } catch (error) {
          if (id !== generation) return;
          busy = false;
          onStatus(
            error.message === "blocked" || error.name === "NotAllowedError"
              ? "اضغط «تجربة الصوت» لتفعيل تشغيل الصوت."
              : "تعذر تشغيل خدمة الصوت. أعد المحاولة بعد قليل.",
          );
        } finally {
          clearTimeout(timeout);
        }
      })();
      return true;
    },
  };
}
