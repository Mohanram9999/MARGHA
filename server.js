const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PLACES_KEY = process.env.PLACES_KEY;
const DEFAULT_POS = { lat: 12.9716, lng: 77.5946 }; // used if phone location is blocked

const NEED_QUERY = {
  eat: "restaurants",
  restroom: "public restroom",
  atm: "ATM",
  pharmacy: "pharmacy",
  back: "bus stop",
  events: "events",
  help: "hospital",
};

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
  const textQuery = NEED_QUERY[need] || query || "restaurants";

  if (!PLACES_KEY) {
    return res.json({
      reply: "The server has no places key yet, so these are sample results.",
      results: [
        { name: "Sample place", detail: "Add PLACES_KEY on Render", distance: "300 m", link: "" },
      ],
    });
  }

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.location,places.currentOpeningHours.openNow",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 5,
        locationBias: {
          circle: { center: { latitude: pos.lat, longitude: pos.lng }, radius: 2000 },
        },
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || "Places error");

    const results = (data.places || [])
      .map((p) => {
        const loc = { lat: p.location.latitude, lng: p.location.longitude };
        const open = p.currentOpeningHours?.openNow;
        return {
          name: p.displayName?.text || "Unnamed place",
          detail: (open === true ? "Open now. " : open === false ? "Closed. " : "") + (p.formattedAddress || ""),
          dist: km(pos, loc),
          distance: fmt(km(pos, loc)),
          link: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`,
        };
      })
      .sort((a, b) => a.dist - b.dist)
      .map(({ dist, ...rest }) => rest);

    const reply = results.length
      ? `I found ${results.length} options. The closest is ${results[0].name}, ${results[0].distance} away.`
      : "I couldn't find anything nearby.";
    res.json({ reply, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Something went wrong on the server.", results: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Marga running on " + PORT));
