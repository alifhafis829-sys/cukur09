import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => {
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  const requestOrigin = req.headers.get("origin") || "";
  const allowedOrigin = configuredOrigin && requestOrigin === configuredOrigin ? configuredOrigin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const response = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value || "unknown-client");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return response(req, { error: "Metode tidak diizinkan" }, 405);
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  if (!configuredOrigin || req.headers.get("origin") !== configuredOrigin) {
    return response(req, { error: "Asal permintaan tidak diizinkan." }, 403);
  }

  try {
    const body = await req.json();
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const username = String(body.username || "").trim().toLowerCase();
    const memberType = String(body.member_type || "");
    const unit = String(body.klass || "").trim();
    const password = String(body.password || "");

    if (name.length < 3 || name.length > 80) throw new Error("Nama lengkap harus 3–80 karakter.");
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error("Username harus 3–32 karakter dan hanya berisi huruf, angka, titik, garis bawah, atau tanda hubung.");
    if (!["student", "teacher", "employee"].includes(memberType)) throw new Error("Pilih jenis warga sekolah yang valid.");
    if (unit.length < 2 || unit.length > 40) throw new Error("Isi kelas atau unit kerja.");
    if (password.length < 10 || password.length > 72) throw new Error("Password harus 10–72 karakter.");

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Konfigurasi server belum lengkap.");
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Best-effort per-IP registration throttle. Only a one-way hash is stored.
    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const ipHash = await sha256(ip);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Keep only a short rolling history of hashed network identifiers.
    const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await admin.from("registration_attempts").delete().lt("created_at", retentionCutoff);
    if (cleanupError) throw new Error("Pendaftaran sementara tidak tersedia. Coba lagi nanti.");
    const { count, error: countError } = await admin.from("registration_attempts")
      .select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
    if (countError) throw new Error("Pendaftaran sementara tidak tersedia. Coba lagi nanti.");
    if ((count || 0) >= 10) return response(req, { error: "Terlalu banyak percobaan pendaftaran dari jaringan ini. Coba lagi nanti." }, 429);
    const { error: attemptError } = await admin.from("registration_attempts").insert({ ip_hash: ipHash });
    if (attemptError) throw new Error("Pendaftaran sementara tidak tersedia. Coba lagi nanti.");

    const email = `${username}@login.steam-yadika.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createError) throw createError;

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      full_name: name,
      class_name: unit,
      member_type: memberType,
      role: "member",
      is_active: true,
      is_verified: false,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    return response(req, { success: true, message: "Pendaftaran berhasil dan menunggu verifikasi admin." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pendaftaran gagal.";
    return response(req, { error: message }, 400);
  }
});
