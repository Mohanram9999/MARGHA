import React from "react";

const safe = (u) => (u && /^https:\/\//.test(u) && !/["'()\s]/.test(u) ? u : null);
const ICON = { sight: "🏛️", food: "🍽️", stay: "🏨", activity: "🎯" };
const e = encodeURIComponent;

const Btn = ({ href, children }) =>
  safe(href) ? <a className="lnk" href={href} target="_blank" rel="noopener noreferrer">{children}</a> : null;

const Pic = ({ src, icon }) =>
  safe(src)
    ? <img className="rimg" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />
    : <div className="rimg ico">{icon || "📍"}</div>;

export function ResultCard({ r, i }) {
  return (
    <div className="res" style={{ animationDelay: i * 0.08 + "s" }}>
      <Pic src={r.image} />
      <div className="rbody">
        <b>{r.name}</b>
        <small>{r.detail}</small>
        <div className="row">
          <span>{r.distance}</span>
          <span className="lnks"><Btn href={r.link}>Directions</Btn><Btn href={r.website}>Website / Book</Btn></span>
        </div>
      </div>
    </div>
  );
}

export function TransportBar({ to }) {
  const [from, setFrom] = React.useState("");
  const [dest, setDest] = React.useState(to || "");
  const [date, setDate] = React.useState("");
  React.useEffect(() => { if (to) setDest(to); }, [to]);
  const f = from.trim(), t = dest.trim();
  const ok = f && t;
  const maps = (mode) => `https://www.google.com/maps/dir/?api=1&origin=${e(f)}&destination=${e(t)}&travelmode=${mode}`;
  return (
    <div className="tp">
      <h3>Getting there</h3>
      <input placeholder="From (city or station)" value={from} onChange={(ev) => setFrom(ev.target.value)} />
      <input placeholder="To" value={dest} onChange={(ev) => setDest(ev.target.value)} />
      <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
      {ok ? (
        <div className="lnks">
          <Btn href={`https://www.google.com/travel/flights?q=${e(`Flights from ${f} to ${t}${date ? " on " + date : ""}`)}`}>✈️ Flights</Btn>
          <Btn href="https://www.irctc.co.in/nget/train-search">🚆 IRCTC</Btn>
          <Btn href={`https://www.google.com/search?q=${e(`trains from ${f} to ${t}`)}`}>🚆 Train options</Btn>
          <Btn href="https://www.redbus.in/">🚌 redBus</Btn>
          <Btn href={`https://www.google.com/search?q=${e(`buses from ${f} to ${t}`)}`}>🚌 Bus options</Btn>
          <Btn href={maps("transit")}>🚇 Transit route</Btn>
          <Btn href={maps("driving")}>🚗 Drive</Btn>
        </div>
      ) : <small className="sum">Enter where you start and where you're going.</small>}
      <small className="sum">IRCTC doesn't allow pre-filled searches, so enter your stations there.</small>
    </div>
  );
}

export function TripView({ trip }) {
  const [open, setOpen] = React.useState(1);
  const L = trip.links || {};
  const place = (s) => s.name + ", " + trip.destination;
  const dayRoute = (d) => "https://www.google.com/maps/dir/" + d.stops.map((s) => e(place(s))).join("/");
  const leg = (a, b) => `https://www.google.com/maps/dir/?api=1&origin=${e(place(a))}&destination=${e(place(b))}&travelmode=driving`;
  return (
    <div className="trip">
      {safe(trip.hero) && <img className="hero" src={trip.hero} alt="" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />}
      <h2>{trip.destination} · {trip.days} day{trip.days > 1 ? "s" : ""}</h2>
      <p className="sum">{trip.summary}</p>
      <div className="book"><Btn href={L.flights}>✈️ Flights</Btn><Btn href={L.hotels}>🏨 Hotels</Btn><Btn href={L.googleHotels}>🔎 Google Hotels</Btn></div>
      {trip.plan.map((d) => (
        <div key={d.day}>
          <button className="dayh" onClick={() => setOpen(open === d.day ? 0 : d.day)}>
            <span>Day {d.day}: {d.title}</span><span>{open === d.day ? "−" : "+"}</span>
          </button>
          {open === d.day && (
            <>
              {d.stops.length > 1 && <div className="lnks route"><Btn href={dayRoute(d)}>🗺️ Full day route</Btn></div>}
              {d.stops.map((s, i) => (
                <div key={i}>
                  {i > 0 && <div className="leg"><Btn href={leg(d.stops[i - 1], s)}>↓ Directions from {d.stops[i - 1].name}</Btn></div>}
                  <div className="res stop">
                    <Pic src={s.image} icon={ICON[s.type]} />
                    <div className="rbody">
                      <b>{s.name}</b>
                      <small>{s.time ? s.time + ". " : ""}{s.tip}</small>
                      <div className="lnks"><Btn href={s.directions}>From me</Btn><Btn href={s.maps}>Maps</Btn><Btn href={s.book}>Book</Btn></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ))}
      {trip.tips && trip.tips.length > 0 && <ul className="tips">{trip.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  );
}

export function Carousel({ items, onPick, activeId }) {
  const ref = React.useRef(null);
  const paused = React.useRef(false);
  React.useEffect(() => {
    const t = setInterval(() => {
      const el = ref.current;
      if (!el || paused.current) return;
      const step = el.firstChild ? el.firstChild.offsetWidth + 12 : 200;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: step, behavior: "smooth" });
    }, 2800);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <div className="car" ref={ref}
      onTouchStart={() => { paused.current = true; }}
      onTouchEnd={() => setTimeout(() => { paused.current = false; }, 4000)}>
      {items.map((n, i) => {
        const img = safe(n.image);
        return (
          <button key={n.id} className={"cc " + (n.id === "help" ? "g-help" : "g-" + (i % 6)) + (activeId === n.id ? " on" : "")}
            style={img ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,.05)), url("${img}")` } : undefined}
            onClick={() => onPick(n)}>
            <span className="big">{n.e}</span>
            <b>{n.label}</b>
            <small>{n.kind === "link" ? "Open website" : "Tap to explore"}</small>
          </button>
        );
      })}
    </div>
  );
}

export function AccountView({ account, msg, onSubmit, onLogout }) {
  const [mode, setMode] = React.useState("login");
  const [f, setF] = React.useState({ email: "", name: "", password: "" });
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  if (account) {
    return (
      <div className="acct">
        <h2>Hi, {account.name || "friend"} 👋</h2>
        <p className="sum">{account.email}</p>
        <button className="go" onClick={onLogout}>Log out</button>
      </div>
    );
  }
  return (
    <div className="acct">
      <div className="tabs">
        <button className={"tab" + (mode === "login" ? " on" : "")} onClick={() => setMode("login")}>Login</button>
        <button className={"tab" + (mode === "register" ? " on" : "")} onClick={() => setMode("register")}>Register</button>
      </div>
      <input type="email" autoComplete="email" placeholder="Email" value={f.email} onChange={set("email")} />
      {mode === "register" && <input autoComplete="given-name" placeholder="First name" value={f.name} onChange={set("name")} />}
      <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password (8+ characters)" value={f.password} onChange={set("password")} />
      <button className="go" onClick={() => onSubmit(mode, f)}>{mode === "login" ? "Log in" : "Create account"}</button>
      {msg && <div className="amsg">{msg}</div>}
      <small className="sum">Your chats follow you to any device you log in on.</small>
    </div>
  );
      }
