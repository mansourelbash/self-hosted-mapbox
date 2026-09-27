import { distance, instruction } from "./navigation.js";

// OSRM lanes are ordered left to right. Only use the maneuver's intersection;
// a later intersection on the same step can have different lane requirements.
export function laneInstruction(step) {
  const junction = step.intersections?.[0];
  const lanes = junction?.lanes;
  if (
    !lanes ||
    lanes.length < 2 ||
    !junction.location ||
    !step.maneuver.location ||
    distance(junction.location, step.maneuver.location) > 5
  )
    return "";
  const valid = lanes.flatMap((lane, i) => (lane.valid === true ? [i] : []));
  if (!valid.length || valid.length === lanes.length) return "";
  const contiguous = valid.every(
    (value, i) => !i || value === valid[i - 1] + 1,
  );
  if (!contiguous) return "";
  if (valid.at(-1) === lanes.length - 1)
    return valid.length === 1
      ? "خذ المسرب الأيمن"
      : `استخدم أحد المسارب اليمنى، وعددها ${valid.length}`;
  if (valid[0] === 0)
    return valid.length === 1
      ? "خذ المسرب الأيسر"
      : `استخدم أحد المسارب اليسرى، وعددها ${valid.length}`;
  if (
    valid.length === 1 &&
    lanes.length % 2 === 1 &&
    valid[0] === Math.floor(lanes.length / 2)
  )
    return "خذ المسرب الأوسط";
  return `استخدم المسرب رقم ${valid[0] + 1} من اليسار`;
}

export function navigationCue(route, along, arrived = false) {
  if (!route?.steps.length || along === null) return null;
  if (arrived)
    return {
      key: "arrived",
      text: "وصلت إلى وجهتك. انتهت الرحلة.",
      urgent: true,
    };
  // Announce the upcoming maneuver BEFORE reaching it, not the step already passed.
  const next = route.steps.findIndex((step, i) => i > 0 && step.start > along);
  if (next < 0) return null;
  const step = route.steps[next],
    remaining = Math.max(0, step.start - along);
  const stage =
    remaining <= 20
      ? "now"
      : remaining <= 50
        ? "near"
        : remaining <= 200
          ? "prepare"
          : "preview";
  const spokenDistance =
    remaining >= 1000
      ? `${(remaining / 1000).toFixed(1)} كيلومتر`
      : `${Math.max(10, Math.round(remaining / 10) * 10)} متر`;
  const action =
    step.maneuver.type === "arrive" ? "ستكون وجهتك أمامك" : instruction(step);
  const lane = remaining <= 200 ? laneInstruction(step) : "";
  const text = `${stage === "now" ? "الآن" : `بعد ${spokenDistance}`}، ${action}.${lane ? ` ${lane}.` : ""}`;
  return { key: `${next}:${stage}`, text, urgent: stage === "now", remaining };
}

export function pointAlong(coordinates, along) {
  let passed = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i],
      length = distance(a, b);
    if (passed + length >= along) {
      const t = length ? Math.max(0, (along - passed) / length) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    passed += length;
  }
  return coordinates.at(-1);
}

export function createSpeaker(synth, Utterance, onStatus) {
  let current = null;
  return {
    cancel() {
      current = null;
      synth?.cancel();
    },
    speak(text, voice, interrupt = false) {
      if (!synth || !Utterance) {
        onStatus("المتصفح لا يدعم النطق الصوتي.");
        return false;
      }
      if (!voice) {
        onStatus(
          "لا يوجد صوت عربي متاح. أضف صوتًا عربيًا في إعدادات الجهاز ثم أعد تحميل الصفحة.",
        );
        return false;
      }
      if (current && !interrupt) return false;
      if (interrupt) {
        current = null;
        synth.cancel();
      }
      const utterance = new Utterance(text);
      current = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      utterance.volume = 1;
      utterance.onstart = () => {
        if (current === utterance) onStatus("جارٍ النطق…");
      };
      utterance.onend = () => {
        if (current === utterance) {
          current = null;
          onStatus("الصوت جاهز");
        }
      };
      utterance.onerror = (e) => {
        if (current !== utterance) return;
        current = null;
        onStatus(
          e.error === "not-allowed"
            ? "اضغط «تجربة الصوت» للسماح بالنطق."
            : `تعذر النطق (${e.error}). جرّب صوتًا آخر.`,
        );
      };
      try {
        synth.resume();
        synth.speak(utterance);
        return true;
      } catch {
        current = null;
        onStatus("تعذر تشغيل الصوت. اضغط «تجربة الصوت» للمحاولة.");
        return false;
      }
    },
  };
}
