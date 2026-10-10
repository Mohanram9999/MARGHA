import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ResultCard, TripView, Carousel, AccountView, TransportBar } from "./Panels.jsx";

const API = "";

const NEEDS = [
  { id: "eat", label: "Eat now", e: "🍽️" }, { id: "restroom", label: "Restroom", e: "🚻" },
  { id: "atm", label: "ATM", e: "🏧" }, { id: "pharmacy", label: "Pharmacy", e: "💊" },
  { id: "back", label: "Get back", e: "🧭" }, { id: "events", label: "Events", e: "🎫" },
  { id: "help", label: "Help", e: "🆘" },
];

const MOOD = {
  happy:   { tag: "😊 Happy", pitch: 1.2, rate: 1.05,
    open: ["Great choice!", "I love helping with this!"], close: ["Hope this makes your day better!", "Go enjoy it, you deserve it!"] },
  excited: { tag: "🤩 Excited", pitch: 1.4, rate: 1.12,
    open: ["Oh yes, this is going to be so good!", "I'm so excited to help!"], close: ["Have an amazing time!", "Go get it, champion!"] },
  caring:  { tag: "🤗 Caring", pitch: 1.0, rate: 0.9,
    open: ["I'm here with you. Take a deep breath.", "Don't worry, we'll sort this out together."], close: ["You're doing better than you think.", "Small steps count, and I'm cheering for you."] },
  calm:    { tag: "💙 Calm", pitch: 0.95, rate: 0.88,
    open: ["Stay calm, I'm right here. You're not alone."], close: ["Please stay safe. If it is urgent, call your local emergency number."] },
};

const pick = a => a[Math.floor(Math.random() * a.length)];
const TRIP_RE = /\b(plan|itinerary|trip|tour|holiday|vacation|getaway)\b/i;

function detectMood(text, need) {
  const t = (text || "").toLowerCase();
  if (need === "help" || /hurt|emergency|accident|pain|bleed|scared|danger|lost|police/.test(t)) return "calm";
  if (/tired|sad|stress|bad day|lonely|down|upset|angry|cry|worried|anxious|exhaust/.test(t)) return "caring";
  if (/hungry|starv|party|fun|celebrat|birthday|awesome|amazing|movie|concert|event/.test(t) || need === "eat" || need === "events") return "excited";
  return "happy";
}

let uid = (() => {
  try {
    let u = localStorage.getItem("marga_uid");
    if (!u) {
      u = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem("marga_uid", u);
    }
    return u;
  } catch (err) { return "guest-" + Date.now(); }
})();

const post = (p, b) =>
  fetch(API + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
    .then(r => r.json()).catch(() => null);

const nameFrom = t => {
  const m = /(?:my name is|call me)\s+([A-Za-z]{2,20})/i.exec(t || "");
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : "";
};

try { speechSynthesis.getVoices(); } catch (err) {}
function pickVoice() {
  const en = ((window.speechSynthesis && speechSynthesis.getVoices()) || []).filter(v => /^en/i.test(v.lang));
  return en.find(v => /natural|neural|online/i.test(v.name))
    || en.find(v => /google/i.test(v.name) && /en-(IN|GB|US)/i.test(v.lang))
    || en.find(v => /female|samantha|zira|aria|jenny/i.test(v.name))
    || en[0] || null;
}

function speak(text, mood) {
  return new Promise(resolve => {
    try {
      if (!window.speechSynthesis) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(); if (v) u.voice = v;
      u.pitch = MOOD[mood].pitch; u.rate = MOOD[mood].rate;
      u.onend = resolve; u.onerror = resolve;
      speechSynthesis.speak(u);
      setTimeout(resolve, 20000);
    } catch (err) { resolve(); }
  });
}

const askFeel = (query, need, history, name) =>
  Promise.race([
    post("/api/feel", { query, need, history, name }),
    new Promise(res => setTimeout(() => res(null), 9000)),
  ]).then(r => (r && r.llm ? r : null));

const askMarga = (query, need, p, mood, search) =>
  fetch(API + "/api/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, need, mood, search, lat: p.lat, lng: p.lng }),
  })
    .then(r => { if (!r.ok) throw new Error("bad"); return r.json(); })
    .then(d => ({ reply: d.reply || "Here is what I found.", results: d.results || [], mood: d.mood, llm: !!d.llm }))
    .catch(() => ({ reply: "I couldn't reach the server. Please try again in a moment.", results: [] }));

