const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
require("./db")(app);
require("./trip")(app);
require("./admin")(app);
require("./auth")(app);
app.use(express.static(path.join(__dirname, "public")));

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FAST = process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant";
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

// ---------- Groq: main model first, fast model as backup ----------
async function llm(messages, max = 350) {
  let err;
  for (const model of [MODEL, FAST]) {
    try {
      const oss = model.startsWith("openai/gpt-oss");
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_KEY },
        body: JSON.stringify({
          model, messages, temperature: 0.8,
          max_completion_tokens: max + (oss ? 900 : 0),
          ...(oss ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_object" },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Groq " + r.status);
      return JSON.parse(d.choices?.[0]?.message?.content || "{}");
    } catch (e) {
      err = e;
      console.error("llm", model, e.message);
    }
  }
  throw err;
}

const PERSONA = `You are Marga, a friendly, upbeat AI voice guide for travellers. You help people find nearby food, restrooms, ATMs, pharmacies, transport, events and emergency help, you plan trips, and you lift their mood. You are spoken aloud, so be natural, warm and brief. No emojis, no markdown.`;

const FEEL_RULES = `Decide what the user wants and reply ONLY with JSON: {"type":"","mood":"","say":"","search":""}
You are emotionally intelligent. Notice how the person feels from their words, the time of day and what they need.
- mood: happy (neutral or pleasant), excited (joyful, celebrating, very hungry, planning fun), caring (sad, tired, stressed, lonely, overwhelmed), calm (emergency, danger, pain, lost, scared). Pick the mood that fits THEM, not a default.
- say: talk like a close friend, not a customer-service bot. Reflect the feeling in fresh words (never "I understand"), then offer one small helpful suggestion. Use their name at most once, only if natural. Vary your openings and never repeat a phrase used earlier in this chat. Humor only when mood is happy or excited. If caring, be gentle and never fake cheerfulness. If calm, be steady, short and clear, and put safety first.
- type "chat": greetings, questions about you, general questions, or feelings with no place needed. say = a direct, helpful answer in under 50 words (answer first, then a warm line). search = "".
- type "search": they need a nearby place. say = 1 or 2 sentences, under 30 words. search = a 2-4 word Google Maps query.
Examples:
"who are you" -> {"type":"chat","mood":"happy","say":"I'm Marga, your AI travel buddy. I find food, restrooms, ATMs and plan trips, and I'm happy to keep you company too.","search":""}
"I'm so tired and my feet hurt" -> {"type":"search","mood":"caring","say":"Ugh, a long day on your feet wears anyone out. Let's find you a cosy spot to sit and rest.","search":"cafe"}
"I'm starving" -> {"type":"search","mood":"excited","say":"An empty stomach, no way! Let's get something delicious in you right now.","search":"restaurants"}`;

const cleanHistory = (h) =>
  (Array.isArray(h) ? h : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 300) }));

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
        image: p.thumbnail || null,
        website: p.website || null,
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
app.get("/api/health", (req, res) => res.json({ ok: true, groq: !!GROQ_KEY, serpapi: !!SERPAPI_KEY }));

app.post("/api/feel", async (req, res) => {
  const { query, need, history, name } = req.body || {};
  if (!GROQ_KEY) return res.json({ llm: false });
  try {
    const user = need ? `[The user tapped the "${query}" button]` : String(query || "").slice(0, 400);
    const f = await llm([
      { role: "system", content: PERSONA + (name ? ` The user's name is ${String(name).slice(0, 30)}; use it warmly now and then.` : "") + "\n" + FEEL_RULES },
      ...cleanHistory(history),
      { role: "user", content: user },
    ]);
    const type = need || f.type === "search" ? "search" : "chat";
    res.json({
      llm: true,
      type,
      mood: MOODS.includes(f.mood) ? f.mood : "happy",
      say: f.say || (type === "chat" ? "I'm here! Ask me for food, restrooms, ATMs and more." : ""),
      search: NEED_QUERY[need] || f.search || "",
    });
  } catch (e) {
    console.error("feel:", e.message);
    res.json({ llm: false });
  }
});

app.post("/api/ask", async (req, res) => {
  const { query, need, lat, lng, mood: hint, search } = req.body || {};
  if (!lat || !lng) {
    return res.json({ reply: "I need your location to search near you.", results: [], needLocation: true });
  }
  const pos = { lat, lng };
  const mood = MOODS.includes(hint) ? hint : "happy";
  const q = NEED_QUERY[need] || search || query || "restaurants";

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
      const list = results.length
        ? results.slice(0, 3).map((r) => `${r.name} (${r.distance}; ${(r.detail || "").slice(0, 80)})`).join(" | ")
        : "none found";
      const o = await llm([
        { role: "system", content: PERSONA },
        { role: "user", content: `The user said: "${query}". Your mood: ${mood}. Nearby results, closest first: ${list}
You already comforted them, so do not repeat that. In 2 or 3 short spoken sentences (under 45 words) name the closest one or two places with their distance, then end with one genuinely uplifting line. If mood is calm, be steady with no jokes. If nothing was found, say so kindly and suggest another need.
Reply ONLY with JSON: {"reply":""}` },
      ], 200);
      if (o.reply) { reply = o.reply; usedLlm = true; }
    } catch (e) {
      console.error("reply:", e.message);
    }
  }
  res.json({ reply, mood, results, llm: usedLlm });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Marga running on " + PORT));
