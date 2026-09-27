import { test } from "node:test";
import assert from "node:assert/strict";
import { createServerSpeaker } from "../src/server-speaker.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fakeContext() {
  const sources = [];
  return {
    state: "running",
    destination: {},
    sources,
    resume: async () => {},
    close: async () => {},
    decodeAudioData: async () => ({}),
    createBufferSource() {
      const source = {
        connect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
  };
}
test("local speech plays without OS voices and prevents overlapping requests", async () => {
  const context = fakeContext();
  let request;
  const speaker = createServerSpeaker({
    makeContext: () => context,
    onStatus() {},
    fetchAudio: async (url, options) => {
      request = { url, ...options };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    },
  });
  assert.equal(speaker.speak("خذ المسرب الأيمن"), true);
  assert.equal(speaker.speak("نص آخر"), false);
  await flush();
  assert.equal(request.url, "/speech/speak");
  assert.equal(JSON.parse(request.body).text, "خذ المسرب الأيمن");
  assert.equal(context.sources[0].started, true);
  speaker.cancel();
  assert.equal(context.sources[0].stopped, true);
});
test("cancel while downloading suppresses late playback", async () => {
  const context = fakeContext();
  let finish;
  const speaker = createServerSpeaker({
    makeContext: () => context,
    onStatus() {},
    fetchAudio: () => new Promise((resolve) => (finish = resolve)),
  });
  speaker.speak("يمين");
  await flush();
  speaker.cancel();
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  await flush();
  assert.equal(context.sources.length, 0);
});
test("failed local service reports failure and allows retry", async () => {
  let status = "";
  const context = fakeContext();
  const speaker = createServerSpeaker({
    makeContext: () => context,
    onStatus: (s) => (status = s),
    fetchAudio: async () => ({ ok: false, status: 500 }),
  });
  speaker.speak("يمين");
  await flush();
  assert.match(status, /تعذر تشغيل خدمة الصوت/);
  assert.equal(speaker.speak("يمين"), true);
  await flush();
  speaker.dispose();
});
