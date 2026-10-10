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

/* Flights, trains (IRCTC), buses, transit and driving links */
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

/* ---------- Animated mascot built from plain CSS (no SVG) ---------- */
export function CssBot() {
  return (
    <div className="scene">
      <div className="beam" />
      <div className="ufo"><div className="dome" /><div className="hull" /><div className="lamps"><i /><i /><i /></div></div>
      <div className="robot">
        <div className="ant" />
        <div className="head">
          <div className="face">
            <b className="eye" /><b className="eye" />
            <i className="cheek l" /><i className="cheek r" />
            <span className="mouth" />
          </div>
        </div>
        <div className="body" />
      </div>
    </div>
  );
}

/* ---------- Moving carousel (loops forever) ---------- */
export function Marquee({ items, onPick, activeId, reverse }) {
  const [pause, setPause] = React.useState(false);
  const loop = [...items, ...items];
  return (
    <div className="mq" onTouchStart={() => setPause(true)} onTouchEnd={() => setTimeout(() => setPause(false), 2500)}>
      <div className={"mqt" + (reverse ? " rev" : "") + (pause ? " pause" : "")} style={{ animationDuration: items.length * 5 + "s" }}>
        {loop.map((n, i) => (
          <button key={i} className={"mc g-" + ((i % items.length) % 6) + (activeId === n.id ? " on" : "")} onClick={() => onPick(n)}>
            {safe(n.image) && <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />}
            <span className="shade" /><span className="big">{n.e}</span><b>{n.label}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Results popup with Places and Photos tabs ---------- */
export function ResultsPopup({ open, title, results, fallback, onClose }) {
  const [tab, setTab] = React.useState("places");
  React.useEffect(() => { if (open) setTab("places"); }, [open, title]);
  if (!open) return null;
  const list = results || [];
  const pic = (r) => safe(r.image) || safe(fallback);
  return (
    <div className="pop" onClick={onClose}>
      <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
        <div className="shead">
          <div><b>{title || "Results"}</b><small>{list.length} found</small></div>
          <button className="iconbtn" aria-label="Close results" onClick={onClose}>✕</button>
        </div>
        <div className="tabs">
          <button className={"tab" + (tab === "places" ? " on" : "")} onClick={() => setTab("places")}>Places</button>
          <button className={"tab" + (tab === "photos" ? " on" : "")} onClick={() => setTab("photos")}>Photos</button>
        </div>
        <div className="sbody">
          {list.length === 0 && <div className="empty">Nothing found nearby. Try another search.</div>}
          {tab === "places" && list.map((r, i) => <ResultCard key={i} r={{ ...r, image: pic(r) }} i={i} />)}
          {tab === "photos" && (
            <div className="grid">
              {list.map((r, i) => (
                <a key={i} className="ph2" href={safe(r.link) || undefined} target="_blank" rel="noopener noreferrer">
                  {pic(r)
                    ? <img src={pic(r)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />
                    : <div className="rimg ico" style={{ width: "100%", height: "100%" }}>📍</div>}
                  <span>{r.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
      }
