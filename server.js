const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DEFAULT_POS = { lat: 12.9716, lng: 77.5946 }; // used if phone location is blocked
const RADIUS = 2000; // meters

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// need -> OpenStreetMap filter + friendly name
const NEEDS = {
  eat: { filter: '["amenity"~"restaurant|cafe|fast_food"]', label: "places to eat" },
  restroom: { filter: '["amenity"="toilets"]', label: "restrooms" },
  atm: { filter: '["amenity"~"atm|bank"]', label: "ATMs" },
  pharmacy: { filter: '["amenity"~"pharmacy|chemist"]', label: "pharmacies" },
  back: { filter: '["highway"="bus_stop"]', label: "bus stops" },
  events: { filter: '["amenity"~"theatre|cinema|arts_centre|community_centre"]', label: "event venues" },
  help: { filter: '["amenity"~"hospital|clinic|police"]', label: "help points" },
};

// spoken words -> need
const KEYWORDS = [
  ["eat", /eat|food|hungry|restaurant|cafe|coffee|lunch|dinner|breakfast/i],
  ["restroom", /restroom|toilet|washroom|bathroom|loo/i],
  ["atm", /atm|cash|money|bank/i],
  ["pharmacy", /pharmacy|medicine|medical|chemist|drug/i],
  ["back", /back|bus|transport|station|home|ride/i],
  ["events", /event|show|movie|cinema|theatre|theater|concert/i],
  ["help", /help|emergency|hospital|police|doctor|hurt/i],
];

function pickNeed(need, query) {
  if (need && NEEDS[need]) return need;
  const hit = KEYWORDS.find(([, re]) => re.test(query || ""));
  return hit ? hit[0] : null;
}

function km(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmt(d) {
  return d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km";
}

async function overpass(q) {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "MargaApp/1.0",
        },
        body: "data=" + encodeURIComponent(q),
      });
      if (!r.ok) throw new Error("Overpass " + r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/ask", async (req, res) => {
  const { query, need, lat, lng } = req.body || {};
  const pos = lat && lng ? { lat, lng } : DEFAULT_POS;
  const key = pickNeed(need, query);

  if (!key) {
    return res.json({
      reply: "I can help with food, restrooms, ATMs, pharmacies, getting back, events or emergencies. Try one of those.",
      results: [],
    });
  }

  const { filter, label } = NEEDS[key];
  const q = `[out:json][timeout:15];nwr(around:${RADIUS},${pos.lat},${pos.lng})${filter};out center 40;`;

  try {
    const data = await overpass(q);
    const results = (data.elements || [])
      .map((el) => {
        const c = el.center || { lat: el.lat, lon: el.lon };
        if (c.lat == null || c.lon == null) return null;
        const loc = { lat: c.lat, lng: c.lon };
        const t = el.tags || {};
        const kind = (t.amenity || t.highway || "place").replace(/_/g, " ");
        const extras = [t.cuisine && t.cuisine.replace(/;/g, ", "), t.opening_hours && "Hours: " + t.opening_hours]
          .filter(Boolean)
          .join(". ");
        const d = km(pos, loc);
        return {
          name: t.name || "Unnamed " + kind,
          detail: extras || kind,
          dist: d,
          distance: fmt(d),
          link: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6)
      .map(({ dist, ...rest }) => rest);

    const reply = results.length
      ? `I found ${results.length} ${label}. The closest is ${results[0].name}, ${results[0].distance} away.`
      : `I couldn't find ${label} within ${RADIUS / 1000} km.`;
    res.json({ reply, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "The map service is busy. Try again in a moment.", results: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Marga running on " + PORT));
