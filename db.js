const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const on = !!(URL_ && KEY);

async function sb(method, pathq, body, extra = {}) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, {
    method,
    headers: { apikey: KEY, ...(KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + KEY }), "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error("Supabase " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const okId = (u) => typeof u === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(u);
const upsert = { Prefer: "resolution=merge-duplicates,return=minimal" };

module.exports = function (app) {
  app.post("/api/user/init", async (req, res) => {
    const { uid } = req.body || {};
    if (!on || !okId(uid)) return res.json({ db: false });
    try {
      const rows = await sb("GET", `profiles?id=eq.${uid}&select=name,visits`);
      const visits = (rows[0]?.visits || 0) + 1;
      await sb("POST", "profiles?on_conflict=id", { id: uid, visits, last_seen: new Date().toISOString() }, upsert);
      const recent = await sb("GET", `messages?user_id=eq.${uid}&select=role,content&order=id.desc&limit=8`);
      res.json({ db: true, name: rows[0]?.name || "", visits, recent: recent.reverse() });
    } catch (e) {
      console.error("init:", e.message);
      res.json({ db: false });
    }
  });

  app.post("/api/log", async (req, res) => {
    const { uid, role, content, mood, name } = req.body || {};
    res.json({ ok: true });
    if (!on || !okId(uid)) return;
    try {
      if (content && (role === "user" || role === "assistant")) {
        await sb("POST", "messages",
          { user_id: uid, role, content: String(content).slice(0, 600), mood: mood || null },
          { Prefer: "return=minimal" });
      }
      if (name) await sb("POST", "profiles?on_conflict=id", { id: uid, name: String(name).slice(0, 30) }, upsert);
    } catch (e) {
      console.error("log:", e.message);
    }
  });

  app.post("/api/forget", async (req, res) => {
    const { uid } = req.body || {};
    if (on && okId(uid)) {
      try { await sb("DELETE", `profiles?id=eq.${uid}`, null, { Prefer: "return=minimal" }); }
      catch (e) { console.error("forget:", e.message); }
    }
    res.json({ ok: true });
  });
};
