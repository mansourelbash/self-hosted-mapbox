export function distance(a, b) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function parsePoint(value) {
  const parts = value.split(",").map((v) => v.trim());
  if (parts.length !== 2 || parts.some((v) => !v))
    throw new Error("أدخل خط الطول، خط العرض مثل 35.9106, 31.9539");
  const p = parts.map(Number);
  if (!p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
    throw new Error("الإحداثيات غير صالحة");
  return p;
}
export const meters = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} كم` : `${Math.round(n)} م`;
export function instruction(step) {
  const m = step.maneuver;
  const modifiers = {
    right: "يمينًا",
    left: "يسارًا",
    "slight right": "قليلًا إلى اليمين",
    "slight left": "قليلًا إلى اليسار",
    "sharp right": "بحدة يمينًا",
    "sharp left": "بحدة يسارًا",
    straight: "مباشرة",
    uturn: "للعودة في الاتجاه المعاكس",
  };
  const way = step.name ? ` إلى ${step.name}` : "";
  if (m.type === "arrive") return "وصلت إلى وجهتك";
  if (m.type === "depart") return `ابدأ السير${way}`;
  if (["roundabout", "rotary", "roundabout turn"].includes(m.type))
    return `ادخل الدوار${m.exit ? ` وخذ المخرج ${m.exit}` : ""}${way}`;
  if (["exit roundabout", "exit rotary"].includes(m.type))
    return `اخرج من الدوار${way}`;
  const verbs = {
    turn: "انعطف",
    merge: "اندمج",
    fork: "عند التفرع اتجه",
    "on ramp": "ادخل المنحدر",
    "off ramp": "اخرج عبر المنحدر",
    "end of road": "عند نهاية الطريق اتجه",
  };
  return `${verbs[m.type] || "تابع"} ${modifiers[m.modifier] || "على الطريق"}${way}`;
}
// Project onto every segment, rather than vertices, to avoid false off-route events.
export function project(point, coordinates) {
  const scaleX = 111320 * Math.cos((point[1] * Math.PI) / 180),
    scaleY = 111320;
  let best = { distance: Infinity, along: 0 },
    cumulative = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i];
    const x = (b[0] - a[0]) * scaleX,
      y = (b[1] - a[1]) * scaleY;
    const px = (point[0] - a[0]) * scaleX,
      py = (point[1] - a[1]) * scaleY;
    const t = Math.max(
      0,
      Math.min(1, (px * x + py * y) / (x * x + y * y || 1)),
    );
    const d = Math.hypot(px - t * x, py - t * y),
      len = distance(a, b);
    if (d < best.distance) best = { distance: d, along: cumulative + t * len };
    cumulative += len;
  }
  return { ...best, total: cumulative };
}
export function prepareRoute(route) {
  let offset = 0;
  const steps = route.legs
    .flatMap((l) => l.steps)
    .map((s) => {
      const start = offset;
      for (let i = 1; i < s.geometry.coordinates.length; i++)
        offset += distance(
          s.geometry.coordinates[i - 1],
          s.geometry.coordinates[i],
        );
      return { ...s, start };
    });
  return { ...route, steps };
}
export async function fetchRoute(start, end, signal) {
  const response = await fetch(
    `/routing/route/v1/driving/${start.join(",")};${end.join(",")}?steps=true&overview=full&geometries=geojson`,
    { signal },
  );
  if (!response.ok)
    throw new Error("تعذر حساب المسار حاليًا. أعد المحاولة بعد قليل.");
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length)
    throw new Error(
      "لا يوجد مسار قابل للقيادة بين النقطتين ضمن البيانات المتاحة.",
    );
  return prepareRoute(data.routes[0]);
}
