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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return response(req, { error: "Metode tidak diizinkan" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Login diperlukan.");

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Konfigurasi server belum lengkap.");

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) throw new Error("Sesi tidak valid. Silakan login kembali.");

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: activeRole, error: roleError } = await caller.rpc("current_role");
    const { data: actor, error: actorError } = await admin.from("profiles")
      .select("role,is_active,is_verified,must_change_password").eq("id", authData.user.id).single();
    if (roleError || activeRole !== "admin" || actorError || actor?.role !== "admin" || !actor.is_active || !actor.is_verified || actor.must_change_password) {
      throw new Error("Akses admin diperlukan. Pastikan akun aktif dan password sudah diperbarui.");
    }

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create") {
      const name = String(body.name || "").trim().replace(/\s+/g, " ");
      const username = String(body.username || "").trim().toLowerCase();
      const role = String(body.role || "");
      const memberType = String(body.member_type || "employee");
      const unit = String(body.klass || "Unit kerja").trim();
      const password = String(body.password || "");
      if (name.length < 3 || name.length > 80 || !/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error("Nama atau username tidak valid.");
      if (!["staff", "admin", "leadership"].includes(role)) throw new Error("Jenis akun tidak valid.");
      if (!["student", "teacher", "employee"].includes(memberType)) throw new Error("Jenis warga sekolah tidak valid.");
      if (password.length < 12 || password.length > 72) throw new Error("Password sementara minimal 12 karakter.");
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `${username}@login.steam-yadika.invalid`, password, email_confirm: true,
      });
      if (createError) throw createError;
      const { error: profileError } = await admin.from("profiles").insert({
        id: created.user.id, username, full_name: name, class_name: unit,
        member_type: memberType, role, is_active: true, is_verified: true, must_change_password: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "account_created", target_id: created.user.id, details: { role, member_type: memberType } });
      return response(req, { success: true });
    }

    if (action === "list" || action === "staff_list" || action === "pending_list") {
      const requestedLimit = Number(body.limit || (action === "staff_list" ? 250 : 100));
      const requestedOffset = Number(body.offset || 0);
      const maxLimit = action === "staff_list" ? 500 : 100;
      const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 100, 1), maxLimit);
      const offset = Math.min(Math.max(Number.isInteger(requestedOffset) ? requestedOffset : 0, 0), 1000000);
      let query = admin.from("profiles")
        .select("id,username,full_name,class_name,member_type,role,is_active,is_verified,must_change_password,created_at")
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      if (action === "staff_list") query = query.eq("role", "staff").eq("is_active", true).eq("is_verified", true);
      if (action === "pending_list") query = query.eq("role", "member").eq("is_active", true).eq("is_verified", false);
      const { data, error } = await query.range(offset, offset + limit - 1);
      if (error) throw error;
      const rows = data || [];
      return response(req, { accounts: rows, has_more: action !== "staff_list" && rows.length === limit });
    }

    if (action === "set_active" || action === "set_verified") {
      const userId = String(body.user_id || "");
      if (typeof body.value !== "boolean") throw new Error("Status akun tidak valid.");
      const value = body.value;
      if (!userId) throw new Error("ID akun tidak valid.");
      if (userId === authData.user.id && !value) throw new Error("Admin tidak dapat menonaktifkan atau membatalkan verifikasi akunnya sendiri.");
      const { data: target, error: targetError } = await admin.from("profiles")
        .select("role,username,is_active,is_verified").eq("id", userId).single();
      if (targetError || !target) throw new Error("Akun tidak ditemukan.");
      if (target.role === "admin" && !value && target.is_active && target.is_verified) {
        const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("is_active", true).eq("is_verified", true);
        if (error) throw error;
        if ((count || 0) <= 1) throw new Error("Admin aktif dan terverifikasi terakhir tidak dapat dinonaktifkan atau dibatalkan verifikasinya.");
      }
      const patch = action === "set_active" ? { is_active: value } : { is_verified: value };
      const { error } = await admin.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: action === "set_active" ? "account_active_changed" : "account_verification_changed", target_id: userId, details: { value } });
      return response(req, { success: true });
    }

    if (action === "reset_password") {
      const userId = String(body.user_id || "");
      const password = String(body.password || "");
      if (!userId) throw new Error("ID akun tidak valid.");
      if (password.length < 12 || password.length > 72) throw new Error("Password sementara minimal 12 karakter.");
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      // Invalidate tokens issued before this reset. A fresh login with the temporary password is required.
      const { error: profileError } = await admin.from("profiles").update({ must_change_password: true, session_valid_after: new Date().toISOString() }).eq("id", userId);
      if (profileError) throw profileError;
      await admin.from("audit_logs").insert({ actor_id: authData.user.id, action: "password_reset_by_admin", target_id: userId });
      return response(req, { success: true });
    }

    throw new Error("Aksi tidak dikenal.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proses gagal.";
    return response(req, { error: message }, 400);
  }
});
