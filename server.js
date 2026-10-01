const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const DEFAULT_POS = { lat: 12.9716, lng: 77.5946 }; // used if phone location is blocked

const NEED_QUERY = {
  eat: "restaurants",
  restroom: "public restroom",
  atm: "ATM",
  pharmacy: "pharmacy",
  back: "bus stop",
  events: "events venue",
  help: "hospital",
};

// Cache to save your free monthly searches (10 minutes)
const cache = new Map();
const TTL = 10 * 60 * 1000;

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

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/ask", async (req, res) => {
  const { query, need, lat, lng } = req.body || {};
  const pos = lat && lng ? { lat, lng } : DEFAULT_POS;
  const q = NEED_QUERY[need] || query || "restaurants";

  if (!SERPAPI_KEY) {
    return res.json({
      reply: "The server has no SerpApi key yet, so these are sample results.",
      results: [
        { name: "Sample place", detail: "Add SERPAPI_KEY on Render", distance: "300 m", link: "" },
      ],
    });
  }

  const cacheKey = `${q}|${pos.lat.toFixed(3)}|${pos.lng.toFixed(3)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) return res.json(hit.data);

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_maps");
    url.searchParams.set("type", "search");
    url.searchParams.set("q", q);
    url.searchParams.set("ll", `@${pos.lat},${pos.lng},15z`);
    url.searchParams.set("hl", "en");
    url.searchParams.set("api_key", SERPAPI_KEY);

    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok || data.error) {
      // "hasn't returned any results" is normal, not a failure
      if (!/hasn't returned any results/i.test(data.error || "")) {
        throw new Error(data.error || "SerpApi error " + r.status);
      }
    }

    const places = data.local_results || (data.place_results ? [data.place_results] : []);

    const results = places
      .filter((p) => p.gps_coordinates)
      .map((p) => {
        const loc = { lat: p.gps_coordinates.latitude, lng: p.gps_coordinates.longitude };
        const d = km(pos, loc);
        const bits = [p.open_state, p.type, p.rating ? p.rating + " stars" : null, p.address].filter(Boolean);
        return {
          name: p.title || "Unnamed place",
          detail: bits.join(". "),
          dist: d,
          distance: fmt(d),
          link: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`,
        };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6)
      .map(({ dist, ...rest }) => rest);

    const reply = results.length
      ? `I found ${results.length} options. The closest is ${results[0].name}, ${results[0].distance} away.`
      : "I couldn't find anything nearby.";

    const out = { reply, results };
    cache.set(cacheKey, { t: Date.now(), data: out });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Something went wrong with the search. Try again in a moment.", results: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Marga running on " + PORT));
