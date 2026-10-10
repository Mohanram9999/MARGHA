const KEY = process.env.GROQ_KEY;
const MODELS = [process.env.GROQ_MODEL || "openai/gpt-oss-120b", process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant"];
const MOODS = ["happy", "excited", "caring", "calm"];
const enc = encodeURIComponent;
const clean = (s, n) => String(s || "").slice(0, n);

async function groq(messages, max) {
  const errs = [];
  for (const model of MODELS) {
    try {
      const oss = model.startsWith("openai/gpt-oss");
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
        body: JSON.stringify({
          model, messages, temperature: 0.7,
          max_completion_tokens: max + (oss ? 900 : 0),
          ...(oss ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_object" },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "status " + r.status);
      return { data: JSON.parse(d.choices?.[0]?.message?.content || "{}"), model };
    } catch (e) { errs.push(model + ": " + e.message); }
  }
  throw new Error(errs.join(" | "));
}

const imgCache = new Map();
async function wikiImg(title) {
  if (!title) return null;
  if (imgCache.has(title)) return imgCache.get(title);
  try {
    const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + enc(title.replace(/ /g, "_")), {
      headers: { "User-Agent": "MargaApp/1.0" }, signal: AbortSignal.timeout(4000),
    });
    const d = r.ok ? await r.json() : null;
    const src = d?.thumbnail?.source || null;
    imgCache.set(title, src);
    return src;
  } catch (e) { return null; }
}

const SYSTEM = `You are Marga, a warm, upbeat travel-planning friend. Plan the trip the user asks for.
Reply ONLY with JSON:
{"need_info":false,"say":"","mood":"","destination":"","wiki":"","summary":"","plan":[{"day":1,"title":"","stops":[{"name":"","type":"sight","time":"Morning","tip":"","wiki":""}]}],"tips":[""]}
Rules:
- If you cannot tell the destination, set need_info true and put a friendly question in say (ask destination and number of days). Leave other fields empty.
- say: under 35 words, warm and excited, spoken aloud, no emojis; mention the destination and number of days.
- mood: happy, excited, caring or calm.
- Default 3 days if not specified, maximum 5. Give 3 to 5 stops per day mixing sights, food and activities, plus one place to stay (type "stay") on day 1. type is one of sight, food, stay, activity. Use real, well-known places only.
- wiki: the exact English Wikipedia article title for landmarks and for the destination, else "".
- tip: one short practical tip. Never invent prices or opening hours.
- tips: 3 short general tips. No markdown.`;

module.exports = function (app) {
  // Free category photos from Wikipedia for the cards and popup
  const CAT = { restaurants: "Restaurant", bank: "Bank", hotels: "Hotel", malls: "Shopping mall", famous: "Tourist attraction", hospitals: "Hospital", pharmacy: "Pharmacy", back: "Bus stop", parks: "Park", events: "Festival" };
  app.get("/api/catimg", async (req, res) => {
    res.set("Cache-Control", "public, max-age=86400");
    const out = {};
    await Promise.all(Object.entries(CAT).map(async ([k, t]) => { out[k] = await wikiImg(t); }));
    res.json(out);
  });

  app.get("/api/diag", async (req, res) => {
    if (!KEY) return res.json({ groq: false, error: "GROQ_KEY is not set on Render" });
    try {
      const o = await groq([{ role: "user", content: 'Reply with JSON {"ok":true}' }], 30);
      res.json({ groq: true, model: o.model });
    } catch (e) { res.json({ groq: false, error: e.message }); }
  });

  app.post("/api/trip", async (req, res) => {
    const { query, history, name } = req.body || {};
    if (!KEY) return res.json({ ok: false });
    try {
      const hist = (Array.isArray(history) ? history : [])
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 300) }));
      const sys = SYSTEM + (name ? ` The user's name is ${clean(name, 30)}.` : "");
      const { data: t } = await groq([{ role: "system", content: sys }, ...hist, { role: "user", content: clean(query, 400) }], 2400);

      if (t.need_info || !t.destination) {
        return res.json({ ok: true, mood: "happy", say: t.say || "I'd love to plan it! Where do you want to go, and for how many days?", trip: null });
      }
      const dest = clean(t.destination, 80);
      const plan = (Array.isArray(t.plan) ? t.plan : []).slice(0, 5).map((d, i) => ({
        day: i + 1,
        title: clean(d.title, 60),
        stops: (Array.isArray(d.stops) ? d.stops : []).slice(0, 6).map((s) => {
          const name = clean(s.name, 70);
          const type = ["sight", "food", "stay", "activity"].includes(s.type) ? s.type : "sight";
          const q = enc(name + ", " + dest);
          return {
            name, type, time: clean(s.time, 20), tip: clean(s.tip, 160), wiki: clean(s.wiki, 80), image: null,
            maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
            directions: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
            book: type === "stay" ? `https://www.booking.com/searchresults.html?ss=${enc(name + " " + dest)}` : null,
          };
        }),
      }));
      const hero = await wikiImg(clean(t.wiki, 80) || dest);
      await Promise.all(plan.flatMap((d) => d.stops).map(async (s) => {
        if (s.type === "sight" || s.type === "activity") s.image = await wikiImg(s.wiki || s.name);
      }));

      res.json({
        ok: true,
        mood: MOODS.includes(t.mood) ? t.mood : "excited",
        say: clean(t.say, 300) || `Let's plan your trip to ${dest}!`,
        trip: {
          destination: dest, days: plan.length, summary: clean(t.summary, 300), hero, plan,
          tips: (Array.isArray(t.tips) ? t.tips : []).slice(0, 4).map((x) => clean(x, 160)),
          links: {
            flights: `https://www.google.com/travel/flights?q=${enc("Flights to " + dest)}`,
            hotels: `https://www.booking.com/searchresults.html?ss=${enc(dest)}`,
            googleHotels: `https://www.google.com/travel/hotels/${enc(dest)}`,
          },
        },
      });
    } catch (e) {
      console.error("trip:", e.message);
      res.json({ ok: false });
    }
  });
};
