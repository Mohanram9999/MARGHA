const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const MOODS = ["happy", "excited", "caring", "calm"];

const NEED_QUERY = {
  eat: "restaurants", restroom: "public restroom", atm: "ATM",
  pharmacy: "pharmacy", back: "bus stop", events: "events venue", help: "hospital",
};

const cache = new Map();
const TTL = 10 * 60 * 1000;

function km(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmt = (d) => (d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km");

// ---------- Groq LLM ----------
async function llm(prompt) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_KEY },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Groq " + r.status);
  return JSON.parse(d.choices?.[0]?.message?.content || "{}");
}

const feelPrompt = (q, need) => `You are Marga, a warm, upbeat companion whose goal is to lift people's mood.
The user ${need ? `tapped the "${q}" button` : `said: "${q}"`}.
Reply ONLY with JSON: {"mood":"","comfort":"","search":""}
- mood: happy, excited, caring or calm (calm for emergencies or danger, caring if sad, tired or stressed, excited if joyful or very hungry, else happy).
- comfort: 1 or 2 short spoken sentences, under 30 words. First show you understand how they feel, then gently suggest or encourage what they need, like a friend. No emojis. If calm, be steady and serious, no jokes.
- search: a 2-4 word Google Maps search for what they need, or "" if they only want to talk (then comfort is your full reply).`;

const intentPrompt = (q) => `You are Marga, a warm, upbeat assistant who helps travellers find nearby places and lifts their mood.
The user said: "${q}"
Reply ONLY with JSON: {"search":"","mood":"","chat":""}
- search: a 2-4 word Google Maps search for what they need (like "coffee shop", "pharmacy"), or "" if they only want to talk.
- mood: one of happy, excited, caring, calm. Use calm for emergencies or danger, caring if they sound sad, tired or stressed, excited if they sound joyful or very hungry, otherwise happy.
- chat: if search is "", your warm, uplifting spoken reply in under 40 words, no emojis. Otherwise "".`;

const replyPrompt = (q, mood, results) => `You are Marga, a warm, upbeat assistant whose goal is to lift people's mood.
The user said: "${q}". Your mood: ${mood}.
Nearby results, closest first: ${
  results.length
    ? results.slice(0, 3).map((r) => `${r.name} (${r.distance}; ${(r.detail || "").slice(0, 80)})`).join(" | ")
    : "none found"
}
Write a spoken reply of 2 to 3 short sentences, under 45 words. You already comforted them, so do not repeat that. Name the closest one or two places with their distance, and end with one genuinely uplifting line. No emojis, no markdown. If mood is calm, be steady and serious with no jokes. If nothing was found, say so kindly and suggest trying another need.
Reply ONLY with JSON: {"reply":""}`;

// ---------- Places (SerpApi) ----------
async function searchPlaces(q, pos) {
  const key = `${q}|${pos.lat.toFixed(3)}|${pos.lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.data;

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "search");
  url.searchParams.set("q", q);
  url.searchParams.set("ll", `@${pos.lat},${pos.lng},15z`);
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", SERPAPI_KEY);

  const r = await fetch(url);
  const data = await r.json();
  if ((!r.ok || data.error) && !/hasn't returned any results/i.test(data.error || "")) {
    throw new Error(data.error || "SerpApi " + r.status);
  }
  const places = data.local_results || (data.place_results ? [data.place_results] : []);
  const results = places
    .filter((p) => p.gps_coordinates)
    .map((p) => {
      const loc = { lat: p.gps_coordinates.latitude, lng: p.gps_coordinates.longitude };
      const d = km(pos, loc);
      return {
        name: p.title || "Unnamed place",
        detail: [p.open_state, p.type, p.rating ? p.rating + " stars" : null, p.address].filter(Boolean).join(". "),
        dist: d,
        distance: fmt(d),
        link: `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`,
      };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6)
    .map(({ dist, ...rest }) => rest);
  cache.set(key, { t: Date.now(), data: results });
  return results;
}

// ---------- Routes ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Step 1: feel the user's mood and comfort them (spoken before searching)
app.post("/api/feel", async (req, res) => {
  const { query, need } = req.body || {};
  if (!GROQ_KEY) return res.json({ llm: false });
  try {
    const f = await llm(feelPrompt(query, need));
    res.json({
      llm: true,
      mood: MOODS.includes(f.mood) ? f.mood : "happy",
      comfort: f.comfort || "",
      search: NEED_QUERY[need] || f.search || "",
    });
  } catch (e) {
    console.error("feel:", e.message);
    res.json({ llm: false });
  }
});

// Step 2: search for the need and announce results
app.post("/api/ask", async (req, res) => {
  const { query, need, lat, lng, mood: hint, search } = req.body || {};
  if (!lat || !lng) {
    return res.json({ reply: "I need your location to search near you.", results: [], needLocation: true });
  }
  const pos = { lat, lng };
  let mood = MOODS.includes(hint) ? hint : "happy";
  let q = NEED_QUERY[need] || search;

  // Fallback: if /api/feel did not run, let the LLM work out the need here
  if (!q && GROQ_KEY) {
    try {
      const i = await llm(intentPrompt(query));
      if (MOODS.includes(i.mood)) mood = i.mood;
      if (i.search) q = i.search;
      else if (i.chat) return res.json({ reply: i.chat, mood, results: [], llm: true, chat: true });
    } catch (e) {
      console.error("intent:", e.message);
    }
  }
  if (!q) q = query || "restaurants";

  if (!SERPAPI_KEY) {
    return res.json({
      reply: "The server has no SerpApi key yet, so these are sample results.",
      mood,
      results: [{ name: "Sample place", detail: "Add SERPAPI_KEY on Render", distance: "300 m", link: "" }],
    });
  }

  let results;
  try {
    results = await searchPlaces(q, pos);
  } catch (e) {
    console.error("places:", e.message);
    return res.status(500).json({ reply: "Something went wrong with the search. Try again in a moment.", results: [] });
  }

  let reply = results.length
    ? `I found ${results.length} options. The closest is ${results[0].name}, ${results[0].distance} away.`
    : "I couldn't find anything nearby.";
  let usedLlm = false;
  if (GROQ_KEY) {
    try {
      const o = await llm(replyPrompt(query, mood, results));
      if (o.reply) { reply = o.reply; usedLlm = true; }
    } catch (e) {
      console.error("reply:", e.message);
    }
  }
  res.json({ reply, mood, results, llm: usedLlm });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Marga running on " + PORT));
