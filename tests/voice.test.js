import { test } from "node:test";
import assert from "node:assert/strict";
import {
  laneInstruction,
  navigationCue,
  pointAlong,
  createSpeaker,
} from "../src/voice-guidance.js";

function turn(valid, type = "turn") {
  return {
    maneuver: { type, modifier: "right", location: [35, 32] },
    intersections: [
      { location: [35, 32], lanes: valid?.map((v) => ({ valid: v })) },
    ],
  };
}
test("lane guidance requires actual lanes and preserves left-to-right ordering", () => {
  assert.equal(laneInstruction(turn([false, false, true])), "خذ المسرب الأيمن");
  assert.equal(laneInstruction(turn([true, false, false])), "خذ المسرب الأيسر");
  assert.equal(laneInstruction(turn([false, true, false])), "خذ المسرب الأوسط");
  for (const flags of [
    undefined,
    [],
    [true],
    [true, true],
    [false, false],
    [true, false, true],
  ])
    assert.equal(laneInstruction(turn(flags)), "");
  const later = turn([false, true]);
  later.intersections[0].location = [35.01, 32];
  assert.equal(laneInstruction(later), "");
});
const route = {
  steps: [
    { ...turn(undefined, "depart"), start: 0 },
    { ...turn([false, true]), start: 1000 },
    { ...turn(undefined, "arrive"), start: 2000 },
  ],
};
test("speaks upcoming maneuver at distance stages, without announcing arrival early", () => {
  assert.equal(navigationCue(route, null), null);
  const far = navigationCue(route, 100),
    near = navigationCue(route, 810),
    closer = navigationCue(route, 960),
    now = navigationCue(route, 985);
  assert.match(far.text, /بعد 900 متر، انعطف يمينًا/);
  assert.doesNotMatch(far.text, /المسرب/);
  assert.match(near.text, /خذ المسرب الأيمن/);
  assert.equal(near.key, navigationCue(route, 820).key);
  assert.notEqual(near.key, closer.key);
  assert.equal(now.urgent, true);
  assert.match(now.text, /الآن/);
  assert.match(navigationCue(route, 1100).text, /ستكون وجهتك أمامك/);
  assert.doesNotMatch(navigationCue(route, 1100).text, /وصلت/);
  assert.match(navigationCue(route, 2000, true).text, /وصلت إلى وجهتك/);
});
test("simulation interpolates long segments to avoid skipping announcements", () => {
  const point = pointAlong(
    [
      [35, 32],
      [35.01, 32],
    ],
    100,
  );
  assert.ok(point[0] > 35 && point[0] < 35.002);
  assert.deepEqual(
    pointAlong(
      [
        [35, 32],
        [35.01, 32],
      ],
      10000,
    ),
    [35.01, 32],
  );
});
test("speaker selects Arabic, avoids overlapping speech, interrupts urgent cues and cancels cleanly", () => {
  const utterances = [],
    statuses = [];
  let cancellations = 0;
  const synth = {
    speak: (u) => utterances.push(u),
    cancel: () => cancellations++,
    resume: () => {},
  };
  const speaker = createSpeaker(
    synth,
    class {
      constructor(text) {
        this.text = text;
      }
    },
    (s) => statuses.push(s),
  );
  const voice = { lang: "ar-JO", voiceURI: "test" };
  assert.equal(speaker.speak("يمين", voice), true);
  assert.equal(utterances[0].voice, voice);
  assert.equal(utterances[0].lang, "ar-JO");
  assert.equal(speaker.speak("يسار", voice), false);
  assert.equal(speaker.speak("الآن", voice, true), true);
  assert.equal(cancellations, 1);
  utterances[0].onerror({ error: "interrupted" });
  assert.deepEqual(statuses, []);
  utterances[1].onend();
  assert.equal(speaker.speak("وجهتك", voice), true);
  speaker.cancel();
  assert.equal(cancellations, 2);
});
test("speaker clearly reports missing Arabic voice, unsupported browser and blocked playback", () => {
  let status = "";
  assert.equal(
    createSpeaker(null, null, (s) => (status = s)).speak("تجربة"),
    false,
  );
  assert.match(status, /لا يدعم/);
  let utterance;
  const speaker = createSpeaker(
    {
      resume() {},
      speak(u) {
        utterance = u;
      },
      cancel() {},
    },
    class {},
    (s) => (status = s),
  );
  assert.equal(speaker.speak("تجربة"), false);
  assert.match(status, /لا يوجد صوت عربي/);
  speaker.speak("تجربة", { lang: "ar" });
  utterance.onerror({ error: "not-allowed" });
  assert.match(status, /تجربة الصوت/);
});
