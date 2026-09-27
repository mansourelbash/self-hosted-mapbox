import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./style.css";
import Icon from "./Icon.jsx";
import { navigationCue, pointAlong } from "./voice-guidance.js";
import { useVoice } from "./useVoice.js";
import {
  fetchRoute,
  parsePoint,
  instruction,
  meters,
  project,
  distance,
} from "./navigation";

function App() {
  const [start, setStart] = useState("35.9106, 31.9539");
  const [destination, setDestination] = useState("35.8980, 31.9854");
  const [route, setRoute] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("idle"),
    [index, setIndex] = useState(0),
    [remaining, setRemaining] = useState(0),
    [voice, setVoice] = useState(true),
    [along, setAlong] = useState(null),
    [pick, setPick] = useState("end");
  const container = useRef(null),
    map = useRef(null),
    markers = useRef([]),
    positionMarker = useRef(null),
    request = useRef(null),
    watch = useRef(null),
    timer = useRef(null),
    routeRef = useRef(null),
    modeRef = useRef("idle"),
    lastReroute = useRef(0),
    progress = useRef(0),
    pickRef = useRef("end"),
    endRef = useRef(destination),
    spoken = useRef(new Set());
  const audio = useVoice();
  const cue = navigationCue(route, along, mode === "arrived");
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
      clearInterval(timer.current);
      request.current?.abort();
    },
    [],
  );
  function stop() {
    modeRef.current = "idle";
    setMode("idle");
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    clearInterval(timer.current);
    timer.current = null;
    audio.cancel();
    spoken.current.clear();
  }
  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);
  useEffect(() => {
    endRef.current = destination;
  }, [destination]);
  useEffect(() => {
    if (!token || token.includes("your_public")) return;
    const m = new mapboxgl.Map({
      container: container.current,
      accessToken: token,
      style: "mapbox://styles/mapbox/light-v11",
      center: [35.91, 31.965],
      zoom: 12.5,
    });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl(), "bottom-left");
    m.on("error", () =>
      setError("تعذر تحميل الخريطة. تحقق من الاتصال وأعد المحاولة."),
    );
    m.on("click", (e) => {
      if (modeRef.current !== "idle") return;
      const v = `${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}`;
      if (pickRef.current === "start") setStart(v);
      else setDestination(v);
    });
    return () => {
      stop();
      request.current?.abort();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    request.current?.abort();
    setBusy(false);
    setRoute(null);
    routeRef.current = null;
    setIndex(0);
    setMode("idle");
  }, [start, destination]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const data = {
        type: "Feature",
        properties: {},
        geometry: route?.geometry || { type: "LineString", coordinates: [] },
      };
      if (m.getSource("route")) m.getSource("route").setData(data);
      else {
        m.addSource("route", { type: "geojson", data });
        m.addLayer({
          id: "route-outline",
          type: "line",
          source: "route",
          paint: { "line-color": "#fff", "line-width": 10 },
        });
        m.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#146c43", "line-width": 6 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      markers.current.forEach((v) => v.remove());
      markers.current = [];
      try {
        [parsePoint(start), parsePoint(destination)].forEach((p, i) =>
          markers.current.push(
            new mapboxgl.Marker({ color: i ? "#b79148" : "#146c43" })
              .setLngLat(p)
              .addTo(m),
          ),
        );
      } catch {}
      if (route) {
        const bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach((p) => bounds.extend(p));
        m.fitBounds(bounds, { padding: 70, maxZoom: 15 });
      }
    };
    if (m.isStyleLoaded()) draw();
    else m.once("load", draw);
    return () => m.off("load", draw);
  }, [route, start, destination]);
  async function calculate(from, rerouting = false) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const r = await fetchRoute(
        from || parsePoint(start),
        parsePoint(endRef.current),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      routeRef.current = r;
      setRoute(r);
      progress.current = 0;
      setIndex(0);
      setRemaining(r.distance);
      spoken.current.clear();
      setAlong(null);
      audio.cancel();
      return r;
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        if (rerouting) stop();
      }
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  function updatePosition(p, accuracy = 0) {
    const r = routeRef.current;
    if (!r) return;
    if (accuracy > 50) {
      setAlong(null);
      audio.cancel();
      setError("إشارة الموقع ضعيفة. انتظر حتى تتحسن الدقة.");
      return;
    }
    setError("");
    const match = project(p, r.geometry.coordinates);
    if (map.current) {
      if (!positionMarker.current)
        positionMarker.current = new mapboxgl.Marker({ color: "#4276db" })
          .setLngLat(p)
          .addTo(map.current);
      else positionMarker.current.setLngLat(p);
      map.current.easeTo({ center: p, duration: 700 });
    }
    if (match.distance > 65 && modeRef.current === "gps") {
      setAlong(null);
      if (Date.now() - lastReroute.current > 10000) {
        lastReroute.current = Date.now();
        calculate(p, true);
      }
      return;
    }
    progress.current = Math.max(progress.current, match.along);
    setAlong(progress.current);
    setRemaining(Math.max(0, match.total - progress.current));
    let next = 0;
    while (
      next < r.steps.length - 1 &&
      r.steps[next + 1].start <= progress.current
    )
      next++;
    setIndex(next);
    if (
      match.total - progress.current < 25 &&
      distance(p, r.geometry.coordinates.at(-1)) < 30
    ) {
      setIndex(r.steps.length - 1);
      setRemaining(0);
      stop();
      setMode("arrived");
    }
  }
  function simulate() {
    stop();
    modeRef.current = "simulation";
    setMode("simulation");
    progress.current = 0;
    if (voice) audio.speak("بدأت محاكاة الرحلة. اتبع الإرشادات الصوتية.", true);
    let simulatedDistance = 0;
    const coords = routeRef.current.geometry.coordinates;
    const total = project(coords[0], coords).total;
    updatePosition(coords[0]);
    timer.current = setInterval(() => {
      simulatedDistance = Math.min(total, simulatedDistance + 12);
      updatePosition(pointAlong(coords, simulatedDistance));
    }, 1000);
  }
  function navigate() {
    if (!navigator.geolocation) {
      setError("هذا المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    stop();
    setAlong(null);
    if (voice) audio.speak("بدأت الملاحة. جارٍ تحديد موقعك.", true);
    modeRef.current = "gps";
    setMode("gps");
    let first = true;
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (modeRef.current !== "gps") return;
        const p = [pos.coords.longitude, pos.coords.latitude];
        if (first) {
          if (pos.coords.accuracy > 50) {
            setError("جارٍ تحديد موقعك بدقة…");
            return;
          }
          first = false;
          const r = await calculate(p, true);
          if (!r || modeRef.current !== "gps") return;
        }
        updatePosition(p, pos.coords.accuracy);
      },
      (e) => {
        setError(`تعذر تحديد الموقع: ${e.message}`);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }
  useEffect(() => {
    if (!voice || !["gps", "simulation", "arrived"].includes(mode) || !cue)
      return;
    if (spoken.current.has(cue.key)) return;
    if (audio.speak(cue.text, cue.urgent)) spoken.current.add(cue.key);
  }, [along, mode, voice, cue?.key, audio.speak]);
  const active = mode === "gps" || mode === "simulation";
  function showRoute() {
    if (!map.current || !route) return;
    const bounds = new mapboxgl.LngLatBounds();
    route.geometry.coordinates.forEach((point) => bounds.extend(point));
    map.current.fitBounds(bounds, { padding: 70, maxZoom: 15 });
  }
  return (
    <div className="app">
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="route" size={25} />
          </span>
          <strong>
            مسار<small>MASAR</small>
          </strong>
        </a>
    
       
      </header>
      <main>
        <aside>
          <div className="intro-block">
            <span className="intro-icon">
              <Icon name="compass" size={26} />
            </span>
            <div>
              <h1>خطّط رحلتك</h1>
              <p className="intro">وجهتك، والطريق إليها، في مكان واحد.</p>
            </div>
          </div>
          <ol className="journey-progress" aria-label="مراحل الرحلة">
            <li className={!route ? "selected" : "complete"}>
              <span>{route ? <Icon name="check" size={13} /> : "١"}</span>{" "}
              الوجهة
            </li>
            <li
              className={
                route && !active && mode !== "arrived"
                  ? "selected"
                  : active || mode === "arrived"
                    ? "complete"
                    : ""
              }
            >
              <span>٢</span> المسار
            </li>
            <li className={active || mode === "arrived" ? "selected" : ""}>
              <span>٣</span> الانطلاق
            </li>
          </ol>
          <div className="card">
            <div className="section-title">
              <h2>
                <Icon name="pin" size={18} /> تفاصيل الرحلة
              </h2>
              <button
                className="icon-button"
                aria-label="تبديل نقطة الانطلاق والوجهة"
                title="تبديل الانطلاق والوجهة"
                disabled={active || busy}
                onClick={() => {
                  setStart(destination);
                  setDestination(start);
                }}
              >
                <Icon name="swap" size={18} />
              </button>
            </div>
            <label>
              <span className="dot green" /> نقطة الانطلاق
              <input
                aria-label="إحداثيات الانطلاق"
                dir="ltr"
                value={start}
                disabled={active || busy}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              <span className="dot orange" /> الوجهة
              <input
                aria-label="إحداثيات الوجهة"
                dir="ltr"
                value={destination}
                disabled={active || busy}
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
            <div className="pick">
              <span>حدّد على الخريطة</span>
              <select
                aria-label="اختيار نقطة الخريطة"
                disabled={active || busy}
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="start">الانطلاق</option>
                <option value="end">الوجهة</option>
              </select>
            </div>
            <small>ترتيب الإحداثيات: خط الطول، خط العرض</small>
            <button
              className="primary"
              disabled={active || busy}
              onClick={() => calculate()}
            >
              <Icon name="route" />
              {busy ? "جارٍ حساب المسار…" : "عرض المسار"} <Icon name="arrow" />
            </button>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="voice-panel">
            <label className="voice">
              <input
                type="checkbox"
                checked={voice}
                onChange={(e) => {
                  setVoice(e.target.checked);
                  spoken.current.clear();
                  if (!e.target.checked) audio.cancel();
                  else audio.speak("تم تفعيل الإرشادات الصوتية.", true);
                }}
              />
              <Icon name="sound" size={18} /> الإرشادات الصوتية
            </label>
            <select
              aria-label="الصوت العربي"
              value={audio.selected}
              disabled={!audio.voices.length}
              onChange={(e) => {
                audio.cancel();
                audio.setSelected(e.target.value);
                spoken.current.clear();
              }}
            >
              {!audio.voices.length && (
                <option value="">لا يوجد صوت عربي متاح</option>
              )}
              {audio.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
            <div className="actions">
              <button
                className="secondary"
                onClick={() =>
                  audio.speak(
                    "هذه تجربة صوت فقط. بعد مئتي متر، انعطف يمينًا. خذ المسرب الأيمن.",
                    true,
                  )
                }
              >
                <Icon name="sound" size={17} /> تجربة الصوت
              </button>
              <button
                className="secondary"
                disabled={!cue || !active}
                onClick={() => audio.speak(cue.text, true)}
              >
                <Icon name="repeat" size={17} /> إعادة الإرشاد
              </button>
            </div>
            <p role="status">{audio.status}</p>
          </div>
          {route ? (
            <>
              <div className="stats">
                <div>
                  <strong>{meters(remaining)}</strong>
                  <span>المسافة المتبقية</span>
                </div>
                <div>
                  <strong>
                    {Math.max(1, Math.round(route.duration / 60))} دقيقة
                  </strong>
                  <span>مدة الرحلة المقدّرة</span>
                </div>
              </div>
              <div className="actions">
                {active ? (
                  <button
                    className="primary"
                    onClick={() => {
                      stop();
                      request.current?.abort();
                    }}
                  >
                    إيقاف الملاحة
                  </button>
                ) : (
                  <>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={navigate}
                    >
                      <Icon name="locate" size={18} /> بدء الملاحة
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={simulate}
                    >
                      <Icon name="play" size={17} /> معاينة الرحلة
                    </button>
                  </>
                )}
              </div>
              <div className="maneuver">
                <span>{mode === "arrived" ? "✓" : "↱"}</span>
                <div>
                  <small>
                    {mode === "simulation"
                      ? "معاينة المسار"
                      : mode === "arrived"
                        ? "اكتملت الرحلة"
                        : "التوجيه الحالي"}
                  </small>
                  <h3>{cue?.text || instruction(route.steps[index])}</h3>
                </div>
              </div>
              <div className="steps">
                <h2>
                  إرشادات الطريق <span>{route.steps.length} خطوة</span>
                </h2>
                {route.steps.map((s, i) => (
                  <div
                    className={`step ${i === index ? "current" : ""}`}
                    key={i}
                  >
                    <span className="number">{i + 1}</span>
                    <p>
                      {instruction(s)}
                      <small>{meters(s.distance)}</small>
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              <div className="empty-route" aria-hidden="true">
                <span />
                <i />
                <Icon name="pin" size={28} />
              </div>
              <h3>جاهز لوجهتك القادمة؟</h3>
              <p>
                حدّد نقطتي الرحلة، وسنوضح لك الطريق
                <br />
                مع المسافة والوقت وإرشادات القيادة.
              </p>
            </div>
          )}
        </aside>
        <section className="map-panel">
          <div className="map" ref={container} />
          {(!token || token.includes("your_public")) && (
            <div className="map-placeholder">
              <div className="placeholder-icon">
                <Icon name="compass" size={46} />
              </div>
              <h2>الخريطة غير متاحة</h2>
              <p>يمكنك إدخال الإحداثيات لحساب المسار وعرض إرشادات الطريق.</p>
            </div>
          )}
          <div className="map-top">
            <span className="map-badge">
              <Icon name="pin" size={16} /> تغطية العرض: الأردن
            </span>
            <span className="map-badge">
              {mode === "simulation"
                ? "محاكاة — موقع افتراضي"
                : mode === "gps"
                  ? "ملاحة مباشرة"
                  : "معاينة الرحلة"}
            </span>
          </div>
          <div className="map-tools">
            <button
              className="map-tool"
              disabled={!route || !token || token.includes("your_public")}
              onClick={showRoute}
              title="عرض المسار كاملًا"
            >
              <Icon name="locate" size={19} /> عرض المسار كاملًا
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
