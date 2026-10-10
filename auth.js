const crypto = require("crypto");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const SECRET = process.env.AUTH_SECRET || "";
const enc = encodeURIComponent;

const hdr = (extra) => ({
  apikey: KEY,
  ...(KEY && KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + KEY }),
  "Content-Type": "application/json",
  ...extra,
});
async function sb(method, pathq, body) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, { method, headers: hdr({ Prefer: "return=representation" }), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error("Supabase " + r.status + " " + (await r.text()).slice(0, 160));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const mac = (d) => crypto.createHmac("sha256", SECRET).update(d).digest("base64url");
const sign = (p) => { const d = Buffer.from(JSON.stringify(p)).toString("base64url"); return d + "." + mac(d); };
function verify(t) {
  const [d, s] = String(t || "").split(".");
  if (!d || !s || !SECRET) return null;
  const a = Buffer.from(s), b = Buffer.from(mac(d));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(d, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const okEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const okId = (u) => typeof u === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(u);
const token = (a) => sign({ aid: a.id, exp: Date.now() + 30 * 24 * 3600 * 1000 });

const tries = new Map();
function limited(req) {
  const ip = String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();
  const now = Date.now();
  const a = (tries.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now); tries.set(ip, a);
  return a.length > 8;
}

module.exports = function (app) {
  const ready = !!(URL_ && KEY && SECRET);
  const gate = (req, res, next) => {
    if (!ready) return res.json({ ok: false, error: "Accounts are not set up yet." });
    if (limited(req)) return res.json({ ok: false, error: "Too many tries. Wait a minute." });
    next();
  };

  app.post("/api/auth/register", gate, async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const name = String(req.body.name || "").trim().slice(0, 30);
      const pw = String(req.body.password || "");
      const uid = okId(req.body.uid) ? req.body.uid : crypto.randomUUID();
      if (!okEmail(email)) return res.json({ ok: false, error: "Please enter a valid email." });
      if (pw.length < 8 || pw.length > 100) return res.json({ ok: false, error: "Password must be 8 to 100 characters." });
      const have = await sb("GET", `accounts?email=eq.${enc(email)}&select=id`);
      if (have.length) return res.json({ ok: false, error: "That email is already registered. Try logging in." });
      const salt = crypto.randomBytes(16).toString("hex");
      const [acc] = await sb("POST", "accounts", { email, name, uid, pass_hash: hash(pw, salt), salt });
      await sb("POST", "profiles?on_conflict=id", { id: uid, ...(name ? { name } : {}) }).catch(() => {});
      res.json({ ok: true, token: token(acc), name, email, uid });
    } catch (e) { console.error("register:", e.message); res.json({ ok: false, error: "Could not create the account." }); }
  });

  app.post("/api/auth/login", gate, async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const pw = String(req.body.password || "");
      const [acc] = await sb("GET", `accounts?email=eq.${enc(email)}&select=*`);
      const bad = () => res.json({ ok: false, error: "Wrong email or password." });
      if (!acc) return bad();
      const a = Buffer.from(hash(pw, acc.salt)), b = Buffer.from(acc.pass_hash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad();
      res.json({ ok: true, token: token(acc), name: acc.name || "", email: acc.email, uid: acc.uid });
    } catch (e) { console.error("login:", e.message); res.json({ ok: false, error: "Could not log in." }); }
  });

  app.post("/api/auth/me", async (req, res) => {
    const p = verify(req.body && req.body.token);
    if (!ready || !p) return res.json({ ok: false });
    try {
      const [acc] = await sb("GET", `accounts?id=eq.${p.aid}&select=name,email,uid`);
      res.json(acc ? { ok: true, name: acc.name || "", email: acc.email, uid: acc.uid } : { ok: false });
    } catch (e) { res.json({ ok: false }); }
  });

  app.post("/api/auth/delete", async (req, res) => {
    const p = verify(req.body && req.body.token);
    if (!ready || !p) return res.json({ ok: false });
    try { await sb("DELETE", `accounts?id=eq.${p.aid}`); res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
  });
};
