import assert from "node:assert/strict";
const health = await fetch("http://localhost:5173/speech/health");
assert.equal(health.status, 200);
const response = await fetch("http://localhost:5173/speech/speak", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "بعد مئتي متر، انعطف يمينًا. خذ المسرب الأيمن.",
  }),
});
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /audio\/wav/);
const wav = Buffer.from(await response.arrayBuffer());
assert.equal(wav.toString("ascii", 0, 4), "RIFF");
assert.equal(wav.toString("ascii", 8, 12), "WAVE");
let data, rate, channels, bits;
for (let offset = 12; offset + 8 <= wav.length;) {
  const type = wav.toString("ascii", offset, offset + 4),
    size = wav.readUInt32LE(offset + 4);
  if (type === "fmt ") {
    channels = wav.readUInt16LE(offset + 10);
    rate = wav.readUInt32LE(offset + 12);
    bits = wav.readUInt16LE(offset + 22);
  }
  if (type === "data") data = wav.subarray(offset + 8, offset + 8 + size);
  offset += 8 + size + (size % 2);
}
assert.equal(bits, 16);
assert.ok(data?.length > 2000);
let peak = 0;
for (let i = 0; i + 1 < data.length; i += 2)
  peak = Math.max(peak, Math.abs(data.readInt16LE(i)));
assert.ok(peak > 100, "Audio must not be silent");
console.log(
  JSON.stringify({
    voice: (await health.json()).voice,
    seconds: (data.length / ((rate * channels * bits) / 8)).toFixed(2),
    sampleRate: rate,
    peak,
    bytes: wav.length,
  }),
);
const invalid = await fetch("http://localhost:5173/speech/speak", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: '{"text":""}',
});
assert.equal(invalid.status, 400);
console.log(
  "Arabic WAV generation through the application proxy and input validation passed.",
);