/* 3D animation slot: put idle.mp4, listening.mp4, thinking.mp4, talking.mp4 in public/videos/ */
function AvatarSlot({ mode }) {
  const [src, setSrc] = useState("/videos/" + mode + ".mp4");
  const [none, setNone] = useState(false);
  useEffect(() => { setSrc("/videos/" + mode + ".mp4"); setNone(false); }, [mode]);
  const onErr = () => {
    if (!src.endsWith("/idle.mp4")) setSrc("/videos/idle.mp4");
    else setNone(true);
  };
  return (
    <div className="avatar">
      {none
        ? <div className="ph"><b>3D animation here</b><span>Add idle.mp4, listening.mp4, thinking.mp4, talking.mp4 to public/videos/</span></div>
        : <video key={src} src={src} autoPlay loop muted playsInline onError={onErr} />}
    </div>
  );
}

function App() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState("idle");
  const [mood, setMood] = useState("happy");
  const [status, setStatus] = useState("");
  const [bubble, setBubble] = useState("");
  const [ub, setUb] = useState(null);
  const [need, setNeed] = useState(null);
  const [results, setResults] = useState(null);
  const [loc, setLoc] = useState("finding");
  const [fxKey, setFxKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [trip, setTrip] = useState(null);
  const [tab, setTab] = useState("needs");
  const [custom, setCustom] = useState([]);
  const [account, setAccount] = useState(null);
  const [authMsg, setAuthMsg] = useState("");
  const modeRef = useRef("idle");
  const recRef = useRef(null);
  const posRef = useRef(null);
  const histRef = useRef([]);
  const runRef = useRef(0);
  const nameRef = useRef("");
  const visitsRef = useRef(0);
  const endRef = useRef(null);

  const setM = m => { modeRef.current = m; setMode(m); };

  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, chatOpen, mode]);

  const getPos = () => new Promise(res => {
    if (posRef.current && Date.now() - posRef.current.t < 300000) return res(posRef.current);
    if (!navigator.geolocation) { setLoc("off"); return res(null); }
    setLoc("finding");
    navigator.geolocation.getCurrentPosition(
      p => { posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() }; setLoc("on"); res(posRef.current); },
      () => { setLoc("off"); res(null); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });

  useEffect(() => {
    getPos();
    fetch(API + "/api/health").catch(() => {});
    post("/api/user/init", { uid }).then(d => {
      if (d && d.db) { nameRef.current = d.name || ""; visitsRef.current = d.visits; histRef.current = d.recent || []; }
    });
    fetch(API + "/api/config").then(r => r.json()).then(d => setCustom((d.buttons || []).map(b => ({ id: "c" + b.id, label: b.label, e: b.emoji || "⭐", kind: b.kind, value: b.value, image: b.image_url })))).catch(() => {});
    const tk = (() => { try { return localStorage.getItem("marga_token"); } catch (err) { return null; } })();
    if (tk) post("/api/auth/me", { token: tk }).then(d => {
      if (!d || !d.ok) return;
      nameRef.current = d.name || nameRef.current;
      setAccount({ name: d.name, email: d.email });
      if (d.uid && d.uid !== uid) {
        uid = d.uid;
        try { localStorage.setItem("marga_uid", uid); } catch (err) {}
        post("/api/user/init", { uid }).then(i => { if (i && i.db) { histRef.current = i.recent || []; visitsRef.current = i.visits; } });
      }
    });
  }, []);

  const say = (m, t) => {
    setMood(m); setMsgs(x => [...x, { r: "b", t }]); setBubble(t); setStatus("");
    setM("talking"); setFxKey(k => k + 1);
    histRef.current.push({ role: "assistant", content: t });
    post("/api/log", { uid, role: "assistant", content: t, mood: m });
    return speak(t, m);
  };

  const finish = (m, full, res) => {
    const id = runRef.current;
    say(m, full);
    if (res) { setResults(res); setTab("results"); }
    setTimeout(() => { if (id === runRef.current) setM("idle"); }, 3500);
  };

  const planTrip = async (query, id) => {
    setMood("excited");
    const d = await post("/api/trip", { query, history: histRef.current.slice(-6), name: nameRef.current });
    if (id !== runRef.current) return;
    if (!d || !d.ok) return finish("caring", "I couldn't plan that just now. Please try again in a moment.", null);
    if (d.trip) { setTrip(d.trip); setTab("trip"); }
    finish(MOOD[d.mood] ? d.mood : "excited", d.say, null);
  };

  const start = async () => {
    if (started) return;
    setStarted(true);
    try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (err) {}
    const id = ++runRef.current;
    const h = new Date().getHours();
    const part = h < 5 ? "late at night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
    setM("thinking");
    const back = visitsRef.current > 1;
    const f = await askFeel(
      "Hey Marga! The app just opened and it is " + part + ". " +
      (back ? "I'm back again. Welcome me back like an old friend and mention something from our earlier chat if you remember it. " : "Greet me like a new close friend. ") +
      "Ask how I'm doing and what I need.",
      null, histRef.current.slice(-8), nameRef.current);
    if (id !== runRef.current) return;
    const m = f && MOOD[f.mood] ? f.mood : "happy";
    const hello = f && f.say ? f.say : "Hey there, friend! I'm Marga, and I'm so happy you're here. How are you doing today? Tell me what you need, or just chat with me.";
    await say(m, hello);
    if (id !== runRef.current) return;
    setM("idle");
    setStatus("Tap me to talk");
  };

  const run = async (query, needId, forceSearch) => {
    const id = ++runRef.current;
    setMsgs(x => [...x, { r: "u", t: query }]);
    setUb({ t: query, k: Date.now() });
    setBubble(""); setStatus("");
    let m = detectMood(query, needId);
    setMood(m); setM("thinking");
    const posP = getPos();
    const hist = histRef.current.slice(-8);
    histRef.current.push({ role: "user", content: query });
    const nm = nameFrom(query);
    if (nm) nameRef.current = nm;
    post("/api/log", { uid, role: "user", content: query, name: nm });
    if (!needId && TRIP_RE.test(query)) return planTrip(query, id);
    const f = await askFeel(query, needId, hist, nameRef.current);
    if (id !== runRef.current) return;
    if (f && MOOD[f.mood]) m = f.mood;

    if (f && f.type === "chat" && !needId) {
      await say(m, f.say);
      if (id === runRef.current) setTimeout(() => setM("idle"), 800);
      return;
    }
    const comfort = f && f.say ? f.say : pick(MOOD[m].open) + " Let me find that for you.";
    const spoke = say(m, comfort);
    const p = await posP;
    if (!p) {
      await spoke;
      return finish("caring", "I need your location to find things near you. Please allow location in your browser, then tap the location button and ask me again.", null);
    }
    const d = await askMarga(query, needId, p, m, forceSearch || (f && f.search));
    await spoke;
    if (id !== runRef.current) return;
    const fm = d.mood && MOOD[d.mood] ? d.mood : m;
    finish(fm, d.llm ? d.reply : d.reply + " " + pick(MOOD[fm].close), d.results);
  };

  const listen = () => {
    if (modeRef.current === "listening") { recRef.current && recRef.current.stop(); return; }
    runRef.current++;
    try { speechSynthesis.cancel(); } catch (err) {}
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setM("idle"); setStatus("Voice isn't supported here. Use the cards below or the chat icon."); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true;
    let finalText = "";
    rec.onstart = () => { setM("listening"); setBubble(""); setStatus("I'm listening…"); };
    rec.onresult = ev => {
      finalText = Array.from(ev.results).map(r => r[0].transcript).join(" ");
      setStatus("“" + finalText + "”");
    };
    rec.onerror = () => { setM("idle"); setStatus("I couldn't hear that. Tap me and try again."); };
    rec.onend = () => { if (finalText) run(finalText, null); else if (modeRef.current === "listening") setM("idle"); };
    recRef.current = rec;
    rec.start();
  };

  const runData = async n => {
    const id = ++runRef.current;
    setM("thinking");
    const p = await getPos();
    const d = await fetch(API + "/api/custom?category=" + encodeURIComponent(n.value) + (p ? "&lat=" + p.lat + "&lng=" + p.lng : "")).then(r => r.json()).catch(() => null);
    if (id !== runRef.current) return;
    const list = d && d.results ? d.results : [];
    finish("happy", list.length ? "Here are my " + list.length + " picks for " + n.label + "." : "I don't have anything saved for " + n.label + " yet.", list);
  };

  const pickNeed = n => {
    if (n.kind === "link") { if (/^https:\/\//.test(n.value)) window.open(n.value, "_blank", "noopener"); return; }
    setNeed(n.id);
    if (n.kind === "data") return runData(n);
    if (n.kind === "ask") return run(n.value, null);
    run(n.label, n.id, n.kind === "search" ? n.value : undefined);
  };
  const allNeeds = [...NEEDS.filter(n => n.id !== "help"), ...custom, ...NEEDS.filter(n => n.id === "help")];

  const send = () => { const q = text.trim(); if (!q) return; setText(""); run(q, null); };

  const doAuth = async (authMode, f) => {
    setAuthMsg("Working…");
    const d = await post("/api/auth/" + authMode, { ...f, uid });
    if (!d || !d.ok) return setAuthMsg((d && d.error) || "Something went wrong. Try again.");
    try { localStorage.setItem("marga_token", d.token); localStorage.setItem("marga_uid", d.uid); } catch (err) {}
    uid = d.uid; nameRef.current = d.name || "";
    setAccount({ name: d.name, email: d.email }); setAuthMsg("");
    const i = await post("/api/user/init", { uid });
    if (i && i.db) { histRef.current = i.recent || []; visitsRef.current = i.visits; }
    say("happy", "Welcome" + (d.name ? ", " + d.name : "") + "! I'm so glad you're here.");
  };

  const logout = () => {
    try {
      localStorage.removeItem("marga_token");
      uid = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem("marga_uid", uid);
    } catch (err) {}
    setAccount(null); setAuthMsg(""); histRef.current = []; nameRef.current = "";
    post("/api/user/init", { uid });
  };

  const forget = async () => {
    try { const tk = localStorage.getItem("marga_token"); if (tk) await post("/api/auth/delete", { token: tk }); localStorage.removeItem("marga_token"); } catch (err) {}
    setAccount(null);
    await post("/api/forget", { uid });
    try { localStorage.removeItem("marga_uid"); } catch (err) {}
    histRef.current = []; nameRef.current = ""; setMsgs([]); setBubble(""); setChatOpen(false);
    setStatus("Done, I've forgotten you. Reload to start fresh.");
  };

  const locText = loc === "on" ? "📍 Location on" : loc === "finding" ? "📍 Finding you…" : "📍 Tap to turn on location";

  return (
    <div className={"app m-" + mood + " " + mode}>
      <button className={"splash" + (started ? " hide" : "")} onClick={start} aria-label="Tap to meet Marga">
        <div className="orb" />
        <h1>Marga</h1>
        <p>Tap to meet your friend</p>
      </button>

      <header>
        <h1>Marga</h1>
        <button className="iconbtn" aria-label="Open chat" onClick={() => setChatOpen(true)}>💬</button>
      </header>

      <section className="stage">
        <AvatarSlot mode={mode} />
        <div className="chip">{MOOD[mood].tag}</div>
        {mode === "thinking"
          ? <div className="bubble"><i /><i /><i /></div>
          : bubble ? <div className="bubble" key={fxKey}>{bubble}</div> : null}
        <div className="status" aria-live="polite">{status}</div>
        <button className="loc" onClick={getPos}>{locText}</button>
        {ub && <div className="ubub" key={ub.k}>{ub.t}</div>}
        <button className="tap" aria-label="Tap to speak" onClick={listen} />
      </section>

      <section className="bottom">
        <div className="grab" />
        <div className="tabs">
          {[["needs", "Needs"], ["results", "Results"], ["trip", "Trip"], ["account", "Account"]].map(([k, l]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === "needs" && (
          <>
            <div className="hint">Tap a card, or ask me to plan a trip</div>
            <Carousel items={allNeeds} activeId={need} onPick={pickNeed} />
          </>
        )}

        {tab === "results" && (
          <div className="results">
            {!results && <div className="empty">Ask for something nearby and results will show here.</div>}
            {results && results.length === 0 && <div className="empty">Nothing found nearby. Try another need.</div>}
            {results && results.map((r, i) => <ResultCard key={i} r={r} i={i} />)}
          </div>
        )}

        {tab === "trip" && (
          <>
            <TransportBar to={trip && trip.destination} />
            {trip ? <TripView trip={trip} /> : <div className="empty">Say "Plan a 3 day trip to Goa" and your plan will appear here.</div>}
          </>
        )}

        {tab === "account" && <AccountView account={account} msg={authMsg} onSubmit={doAuth} onLogout={logout} />}
      </section>

      <aside className={"panel" + (chatOpen ? " open" : "")}>
        <div className="phead">
          <span>Chat with Marga</span>
          <button className="iconbtn" aria-label="Close chat" onClick={() => setChatOpen(false)}>✕</button>
        </div>
        <div className="msgs">
          {msgs.map((m, i) => <div key={i} className={"m " + m.r}>{m.t}</div>)}
          {mode === "thinking" && <div className="m b dots"><i /><i /><i /></div>}
          <div ref={endRef} />
        </div>
        <button className="forget" onClick={forget}>Delete my data</button>
        <div className="pin">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask me anything" />
          <button onClick={send}>Send</button>
        </div>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
