const crypto = require("crypto");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const ADMIN = process.env.ADMIN_KEY;
const enc = encodeURIComponent;

const hdr = (extra) => ({
  apikey: KEY,
  ...(KEY && KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + KEY }),
  "Content-Type": "application/json",
  ...extra,
});

async function sb(method, pathq, body) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, {
    method, headers: hdr({ Prefer: "return=representation" }), body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error("Supabase " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function count(table) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=id`, { method: "HEAD", headers: hdr({ Prefer: "count=exact" }) });
  return Number((r.headers.get("content-range") || "").split("/")[1]) || 0;
}

const T = {
  buttons: { f: { label: 40, emoji: 8, image_url: "url", kind: 12, value: 300, sort: "int" }, order: "sort.asc,id.asc" },
  places: { f: { name: 80, category: 40, city: 60, description: 400, image_url: "url", link: "url", lat: "num", lng: "num" }, order: "id.desc" },
};

function fields(table, b) {
  const out = {};
  for (const [k, t] of Object.entries(T[table].f)) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (t === "int") v = parseInt(v, 10) || 0;
    else if (t === "num") { v = v === "" || v === null ? null : Number(v); if (Number.isNaN(v)) v = null; }
    else if (t === "url") { v = v ? String(v).slice(0, 500) : null; if (v && !/^https:\/\//.test(v)) v = null; }
    else v = String(v).slice(0, t);
    out[k] = v;
  }
  if (table === "buttons" && out.kind && !["search", "data", "link", "ask"].includes(out.kind)) out.kind = "search";
  if (table === "buttons" && out.kind === "link" && out.value && !/^https:\/\//.test(out.value)) out.value = "";
  return out;
}

function km(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmt = (d) => (d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km");

const auth = (req, res, next) => {
  const a = Buffer.from(String(req.get("x-admin-key") || ""));
  const b = Buffer.from(ADMIN || "");
  if (!ADMIN || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  next();
};

module.exports = function (app) {
  const on = !!(URL_ && KEY);

  app.get("/api/config", async (req, res) => {
    if (!on) return res.json({ buttons: [] });
    try { res.json({ buttons: await sb("GET", `buttons?select=id,label,emoji,kind,value,image_url&order=${T.buttons.order}&limit=30`) }); }
    catch (e) { console.error("config:", e.message); res.json({ buttons: [] }); }
  });

  app.get("/api/custom", async (req, res) => {
    if (!on) return res.json({ results: [] });
    try {
      const cat = String(req.query.category || "").replace(/[^\w\s-]/g, "").slice(0, 40);
      const rows = await sb("GET", `places?select=*&category=ilike.${enc(cat)}&limit=30`);
      const lat = Number(req.query.lat), lng = Number(req.query.lng);
      const me = lat && lng ? { lat, lng } : null;
      const results = rows.map((p) => {
        const d = me && p.lat != null && p.lng != null ? km(me, { lat: p.lat, lng: p.lng }) : null;
        return {
          name: p.name, dist: d == null ? 1e9 : d,
          detail: [p.description, p.city].filter(Boolean).join(". "),
          distance: d == null ? p.city || "" : fmt(d),
          image: p.image_url, website: p.link,
          link: p.lat != null && p.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : null,
        };
      }).sort((a, b) => a.dist - b.dist).slice(0, 12).map(({ dist, ...r }) => r);
      res.json({ results });
    } catch (e) { console.error("custom:", e.message); res.json({ results: [] }); }
  });

  app.get("/api/admin/stats", auth, async (req, res) => {
    try {
      const [users, messages, recent] = await Promise.all([
        count("profiles"), count("messages"),
        sb("GET", "profiles?select=id,name,visits,last_seen&order=last_seen.desc&limit=30"),
      ]);
      res.json({ users, messages, recent });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/messages", auth, async (req, res) => {
    try {
      const u = String(req.query.user || "");
      const f = /^[a-zA-Z0-9-]{8,64}$/.test(u) ? `&user_id=eq.${u}` : "";
      res.json(await sb("GET", `messages?select=user_id,role,content,mood,created_at&order=id.desc&limit=60${f}`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/:table", auth, async (req, res) => {
    const t = T[req.params.table];
    if (!t) return res.status(404).json({ error: "no such table" });
    try { res.json(await sb("GET", `${req.params.table}?select=*&order=${t.order}&limit=200`)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/:table", auth, async (req, res) => {
    if (!T[req.params.table]) return res.status(404).json({ error: "no such table" });
    try { res.json(await sb("POST", req.params.table, fields(req.params.table, req.body || {}))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/:table/:id", auth, async (req, res) => {
    if (!T[req.params.table] || !/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "bad request" });
    try { res.json(await sb("PATCH", `${req.params.table}?id=eq.${req.params.id}`, fields(req.params.table, req.body || {}))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/:table/:id", auth, async (req, res) => {
    if (!T[req.params.table] || !/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "bad request" });
    try { await sb("DELETE", `${req.params.table}?id=eq.${req.params.id}`); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
};
