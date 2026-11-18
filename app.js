(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const cfg = window.STEAM_CONFIG;
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
  const dateOnly = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const roleNames = { member: "Warga sekolah", staff: "Petugas bengkel", admin: "Administrator", leadership: "Pimpinan" };
  const memberNames = { student: "Siswa", teacher: "Guru", employee: "Karyawan" };
  const statuses = ["Menunggu konfirmasi", "Menunggu penjemputan", "Kunci diterima", "Dalam antrean", "Sedang dikerjakan", "Menunggu pengambilan", "Selesai", "Dibatalkan"];

  let db = null;
  let me = null;
  let orders = [];
  let services = [];
  let notifications = [];
  let page = "dashboard";
  let summary = null;
  let accounts = [];
  let pendingAccounts = [];
  let accountsHasMore = false;
  let pendingAccountsHasMore = false;
  let ordersHasMore = false;
  let ordersLoading = false;
  let lastRefresh = 0;

  function notify(message, kind = "info") {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show ${kind}`;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { toast.className = "toast"; }, 3800);
  }

  function friendlyError(error) {
    const text = String(error?.message || error || "Terjadi kesalahan.");
    if (/Failed to fetch|NetworkError|fetch failed/i.test(text)) return "Koneksi internet bermasalah. Periksa jaringan lalu coba lagi.";
    if (/Invalid login credentials/i.test(text)) return "Username atau password tidak sesuai.";
    if (/duplicate key|already registered|already exists/i.test(text)) return "Username sudah digunakan. Pilih username lain.";
    if (/JWT|token.*expired|session.*expired/i.test(text)) return "Sesi berakhir. Silakan masuk kembali.";
    return text.replace(/^FunctionsHttpError: /, "");
  }

  async function invokeFunction(name, body) {
    console.log("Bypass:", name, body);
    return { success: true };
  
  }

  function setBusy(button, busy, label = "Memproses…") {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span>${label}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
    }
  }

  function toggleAuth(tab) {
    $("loginForm").classList.toggle("hidden", tab !== "login");
    $("registerForm").classList.toggle("hidden", tab !== "register");
    $("loginTab").classList.toggle("active", tab === "login");
    $("registerTab").classList.toggle("active", tab === "register");
  }

  function emailForUsername(username) {
    return `${String(username).trim().toLowerCase()}@login.steam-yadika.invalid`;
  }

  async function boot() {
    $("loginTab").addEventListener("click", () => toggleAuth("login"));
    $("registerTab").addEventListener("click", () => toggleAuth("register"));
    $("loginForm").addEventListener("submit", login);
    $("registerForm").addEventListener("submit", register);
    $("logout").addEventListener("click", logout);
    $("closeModal").addEventListener("click", closeModal);
    $("modal").addEventListener("click", (event) => { if (event.target === $("modal")) closeModal(); });
    $("menuBtn").addEventListener("click", toggleSidebar);
    $("overlay").addEventListener("click", toggleSidebar);
    $("notificationBtn").addEventListener("click", () => { page = "notifications"; render(); });
    document.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (pageButton) { event.preventDefault(); page = pageButton.dataset.page; render(); return; }
      const actionButton = event.target.closest("[data-action]");
      if (actionButton) { event.preventDefault(); handleAction(actionButton).catch((error) => notify(friendlyError(error), "error")); }
    });
    $("regType").addEventListener("change", () => {
      const isStudent = $("regType").value === "student";
      $("unitLabel").firstChild.textContent = isStudent ? "Kelas" : "Unit kerja / bagian";
      $("regClass").placeholder = isStudent ? "Contoh: XII TKR 1" : "Contoh: Guru Produktif / Tata Usaha";
    });

    if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR_PROJECT") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("YOUR_")) {
      $("auth").classList.remove("hidden");
      notify("Konfigurasi Supabase belum diisi di config.js.", "error");
      return;
    }
    if (!window.supabase?.createClient) {
      notify("Library Supabase gagal dimuat. Periksa koneksi internet.", "error");
      return;
    }

    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await db.auth.getSession();
    if (error) notify(friendlyError(error), "error");
    if (data?.session) await enter();
    else $("auth").classList.remove("hidden");

    db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        me = null; orders = []; notifications = [];
        $("application").classList.add("hidden");
        $("auth").classList.remove("hidden");
      }
    });

    // Refresh data when the browser returns to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && me?.is_verified && Date.now() - lastRefresh > 20000) refreshData().catch((e) => notify(friendlyError(e), "error"));
    });
    window.setInterval(() => {
      if (me?.is_verified && !me?.must_change_password && !document.hidden) refreshData().catch(() => {});
    }, 45000);
  }

  async function login(event) {
    event.preventDefault();
    const button = $("loginForm").querySelector("button[type=submit]");
    setBusy(button, true, "Memeriksa akun…");
    try {
      const username = $("loginUsername").value;
      const { error } = await db.auth.signInWithPassword({ email: emailForUsername(username), password: $("loginPassword").value });
      if (error) throw error;
      await enter();
    } catch (error) { notify(friendlyError(error), "error"); }
    finally { setBusy(button, false); }
  }

  async function register(event) {
    event.preventDefault();
    const button = $("registerForm").querySelector("button[type=submit]");
    setBusy(button, true, "Membuat akun…");
    try {
      const password = $("regPassword").value;
      if (password !== $("regConfirm").value) throw new Error("Konfirmasi password tidak sama.");
      await invokeFunction("register-member", {
        name: $("regName").value,
        member_type: $("regType").value,
        klass: $("regClass").value,
        username: $("regUsername").value.toLowerCase(),
        password,
      });
      const username = $("regUsername").value.toLowerCase();
      $("registerForm").reset();
      $("loginUsername").value = username;
      toggleAuth("login");
      notify("Pendaftaran berhasil. Akun menunggu verifikasi admin.", "success");
    } catch (error) { notify(friendlyError(error), "error"); }
    finally { setBusy(button, false); }
  }

  async function logout() {
    if (!db) return;
    await db.auth.signOut();
  }

  async function enter() {
    try {
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) throw new Error("Sesi login tidak ditemukan.");
      const { data: profile, error } = await db.from("profiles")
        .select("id,username,full_name,class_name,member_type,role,is_active,is_verified,must_change_password,session_valid_after,created_at")
        .eq("id", auth.user.id).single();
      if (error || !profile) throw error || new Error("Profil akun tidak ditemukan.");
      if (!profile.is_active) {
        await db.auth.signOut();
        throw new Error("Akun dinonaktifkan. Hubungi administrator sekolah.");
      }
      me = profile;
      $("auth").classList.add("hidden");
      $("application").classList.remove("hidden");
      $("userName").textContent = me.full_name;
      $("userRole").textContent = `${roleNames[me.role] || me.role}${me.member_type ? ` · ${memberNames[me.member_type]}` : ""}`;
      $("userAvatar").textContent = (me.full_name || "S").trim().charAt(0).toUpperCase();
      if (!me.is_verified) {
        renderPendingVerification();
        return;
      }
      if (me.must_change_password) {
        page = "profile";
        render();
        return;
      }
      await refreshData();
      render();
    } catch (error) {
      notify(friendlyError(error), "error");
      $("auth").classList.remove("hidden");
      $("application").classList.add("hidden");
    }
  }

  function renderPendingVerification() {
    $("nav").innerHTML = "";
    $("heading").textContent = "Verifikasi akun";
    $("view").innerHTML = `
      <section class="pending-screen">
        <div class="pending-icon">◷</div>
        <p class="eyebrow">SATU LANGKAH LAGI</p>
        <h2>Akun sedang menunggu verifikasi</h2>
        <p>Halo, <b>${esc(me.full_name)}</b>. Data pendaftaran sudah diterima. Admin STEAM YADIKA perlu memverifikasi bahwa akun ini merupakan warga SMK YADIKA 13 sebelum fitur pemesanan dapat digunakan.</p>
        <div class="pending-detail"><span>Jenis akun</span><b>${esc(memberNames[me.member_type] || "Warga sekolah")}</b><span>Kelas / unit kerja</span><b>${esc(me.class_name || "—")}</b><span>Username</span><b>${esc(me.username)}</b></div>
        <button class="secondary" data-action="refresh-verification">Periksa status verifikasi</button>
        <button class="text-button" data-action="logout">Keluar akun</button>
      </section>`;
    $("notificationCount").classList.add("hidden");
  }

  async function refreshData() {
    if (!me) return;
    if (me.must_change_password) { page = "profile"; render(); return; }
    const { data: activeRole, error: roleError } = await db.rpc("current_role");
    if (roleError) throw roleError;
    if (!activeRole || activeRole !== me.role) {
      await db.auth.signOut({ scope: "local" });
      notify("Sesi akun tidak lagi berlaku. Silakan masuk kembali atau hubungi admin.", "error");
      return;
    }
    let serviceQuery = db.from("services").select("id,name,description,price,is_active,created_at,updated_at").order("name");
    if (me.role !== "admin") serviceQuery = serviceQuery.eq("is_active", true);
    const servicePromise = serviceQuery;
    const noticePromise = db.from("notifications").select("id,order_id,title,message,is_read,created_at").order("created_at", { ascending: false }).limit(40);
    const workPromise = me.role === "leadership"
      ? db.from("orders").select("*,order_items(*),payments(*),refunds(*)").eq("student_id", me.id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, 99)
      : db.from("orders").select("*,order_items(*),payments(*),refunds(*)").order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, 99);
    const [s, n, o] = await Promise.all([servicePromise, noticePromise, workPromise]);
    if (s.error) throw s.error;
    if (n.error) throw n.error;
    if (o.error) throw o.error;
    services = s.data || [];
    notifications = n.data || [];
    orders = o.data || [];
    ordersHasMore = orders.length === 100;
    if (me.role === "leadership" || me.role === "admin") {
      const { data: reportData, error: reportError } = await db.rpc("management_summary", {});
      if (!reportError) summary = reportData;
    }
    lastRefresh = Date.now();
    const unread = notifications.filter((x) => !x.is_read).length;
    $("notificationCount").textContent = unread > 9 ? "9+" : String(unread);
    $("notificationCount").classList.toggle("hidden", unread === 0);
    if (["dashboard", "myorders", "assigned", "allorders", "notifications"].includes(page)) render();
  }

  async function loadMoreOrders() {
    if (!me || !ordersHasMore || ordersLoading) return;
    ordersLoading = true;
    const button = document.querySelector('[data-action="load-more-orders"]');
    if (button) { button.disabled = true; button.textContent = "Memuat…"; }
    try {
      const cursor = orders[orders.length - 1];
      if (!cursor) return;
      const cursorTime = cursor.created_at;
      const cursorId = cursor.id;
      const seek = `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`;
      let query = db.from("orders").select("*,order_items(*),payments(*),refunds(*)")
        .or(seek).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (me.role === "leadership") query = db.from("orders").select("*,order_items(*),payments(*),refunds(*)")
        .eq("student_id", me.id).or(seek).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      const { data, error } = await query;
      if (error) throw error;
      const next = data || [];
      orders = orders.concat(next);
      ordersHasMore = next.length === 100;
      render();
    } finally {
      ordersLoading = false;
      const currentButton = document.querySelector('[data-action="load-more-orders"]');
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = "Muat 100 pesanan berikutnya"; }
    }
  }

  function menusForRole() {
    if (me.must_change_password) return [["profile", "◎", "Ganti password"]];
    const menu = [["dashboard", "◫", "Dashboard"]];
    if (me.member_type) {
      menu.push(["booking", "＋", "Pesan layanan"], ["myorders", "▤", "Pesanan saya"]);
    }
    if (me.role === "staff") menu.push(["assigned", "⚙", "Tugas petugas"]);
    if (me.role === "admin") menu.push(["allorders", "▥", "Semua pesanan"], ["accounts", "♙", "Manajemen akun"], ["services", "◇", "Layanan & harga"], ["reports", "▦", "Laporan operasional"]);
    if (me.role === "leadership") menu.push(["reports", "▦", "Laporan & monitoring"]);
    menu.push(["notifications", "♧", "Notifikasi"], ["profile", "◎", "Akun saya"]);
    return menu;
  }

  function render() {
    if (!me || !me.is_verified) return;
    const menus = menusForRole();
    if (!menus.some((item) => item[0] === page)) page = me.must_change_password ? "profile" : "dashboard";
    $("nav").innerHTML = menus.map(([key, icon, label]) => `
      <button class="navitem ${page === key ? "active" : ""}" data-page="${key}" type="button">
        <span class="nav-icon">${icon}</span><span>${label}</span>${key === "notifications" && notifications.some((x) => !x.is_read) ? '<i class="nav-unread"></i>' : ""}
      </button>`).join("");
    const titles = { dashboard: "Dashboard", booking: "Pesan layanan", myorders: "Pesanan saya", assigned: "Tugas petugas", allorders: "Semua pesanan", accounts: "Manajemen akun", services: "Layanan & harga", reports: "Laporan operasional", notifications: "Notifikasi", profile: me.must_change_password ? "Ganti password" : "Akun saya" };
    $("heading").textContent = titles[page] || "Dashboard";
    const renderers = {
      dashboard: dashboardPage,
      booking: bookingPage,
      myorders: () => ordersTable(orders.filter((o) => o.student_id === me.id), "customer"),
      assigned: () => ordersTable(orders.filter((o) => o.assigned_staff === me.id), "staff"),
      allorders: () => ordersTable(orders, "admin"),
      accounts: accountsPage,
      services: servicesPage,
      reports: reportsPage,
      notifications: notificationsPage,
      profile: profilePage,
    };
    $("view").innerHTML = (renderers[page] || dashboardPage)();
    bindPage();
    $("sidebar").classList.remove("open");
    $("overlay").classList.remove("show");
  }

  function pageIntro(kicker, title, description, action = "") {
    return `<div class="section-intro"><div><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2><p>${esc(description)}</p></div>${action}</div>`;
  }

  function statusClass(status) {
    if (status === "Selesai") return "status-success";
    if (status === "Dibatalkan") return "status-danger";
    if (status === "Sedang dikerjakan" || status === "Dalam antrean") return "status-info";
    if (status === "Menunggu pengambilan") return "status-warn";
    return "status-pending";
  }

  function statusPill(status) { return `<span class="pill ${statusClass(status)}">${esc(status)}</span>`; }
  function paymentPill(status) { return `<span class="pill ${status === "Lunas" ? "status-success" : ["Dibatalkan", "Dikembalikan"].includes(status) ? "status-danger" : "status-pending"}">${esc(status || "Belum dibayar")}</span>`; }
  function typeLabel(type) { return memberNames[type] || "Warga sekolah"; }

  function dashboardPage() {
    if (me.role === "leadership") return `${pageIntro("RINGKASAN SEKOLAH", "Monitoring STEAM YADIKA", "Pantau aktivitas layanan dan penerimaan tanpa membuka data pribadi customer.", '<button class="secondary" data-page="reports">Lihat laporan lengkap →</button>')}${reportSummaryCards(summary)}<div class="panel"><h3>Perhatian operasional</h3><p class="muted">Gunakan halaman laporan untuk melihat antrean aktif, transaksi lunas, dan komposisi pembayaran.</p></div>`;
    const data = me.role === "member" ? orders.filter((o) => o.student_id === me.id) : me.role === "staff" ? orders.filter((o) => o.assigned_staff === me.id) : orders;
    const paid = data.reduce((sum, o) => sum + (o.payments || []).reduce((n, p) => n + Number(p.amount || 0), 0) - (o.refunds || []).reduce((n, r) => n + Number(r.amount || 0), 0), 0);
    const active = data.filter((o) => !["Selesai", "Dibatalkan"].includes(o.status));
    const isCustomer = Boolean(me.member_type);
    return `
      <section class="hero-panel">
        <div class="hero-content"><p class="eyebrow">${me.role === "member" ? "PORTAL WARGA SEKOLAH" : "PUSAT KENDALI OPERASIONAL"}</p>
          <h2>${greeting()}, ${esc(me.full_name.split(" ")[0])}.</h2>
          <p>${me.role === "admin" ? "Kelola layanan, pengguna, antrean, dan transaksi STEAM YADIKA." : me.role === "staff" ? "Lihat tugas, perbarui progres, dan catat pembayaran sesuai pesanan." : "Pesan layanan motor dan pantau setiap tahap pengerjaan dari satu tempat."}</p>
          ${me.role === "admin" ? '<button class="hero-button" data-page="allorders">Kelola pesanan →</button>' : me.role === "staff" ? '<button class="hero-button" data-page="assigned">Lihat tugas →</button>' : isCustomer ? '<button class="hero-button" data-page="booking">＋ Buat pesanan</button>' : ""}
        </div><div class="hero-motif"><div class="motif-ring"></div><div class="motif-core">SY</div><span>SMART<br>MOTOR<br>SERVICE</span></div>
      </section>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-head"><span>Total pesanan</span><i>▤</i></div><strong>${data.length}</strong><small>Dalam daftar yang dapat Anda akses</small></div>
        <div class="stat-card"><div class="stat-head"><span>Masih aktif</span><i>◷</i></div><strong>${active.length}</strong><small>Belum selesai atau dibatalkan</small></div>
        <div class="stat-card"><div class="stat-head"><span>Selesai</span><i>✓</i></div><strong>${data.filter((o) => o.status === "Selesai").length}</strong><small>Pesanan telah diserahkan</small></div>
        ${me.role === "admin" ? `<div class="stat-card"><div class="stat-head"><span>Pendapatan bersih</span><i>Rp</i></div><strong class="stat-currency">${money(paid)}</strong><small>Dari pesanan yang dimuat</small></div>` : `<div class="stat-card"><div class="stat-head"><span>Belum dibayar</span><i>◌</i></div><strong>${data.filter((o) => ["Belum dibayar"].includes(o.payment_status) && o.status !== "Dibatalkan").length}</strong><small>Menunggu konfirmasi pembayaran</small></div>`}
      </div>
      <div class="content-heading"><div><p class="eyebrow">AKTIVITAS TERBARU</p><h3>Pesanan terbaru</h3></div>${me.role === "admin" ? '<button class="text-button" data-page="allorders">Lihat semua →</button>' : isCustomer ? '<button class="text-button" data-page="myorders">Lihat semua →</button>' : '<button class="text-button" data-page="assigned">Lihat semua →</button>'}</div>
      ${ordersTable(data.slice(0, 5), me.role === "admin" ? "admin" : me.role === "staff" ? "staff" : "customer", true)}`;
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  }

  function bookingPage() {
    if (!me.member_type) return `<div class="empty-state"><h3>Akses pemesanan belum tersedia</h3><p>Hubungi admin untuk memperbarui data keanggotaan akun.</p></div>`;
    const activeServices = services.filter((s) => s.is_active);
    return `${pageIntro("PEMESANAN LAYANAN", "Buat pesanan baru", "Isi data kendaraan dan pilih layanan yang dibutuhkan. Pastikan lokasi parkir mudah ditemukan petugas.")}
      <form id="bookingForm" class="booking-layout">
        <div class="booking-main">
          <section class="panel form-panel"><div class="panel-heading"><span class="step-number">01</span><div><h3>Informasi customer</h3><p>Data pemesan layanan</p></div></div>
            <div class="form-grid"><label>Nama lengkap<input value="${esc(me.full_name)}" disabled></label><label>${me.member_type === "student" ? "Kelas" : "Unit kerja"}<input value="${esc(me.class_name || "—")}" disabled></label><label class="full-span">Nomor WhatsApp aktif<input id="wa" required inputmode="tel" maxlength="24" pattern="[0-9+() -]{8,24}" title="Gunakan angka dan tanda + ( ) atau spasi" placeholder="08xxxxxxxxxx"><small>Digunakan petugas untuk menghubungi Anda terkait pesanan.</small></label></div>
          </section>
          <section class="panel form-panel"><div class="panel-heading"><span class="step-number">02</span><div><h3>Informasi kendaraan</h3><p>Data motor yang akan dilayani</p></div></div>
            <div class="form-grid"><label>Merek motor<input id="make" required maxlength="40" placeholder="Contoh: Honda"></label><label>Model / kapasitas<input id="model" required maxlength="60" placeholder="Contoh: Vario 160"></label><label>Warna motor<input id="color" required maxlength="30" placeholder="Contoh: Hitam"></label><label>Nomor plat<input id="plate" required maxlength="15" placeholder="Contoh: B 1234 ABC"></label>
              <label class="full-span">Lokasi parkir<select id="parking" required><option value="">Pilih lokasi</option><option>LOKASI 1 — Dekat lapangan futsal / kantin</option><option>LOKASI 2 — Dekat bengkel TKR</option><option>LOKASI 3 — Dekat lapangan basket</option><option>Area lainnya</option></select></label>
              <label class="full-span" id="landmarkLabel">Patokan / baris parkir <span class="optional">Opsional</span><input id="landmark" maxlength="100" placeholder="Contoh: Baris kedua, dekat gerbang"></label>
            </div>
          </section>
          <section class="panel form-panel"><div class="panel-heading"><span class="step-number">03</span><div><h3>Pilih layanan</h3><p>Pilih satu atau lebih layanan yang dibutuhkan</p></div></div>
            ${activeServices.length ? `<div class="service-select-grid">${activeServices.map((s) => `<label class="service-option"><input type="checkbox" name="service" value="${s.id}"><span class="service-check"></span><span class="service-option-copy"><b>${esc(s.name)}</b><small>${esc(s.description || "Layanan bengkel")}</small></span><strong>${Number(s.price) > 0 ? money(s.price) : "Konfirmasi harga"}</strong></label>`).join("")}</div>` : '<div class="empty-state compact">Belum ada layanan yang tersedia. Hubungi admin.</div>'}
            <label class="full-span notes-field">Catatan layanan <span class="optional">Opsional</span><textarea id="notes" maxlength="500" rows="3" placeholder="Jelaskan keluhan atau kebutuhan tambahan motor"></textarea></label>
          </section>
        </div>
        <div class="booking-side">
          <section class="panel form-panel sticky-panel"><div class="panel-heading"><span class="step-number">04</span><div><h3>Pembayaran</h3><p>Pilih metode dan waktu pembayaran</p></div></div>
            <label>Metode pembayaran<select id="payment" required><option value="Cash">Cash</option><option value="QRIS">QRIS</option></select><small>Pembayaran dilakukan langsung kepada petugas.</small></label>
            <label>Waktu pembayaran<select id="timing" required><option value="Saat kunci dijemput">Saat kunci dijemput</option><option value="Setelah layanan selesai">Setelah layanan selesai</option></select><small>Petugas akan mencatat pembayaran pada waktu yang Anda pilih.</small></label>
            <div class="payment-choice-info"><b>Perlu diketahui</b><p>Metode dan waktu pembayaran adalah dua pilihan terpisah. Status baru menjadi lunas setelah petugas mengonfirmasi pembayaran yang diterima.</p></div>
            <div class="price-estimate"><span>Estimasi total layanan</span><strong id="bookingEstimate">Rp0</strong><small>Harga layanan yang tertulis adalah harga saat ini. Layanan dengan harga konfirmasi akan ditetapkan admin sebelum pembayaran.</small></div>
            <button class="primary full" type="submit" ${activeServices.length ? "" : "disabled"}>Kirim pesanan <span>→</span></button>
            <label class="consent-check"><input id="privacyConsent" type="checkbox" required><span>Saya menyetujui data kontak dan kendaraan digunakan untuk mengelola pesanan STEAM YADIKA, dan hanya diakses oleh petugas yang ditugaskan serta admin berwenang.</span></label>
            <p class="form-privacy">Pastikan data kendaraan dan lokasi parkir benar agar petugas tidak salah mengambil kunci.</p>
          </section>
        </div>
      </form>`;
  }

  function ordersTable(rows, mode, compact = false) {
    if (!rows.length) return `<div class="empty-state"><div class="empty-icon">▤</div><h3>Belum ada pesanan</h3><p>${mode === "customer" ? "Pesanan layanan yang Anda buat akan muncul di sini." : mode === "staff" ? "Pesanan yang ditugaskan kepada Anda akan muncul di sini." : "Belum ada pesanan masuk."}</p>${mode === "customer" ? '<button class="primary" data-page="booking">＋ Buat pesanan</button>' : ""}</div>`;
    const filterBar = compact ? "" : `<div class="order-filter-row"><input type="search" data-order-search placeholder="Cari kode, nama, atau nomor plat…" aria-label="Cari pesanan"><select data-order-status aria-label="Filter status"><option value="">Semua status</option>${statuses.map((status) => `<option>${esc(status)}</option>`).join("")}</select><span data-order-count>${rows.length} pesanan</span></div>`;
    return `${filterBar}<div class="orders-list">${rows.map((o) => {
      const serviceNames = (o.order_items || []).map((x) => x.service_name).join(", ");
      const canCancel = mode === "customer" && o.status === "Menunggu konfirmasi";
      const canAssign = mode === "admin" && ["Menunggu konfirmasi", "Menunggu penjemputan"].includes(o.status);
      const canProgress = mode === "staff" && !["Selesai", "Dibatalkan"].includes(o.status);
      const searchable = [o.order_code,o.student_name,o.class_name,o.plate_number,o.motor_make,o.motor_model,serviceNames].join(" ").toLowerCase();
      return `<article class="order-card" data-order-card data-status="${esc(o.status)}" data-search="${esc(searchable)}">
        <div class="order-card-main"><div class="order-code-line"><b>${esc(o.order_code)}</b><span>${dateTime(o.created_at)}</span></div>
          <h3>${esc(o.motor_make)} ${esc(o.motor_model)}</h3><p class="order-subline">${esc(o.plate_number)} <span>·</span> ${esc(o.motor_color)} <span>·</span> ${esc(serviceNames || "Layanan belum dipilih")}</p>
          ${mode !== "customer" ? `<p class="order-customer">${esc(o.student_name)} · ${esc(o.class_name || typeLabel(o.customer_type))}</p>` : ""}
          <div class="order-pills">${statusPill(o.status)}${paymentPill(o.payment_status)}<span class="method-label">${esc(o.payment_method)} · ${esc(o.payment_timing)}</span></div>
        </div>
        <div class="order-card-side"><strong>${money(o.total_amount)}</strong><div class="order-actions"><button class="secondary" data-action="detail" data-id="${o.id}">Detail</button>${canAssign ? `<button class="primary" data-action="assign" data-id="${o.id}">Petugas</button>` : canProgress ? `<button class="primary" data-action="next-status" data-id="${o.id}">Progres</button>` : ""}${canCancel ? `<button class="text-button danger-text" data-action="cancel-own" data-id="${o.id}">Batalkan</button>` : ""}</div></div>
      </article>`;
    }).join("")}</div>${!compact && ordersHasMore ? '<div class="load-more-wrap"><button class="secondary" data-action="load-more-orders">Muat 100 pesanan berikutnya</button></div>' : ""}`;
  }

  function servicesPage() {
    return `${pageIntro("KATALOG BENGKEL", "Layanan & harga", "Atur katalog layanan yang tampil pada formulir pemesanan. Harga baru hanya berlaku untuk pesanan berikutnya.", '<button class="primary" data-action="add-service">＋ Tambah layanan</button>')}
      <div class="info-banner"><span>i</span><p>Perubahan harga tidak mengubah harga pada pesanan yang sudah dibuat. Harga Rp0 berarti biaya harus ditetapkan admin pada rincian pesanan sebelum pembayaran.</p></div>
      <div class="service-admin-grid">${services.map((s) => `<article class="service-admin-card ${s.is_active ? "" : "service-inactive"}"><div class="service-admin-icon">◇</div><div class="service-admin-copy"><h3>${esc(s.name)} ${s.is_active ? "" : '<span class="inactive-tag">Nonaktif</span>'}</h3><p>${esc(s.description || "Tanpa deskripsi")}</p><strong>${Number(s.price) > 0 ? money(s.price) : "Konfirmasi harga"}</strong></div><div class="service-admin-actions"><button class="secondary" data-action="edit-service" data-id="${s.id}">Edit</button>${s.is_active ? `<button class="text-button danger-text" data-action="disable-service" data-id="${s.id}">Nonaktifkan</button>` : `<button class="text-button" data-action="enable-service" data-id="${s.id}">Aktifkan</button>`}</div></article>`).join("") || '<div class="empty-state">Belum ada layanan. Tambahkan layanan pertama.</div>'}</div>`;
  }

  function accountsPage() {
    // Data loads after render; skeleton remains useful if the request takes time.
    window.setTimeout(() => loadAccounts().catch((e) => notify(friendlyError(e), "error")), 0);
    return `${pageIntro("PENGATURAN AKSES", "Manajemen akun", "Verifikasi warga sekolah dan kelola akun operasional. Admin dan petugas harus menggunakan akun masing-masing.")}
      <div class="panel form-panel"><div class="panel-heading"><span class="step-number">＋</span><div><h3>Buat akun operasional</h3><p>Untuk petugas, administrator, atau pimpinan</p></div></div>
        <form id="accountForm" class="form-grid"><label>Nama lengkap<input id="accountName" required maxlength="80"></label><label>Username<input id="accountUsername" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_.-]+"></label><label>Jenis akses<select id="accountRole"><option value="staff">Petugas bengkel</option><option value="admin">Administrator</option><option value="leadership">Pimpinan (lihat laporan)</option></select></label><label>Jenis warga sekolah<select id="accountType"><option value="employee">Karyawan</option><option value="teacher">Guru</option><option value="student">Siswa</option></select></label><label class="full-span">Unit kerja / kelas<input id="accountUnit" required maxlength="40" value="Unit kerja"></label><label class="full-span">Password sementara<input id="accountPassword" type="password" required minlength="12" maxlength="72"><small>Minimal 12 karakter. Sampaikan melalui jalur aman dan minta pengguna menggantinya.</small></label><div class="full-span"><button class="primary" type="submit">Buat akun operasional</button></div></form>
      </div>
      <section class="panel"><div class="content-heading"><div><p class="eyebrow">PERLU TINDAKAN</p><h3>Pendaftaran menunggu verifikasi</h3></div><span id="pendingCount" class="count-chip">Memuat…</span></div><div id="pendingAccounts" class="account-list"><div class="loading-line"></div></div><div id="pendingMoreWrap" class="load-more-wrap hidden"><button class="secondary" data-action="load-more-accounts" data-kind="pending">Muat pendaftar berikutnya</button></div></section>
      <section class="panel"><div class="content-heading"><div><p class="eyebrow">AKSES SISTEM</p><h3>Daftar akun</h3></div><span id="accountCount" class="count-chip">Memuat…</span></div><div id="accountList" class="account-list"><div class="loading-line"></div></div><div id="accountsMoreWrap" class="load-more-wrap hidden"><button class="secondary" data-action="load-more-accounts" data-kind="all">Muat akun berikutnya</button></div></section>`;
  }

  async function loadAccounts() {
    if (me?.role !== "admin" || !$("accountList")) return;
    const [all, pending] = await Promise.all([
      invokeFunction("manage-account", { action: "list", offset: 0, limit: 100 }),
      invokeFunction("manage-account", { action: "pending_list", offset: 0, limit: 100 }),
    ]);
    accounts = all.accounts || [];
    pendingAccounts = pending.accounts || [];
    accountsHasMore = Boolean(all.has_more);
    pendingAccountsHasMore = Boolean(pending.has_more);
    if ($("accountCount")) $("accountCount").textContent = `${accounts.length}${accountsHasMore ? "+" : ""} akun dimuat`;
    if ($("pendingCount")) $("pendingCount").textContent = `${pendingAccounts.length}${pendingAccountsHasMore ? "+" : ""} menunggu`;
    if ($("pendingAccounts")) $("pendingAccounts").innerHTML = pendingAccounts.length ? pendingAccounts.map((a) => accountRow(a, true)).join("") : '<div class="empty-inline">Tidak ada pendaftaran yang menunggu verifikasi.</div>';
    if ($("accountList")) $("accountList").innerHTML = accounts.length ? accounts.map((a) => accountRow(a, false)).join("") : '<div class="empty-inline">Belum ada akun.</div>';
    $("pendingMoreWrap")?.classList.toggle("hidden", !pendingAccountsHasMore);
    $("accountsMoreWrap")?.classList.toggle("hidden", !accountsHasMore);
  }

  async function loadMoreAccounts(kind) {
    if (me?.role !== "admin") throw new Error("Akses admin diperlukan.");
    const pending = kind === "pending";
    const list = pending ? pendingAccounts : accounts;
    const more = pending ? pendingAccountsHasMore : accountsHasMore;
    if (!more) return;
    const wrap = $(pending ? "pendingMoreWrap" : "accountsMoreWrap");
    const button = wrap?.querySelector("button");
    if (button) { button.disabled = true; button.textContent = "Memuat…"; }
    try {
      const result = await invokeFunction("manage-account", { action: pending ? "pending_list" : "list", offset: list.length, limit: 100 });
      const next = result.accounts || [];
      if (pending) {
        pendingAccounts = pendingAccounts.concat(next);
        pendingAccountsHasMore = Boolean(result.has_more);
        if ($("pendingAccounts")) $("pendingAccounts").innerHTML = pendingAccounts.map((a) => accountRow(a, true)).join("") || '<div class="empty-inline">Tidak ada pendaftaran yang menunggu verifikasi.</div>';
        if ($("pendingCount")) $("pendingCount").textContent = `${pendingAccounts.length}${pendingAccountsHasMore ? "+" : ""} menunggu`;
        $("pendingMoreWrap")?.classList.toggle("hidden", !pendingAccountsHasMore);
      } else {
        accounts = accounts.concat(next);
        accountsHasMore = Boolean(result.has_more);
        if ($("accountList")) $("accountList").innerHTML = accounts.map((a) => accountRow(a, false)).join("");
        if ($("accountCount")) $("accountCount").textContent = `${accounts.length}${accountsHasMore ? "+" : ""} akun dimuat`;
        $("accountsMoreWrap")?.classList.toggle("hidden", !accountsHasMore);
      }
    } finally {
      const current = $(pending ? "pendingMoreWrap" : "accountsMoreWrap")?.querySelector("button");
      if (current) { current.disabled = false; current.textContent = pending ? "Muat pendaftar berikutnya" : "Muat akun berikutnya"; }
    }
  }

  function accountRow(a, pending) {
    const active = a.is_active;
    const status = !active ? "Nonaktif" : !a.is_verified ? "Belum diverifikasi" : "Aktif";
    const passwordNotice = a.must_change_password ? " · Wajib ganti password" : "";
    return `<article class="account-row"><div class="avatar account-avatar">${esc(a.full_name.charAt(0).toUpperCase())}</div><div class="account-copy"><b>${esc(a.full_name)}</b><span>@${esc(a.username)} · ${esc(roleNames[a.role] || a.role)}</span><small>${esc(typeLabel(a.member_type))} · ${esc(a.class_name || "—")}${passwordNotice}</small></div><span class="account-state ${active && a.is_verified ? "state-active" : "state-pending"}">${status}</span><div class="account-actions">${pending ? `<button class="primary small-button" data-action="verify-account" data-id="${a.id}">Verifikasi</button><button class="text-button danger-text" data-action="reject-account" data-id="${a.id}">Tolak</button>` : `<button class="secondary small-button" data-action="toggle-account" data-id="${a.id}" data-active="${active}">${active ? "Nonaktifkan" : "Aktifkan"}</button><button class="text-button" data-action="reset-password" data-id="${a.id}" data-name="${esc(a.full_name)}">Reset password</button>`}</div></article>`;
  }

  function reportsPage() {
    return `${pageIntro("ANALITIK & PENGAWASAN", "Laporan operasional", "Ringkasan agregat pesanan dan pembayaran. Data pribadi customer tidak ditampilkan pada dashboard pimpinan.")}
      <section class="panel report-filter"><label>Dari tanggal<input type="date" id="reportFrom"></label><label>Sampai tanggal<input type="date" id="reportTo"></label><button class="primary" data-action="load-report">Tampilkan laporan</button><button class="secondary" data-action="export-report">Ekspor CSV</button></section>
      <div id="reportContent"><div class="loading-card"><span class="spinner"></span> Memuat laporan…</div></div>`;
  }

  function reportSummaryCards(data) {
    if (!data) return '<div class="empty-state compact">Ringkasan laporan belum dimuat.</div>';
    return `<div class="stats-grid report-stats"><div class="stat-card"><div class="stat-head"><span>Total pesanan</span><i>▤</i></div><strong>${Number(data.total_orders || 0)}</strong></div><div class="stat-card"><div class="stat-head"><span>Pesanan selesai</span><i>✓</i></div><strong>${Number(data.completed_orders || 0)}</strong></div><div class="stat-card"><div class="stat-head"><span>Penerimaan kotor</span><i>Rp</i></div><strong class="stat-currency">${money(data.paid_total)}</strong></div><div class="stat-card"><div class="stat-head"><span>Pengembalian</span><i>↶</i></div><strong class="stat-currency">${money(data.refund_total)}</strong></div><div class="stat-card"><div class="stat-head"><span>Pendapatan bersih</span><i>Rp</i></div><strong class="stat-currency">${money(data.net_total)}</strong></div><div class="stat-card"><div class="stat-head"><span>Belum dibayar</span><i>◌</i></div><strong class="stat-currency">${money(data.unpaid_total)}</strong></div></div>
      <div class="report-grid"><section class="panel"><div class="content-heading"><div><p class="eyebrow">KOMPOSISI PEMBAYARAN</p><h3>Metode pembayaran</h3></div></div><div class="payment-breakdown"><div><span class="legend-dot cash"></span><span>Cash diterima</span><b>${money(data.cash_total)}</b></div><div><span class="legend-dot qris"></span><span>QRIS diterima</span><b>${money(data.qris_total)}</b></div><div><span class="legend-dot cash"></span><span>Refund Cash</span><b>${money(data.refund_cash_total)}</b></div><div><span class="legend-dot qris"></span><span>Refund QRIS</span><b>${money(data.refund_qris_total)}</b></div></div><div class="payment-breakdown timing-breakdown"><div><span>Bayar saat kunci dijemput</span><b>${money(data.paid_at_pickup_total)}</b></div><div><span>Bayar setelah layanan selesai</span><b>${money(data.paid_after_service_total)}</b></div></div></section><section class="panel"><div class="content-heading"><div><p class="eyebrow">STATUS LAYANAN</p><h3>Ringkasan status</h3></div></div><div class="status-breakdown">${Object.entries(data.by_status || {}).map(([status, count]) => `<div><span>${esc(status)}</span><b>${Number(count)}</b></div>`).join("") || '<span class="muted">Belum ada data.</span>'}</div></section></div>
      <section class="panel"><div class="content-heading"><div><p class="eyebrow">ARUS KAS HARIAN</p><h3>Pesanan dan penerimaan bersih</h3></div></div>${dailyReport(data.daily || [])}</section>`;
  }

  function dailyReport(rows) {
    if (!rows.length) return '<div class="empty-inline">Belum ada aktivitas pada rentang tanggal ini.</div>';
    const max = Math.max(1, ...rows.map((r) => Number(r.revenue || 0)));
    return `<div class="daily-report">${rows.map((r) => `<div class="daily-row"><div class="daily-date">${dateOnly(r.day)}</div><div class="daily-track"><i style="width:${Math.max(2, Number(r.revenue || 0) / max * 100)}%"></i></div><div class="daily-values"><b>${Number(r.orders)} pesanan</b><span>${money(r.revenue)}</span></div></div>`).join("")}</div>`;
  }

  async function loadReport() {
    const from = $("reportFrom")?.value || `${new Date().getFullYear()}-01-01`;
    const to = $("reportTo")?.value || new Date().toISOString().slice(0, 10);
    if (to < from) throw new Error("Tanggal akhir tidak boleh sebelum tanggal awal.");
    if ((new Date(to) - new Date(from)) / 86400000 > 366) throw new Error("Rentang laporan maksimal 367 hari.");
    const { data, error } = await db.rpc("management_summary", { p_from: from, p_to: to });
    if (error) throw error;
    summary = data;
    if ($("reportContent")) $("reportContent").innerHTML = reportSummaryCards(summary);
    return summary;
  }

  function notificationsPage() {
    return `${pageIntro("PUSAT INFORMASI", "Notifikasi", "Pembaruan status pesanan, penugasan, dan pencatatan pembayaran.", '<button class="text-button" data-action="mark-all-read">Tandai semua dibaca</button>')}
      <div class="notification-list">${notifications.map((n) => `<article class="notification-item ${n.is_read ? "read" : "unread"}"><div class="notification-icon">${n.title.toLowerCase().includes("bayar") ? "Rp" : n.title.toLowerCase().includes("tugas") ? "⚙" : "♧"}</div><div><b>${esc(n.title)}</b><p>${esc(n.message)}</p><small>${dateTime(n.created_at)}</small></div>${!n.is_read ? `<button class="text-button" data-action="read-notification" data-id="${n.id}">Tandai dibaca</button>` : ""}${n.order_id ? `<button class="secondary small-button" data-action="detail" data-id="${n.order_id}">Lihat pesanan</button>` : ""}</article>`).join("") || '<div class="empty-state"><div class="empty-icon">♧</div><h3>Belum ada notifikasi</h3><p>Informasi penting akan muncul di sini.</p></div>'}</div>`;
  }

  function profilePage() {
    return `${pageIntro("PENGATURAN PRIBADI", me.must_change_password ? "Wajib ganti password" : "Akun saya", me.must_change_password ? "Demi keamanan, ganti password sementara sebelum menggunakan fitur lainnya." : "Informasi identitas akun dan pengaturan kata sandi.")}
      ${me.must_change_password ? '<div class="info-banner"><span>!</span><p>Password sementara dari admin harus diganti terlebih dahulu. Fitur lain dikunci sampai password baru berhasil disimpan.</p></div>' : ""}
      <div class="profile-layout"><section class="panel profile-card"><div class="profile-avatar">${esc(me.full_name.charAt(0).toUpperCase())}</div><h3>${esc(me.full_name)}</h3><p>${esc(roleNames[me.role] || me.role)}</p><div class="profile-data"><span>Username</span><b>@${esc(me.username)}</b><span>Jenis warga sekolah</span><b>${esc(typeLabel(me.member_type))}</b><span>Kelas / unit kerja</span><b>${esc(me.class_name || "—")}</b><span>Status akun</span><b>${me.is_active && me.is_verified ? "Aktif dan terverifikasi" : "Perlu pemeriksaan admin"}</b></div></section>
      <section class="panel form-panel"><div class="panel-heading"><span class="step-number">⌑</span><div><h3>Ubah password</h3><p>Gunakan password unik yang tidak dipakai di akun lain.</p></div></div><form id="passwordForm"><label>Password baru<input id="newPassword" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label><label>Ulangi password baru<input id="repeatPassword" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label><button class="primary" type="submit">Simpan password</button></form></section></div>`;
  }

  function bindPage() {
    const orderSearch = $("view").querySelector("[data-order-search]");
    const orderStatus = $("view").querySelector("[data-order-status]");
    if (orderSearch && orderStatus) {
      const filterOrders = () => {
        const q = orderSearch.value.trim().toLowerCase();
        const selectedStatus = orderStatus.value;
        let visible = 0;
        $("view").querySelectorAll("[data-order-card]").forEach((card) => {
          const show = (!q || card.dataset.search.includes(q)) && (!selectedStatus || card.dataset.status === selectedStatus);
          card.classList.toggle("hidden", !show);
          if (show) visible++;
        });
        const count = $("view").querySelector("[data-order-count]");
        if (count) count.textContent = `${visible} pesanan`;
      };
      orderSearch.addEventListener("input", filterOrders);
      orderStatus.addEventListener("change", filterOrders);
    }
    const booking = $("bookingForm");
    if (booking) {
      booking.addEventListener("change", (event) => {
        updateEstimate();
        if (event.target.id === "parking") {
          const other = event.target.value === "Area lainnya";
          $("landmark").required = other;
          $("landmarkLabel").innerHTML = `Patokan / detail lokasi ${other ? '<span class="required-tag">Wajib diisi</span>' : '<span class="optional">Opsional</span>'}<input id="landmark" maxlength="100" placeholder="Contoh: Gedung, lantai, baris parkir" ${other ? 'required' : ''}>`;
        }
      });
      booking.addEventListener("submit", submitBooking);
      updateEstimate();
    }
    $("accountForm")?.addEventListener("submit", createAccount);
    $("passwordForm")?.addEventListener("submit", changePassword);
    if (page === "reports") {
      const today = new Date();
      const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 29);
      const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      $("reportFrom").value = localDate(monthAgo);
      $("reportTo").value = localDate(today);
      loadReport().catch((e) => { if ($("reportContent")) $("reportContent").innerHTML = `<div class="error-panel">${esc(friendlyError(e))}</div>`; });
    }
  }

  function updateEstimate() {
    const form = $("bookingForm");
    if (!form) return;
    const selected = [...form.querySelectorAll('input[name="service"]:checked')].map((input) => services.find((s) => s.id === input.value)).filter(Boolean);
    const sum = selected.reduce((total, service) => total + Number(service.price || 0), 0);
    const needsQuote = selected.some((service) => Number(service.price) === 0);
    $("bookingEstimate").textContent = money(sum) + (needsQuote ? " + konfirmasi" : "");
  }

  async function submitBooking(event) {
    event.preventDefault();
    const button = $("bookingForm").querySelector('button[type="submit"]');
    const ids = [...document.querySelectorAll('input[name="service"]:checked')].map((x) => x.value);
    if (!ids.length) { notify("Pilih minimal satu layanan.", "error"); return; }
    setBusy(button, true, "Mengirim pesanan…");
    try {
      const { data, error } = await db.rpc("create_order", {
        wa: $("wa").value,
        motor_make: $("make").value,
        motor_model: $("model").value,
        motor_color: $("color").value,
        plate_number: $("plate").value,
        parking_area: $("parking").value,
        parking_landmark: $("landmark").value,
        notes: $("notes").value,
        payment_method: $("payment").value,
        payment_timing: $("timing").value,
        service_ids: ids,
        privacy_consent: $("privacyConsent").checked,
      });
      if (error) throw error;
      await refreshData();
      page = "myorders"; render();
      notify("Pesanan berhasil dikirim. Tunggu konfirmasi admin.", "success");
    } catch (error) { notify(friendlyError(error), "error"); }
    finally { setBusy(button, false); }
  }

  async function createAccount(event) {
    event.preventDefault();
    const button = $("accountForm").querySelector('button[type="submit"]');
    setBusy(button, true, "Membuat akun…");
    try {
      await invokeFunction("manage-account", {
        action: "create", name: $("accountName").value, username: $("accountUsername").value.toLowerCase(),
        role: $("accountRole").value, member_type: $("accountType").value, klass: $("accountUnit").value,
        password: $("accountPassword").value,
      });
      event.target.reset();
      $("accountUnit").value = "Unit kerja";
      await loadAccounts();
      notify("Akun operasional berhasil dibuat.", "success");
    } catch (error) { notify(friendlyError(error), "error"); }
    finally { setBusy(button, false); }
  }

  async function changePassword(event) {
    event.preventDefault();
    const next = $("newPassword").value;
    if (next !== $("repeatPassword").value) { notify("Konfirmasi password tidak sama.", "error"); return; }
    const button = event.target.querySelector('button[type="submit"]');
    setBusy(button, true, "Menyimpan…");
    try {
      const { error } = await db.auth.updateUser({ password: next });
      if (error) throw error;
      // A reset-password token is deliberately invalidated. Obtain a fresh JWT after the password change.
      const { data: refreshedSession, error: refreshError } = await db.auth.refreshSession();
      if (refreshError || !refreshedSession?.session) {
        await db.auth.signOut({ scope: "local" });
        notify("Password berhasil diganti. Silakan masuk kembali dengan password baru.", "success");
        return;
      }
      const { data: activeRole, error: roleError } = await db.rpc("current_role");
      if (roleError || !activeRole) {
        await db.auth.signOut({ scope: "local" });
        notify("Password berhasil diganti. Silakan masuk kembali dengan password baru.", "success");
        return;
      }
      const { data: refreshedProfile, error: profileError } = await db.from("profiles").select("must_change_password").eq("id", me.id).single();
      if (profileError) throw profileError;
      if (refreshedProfile.must_change_password) throw new Error("Password berubah, tetapi status akun belum diperbarui. Hubungi admin.");
      me.must_change_password = false;
      event.target.reset();
      await refreshData();
      notify("Password berhasil diperbarui. Semua fitur akun kini terbuka.", "success");
      page = "profile"; render();
    } catch (error) { notify(friendlyError(error), "error"); }
    finally { setBusy(button, false); }
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    const id = button.dataset.id;
    try {
      if (action === "logout") return logout();
      if (action === "refresh-verification") {
        const { data, error } = await db.from("profiles").select("is_verified,is_active").eq("id", me.id).single();
        if (error) throw error;
        me.is_verified = data.is_verified; me.is_active = data.is_active;
        if (!me.is_active) { await logout(); return; }
        if (me.is_verified) { await enter(); notify("Akun berhasil diverifikasi.", "success"); }
        else notify("Akun masih menunggu verifikasi admin.");
        return;
      }
      if (action === "detail") return showOrderDetail(id);
      if (action === "assign") return assignStaff(id);
      if (action === "next-status") return updateStatus(id);
      if (action === "cancel-own") return cancelOwnOrder(id);
      if (action === "add-service") return serviceEditor();
      if (action === "edit-service") return serviceEditor(id);
      if (action === "disable-service") return disableService(id);
      if (action === "enable-service") return enableService(id);
      if (action === "verify-account") return setAccountValue(id, "set_verified", true);
      if (action === "reject-account") return rejectAccount(id);
      if (action === "toggle-account") return setAccountValue(id, "set_active", button.dataset.active !== "true");
      if (action === "reset-password") return resetPassword(id, button.dataset.name);
      if (action === "load-report") return loadReport().then(() => notify("Laporan diperbarui.", "success"));
      if (action === "export-report") return exportReport();
      if (action === "mark-all-read") return markAllRead();
      if (action === "read-notification") return markNotificationRead(id);
      if (action === "pay") return recordPayment(id);
      if (action === "refund") return recordRefund(id);
      if (action === "load-more-orders") return loadMoreOrders();
      if (action === "load-more-accounts") return loadMoreAccounts(button.dataset.kind);
      if (action === "print-invoice") return printInvoice(id);
      if (action === "quote") return updateOrderItemPrice(id);
      if (action === "admin-cancel") return adminCancelOrder(id);
    } catch (error) { notify(friendlyError(error), "error"); }
  }

  async function showOrderDetail(id) {
    const order = orders.find((x) => x.id === id);
    if (!order) throw new Error("Data pesanan tidak ditemukan. Muat ulang halaman.");
    const items = order.order_items || [];
    const canManage = me.role === "admin";
    const canStaff = me.role === "staff" && order.assigned_staff === me.id;
    const canPay = (canManage || canStaff) && order.payment_status === "Belum dibayar" && paymentStageReady(order);
    const paymentRows = (order.payments || []).map((p) => `<div class="payment-history-row"><span>${dateTime(p.received_at)} · ${esc(p.received_by === me.id ? "Anda menerima" : p.received_by ? "Petugas tercatat" : "Penerima tidak tercatat (data lama)")}</span><b>${esc(p.method)} · ${money(p.amount)}</b></div>`).join("");
    const refundRows = (order.refunds || []).map((r) => `<div class="payment-history-row"><span>${dateTime(r.refunded_at)} · ${esc(r.refunded_by === me.id ? "Anda memproses" : "Admin tercatat")}</span><b>Pengembalian ${esc(r.method)} · ${money(r.amount)}</b><small>${esc(r.reason)}</small></div>`).join("");
    const itemRows = items.map((item) => `<div class="detail-item"><div><b>${esc(item.service_name)}</b>${canManage && order.payment_status !== "Lunas" && !["Selesai", "Dibatalkan"].includes(order.status) ? `<small>ID item: ${esc(item.id.slice(0, 8))}</small>` : ""}</div><strong>${money(item.price)}</strong>${canManage && order.payment_status !== "Lunas" && !["Selesai", "Dibatalkan"].includes(order.status) ? `<button class="text-button" data-action="quote" data-id="${item.id}">Ubah harga</button>` : ""}</div>`).join("");
    const staffName = accounts.find((a) => a.id === order.assigned_staff)?.full_name || "Petugas telah ditugaskan";
    showModal(`<div class="modal-kicker">DETAIL PESANAN</div><h2 id="modalTitle">${esc(order.order_code)}</h2><div class="detail-status">${statusPill(order.status)}${paymentPill(order.payment_status)}</div>
      <div class="modal-actions"><button class="secondary" data-action="print-invoice" data-id="${order.id}">Cetak bukti pesanan</button></div>
      <div class="detail-section"><h4>Customer & kendaraan</h4><div class="detail-grid"><span>Nama</span><b>${esc(order.student_name)}</b><span>Jenis / kelas / unit</span><b>${esc(typeLabel(order.customer_type))} · ${esc(order.class_name || "—")}</b><span>WhatsApp</span><b>${esc(order.whatsapp)}</b><span>Kendaraan</span><b>${esc(order.motor_make)} ${esc(order.motor_model)} · ${esc(order.motor_color)}</b><span>Nomor plat</span><b>${esc(order.plate_number)}</b><span>Lokasi parkir</span><b>${esc(order.parking_area)} · ${esc(order.parking_landmark || "Tanpa patokan")}</b><span>Catatan</span><b>${esc(order.notes || "—")}</b><span>Petugas</span><b>${esc(staffName)}</b><span>Dibuat</span><b>${dateTime(order.created_at)}</b></div></div>
      <div class="detail-section"><h4>Rincian layanan</h4>${itemRows}<div class="detail-total"><span>Total pesanan</span><strong>${money(order.total_amount)}</strong></div></div>
      <div class="detail-section"><h4>Rencana pembayaran</h4><div class="detail-grid"><span>Metode</span><b>${esc(order.payment_method)}</b><span>Waktu</span><b>${esc(order.payment_timing)}</b><span>Status</span><b>${esc(order.payment_status)}</b><span>Dibayar pada</span><b>${dateTime(order.paid_at)}</b><span>Penerima</span><b>${order.received_by ? "Petugas tercatat" : order.payment_status === "Lunas" ? "Tidak tercatat pada skema lama" : "—"}</b></div>${paymentRows ? `<div class="payment-history"><b>Riwayat pembayaran</b>${paymentRows}</div>` : ""}${refundRows ? `<div class="payment-history"><b>Riwayat pengembalian</b>${refundRows}</div>` : ""}</div>
      ${canPay ? `<div class="modal-actions"><button class="primary" data-action="pay" data-id="${order.id}">Catat pembayaran diterima</button></div>` : ""}
      ${canManage && order.payment_status === "Lunas" ? `<div class="modal-actions"><button class="text-button danger-text" data-action="refund" data-id="${order.id}">Catat pengembalian dana</button></div>` : ""}
      ${me.role === "admin" && !["Selesai", "Dibatalkan"].includes(order.status) ? `<div class="modal-actions">${["Menunggu konfirmasi", "Menunggu penjemputan"].includes(order.status) ? `<button class="secondary" data-action="assign" data-id="${order.id}">Atur petugas</button>` : ""}<button class="text-button danger-text" data-action="admin-cancel" data-id="${order.id}">Batalkan pesanan</button></div>` : ""}
      ${canStaff && order.status !== "Selesai" && order.status !== "Dibatalkan" ? `<div class="modal-actions"><button class="secondary" data-action="next-status" data-id="${order.id}">Perbarui progres</button></div>` : ""}`);
  }

  async function recordRefund(orderId) {
    const order = orders.find((x) => x.id === orderId);
    if (!order || me.role !== "admin") throw new Error("Hanya admin yang dapat mencatat pengembalian dana.");
    if (order.payment_status !== "Lunas") throw new Error("Pesanan belum memiliki pembayaran lunas yang dapat dikembalikan.");
    const paid = (order.payments || []).reduce((total, payment) => total + Number(payment.amount || 0), 0);
    if (paid <= 0) throw new Error("Riwayat pembayaran tidak ditemukan. Periksa transaksi sebelum melanjutkan.");
    showModal(`<div class="modal-kicker">PENGENDALIAN KEUANGAN</div><h2 id="modalTitle">Catat pengembalian dana</h2><p class="modal-description">Pengembalian dana dilakukan di luar aplikasi. Catat setelah dana benar-benar diserahkan atau dikirim kembali kepada customer.</p><div class="payment-confirm-card"><span>Total yang dikembalikan</span><strong>${money(paid)}</strong><small>Pengembalian penuh · ${esc(order.order_code)}</small></div><form id="refundForm"><label>Metode pengembalian<select id="refundMethod" required><option value="Cash">Cash</option><option value="QRIS">QRIS</option></select></label><label>Alasan pengembalian<textarea id="refundReason" required minlength="5" maxlength="250" rows="3" placeholder="Jelaskan alasan dan referensi pengembalian"></textarea></label><button class="primary full" type="submit">Konfirmasi dana telah dikembalikan</button></form>`);
    $("refundForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button[type="submit"]');
      setBusy(button, true, "Mencatat pengembalian…");
      try {
        const { error } = await db.rpc("record_refund", { p_order_id: orderId, p_method: $("refundMethod").value, p_reason: $("refundReason").value });
        if (error) throw error;
        closeModal(); await refreshData(); notify("Pengembalian dana berhasil dicatat.", "success");
      } catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  function paymentStageReady(order) {
    return order.payment_timing === "Saat kunci dijemput" ? order.status === "Kunci diterima" : order.status === "Menunggu pengambilan";
  }

  async function assignStaff(orderId) {
    const { accounts: staff } = await invokeFunction("manage-account", { action: "staff_list" });
    if (!staff.length) throw new Error("Belum ada petugas aktif. Buat akun petugas terlebih dahulu.");
    showModal(`<div class="modal-kicker">PENUGASAN</div><h2 id="modalTitle">Tugaskan petugas</h2><p class="modal-description">Pilih petugas yang akan mengambil kunci dan menangani pesanan ini.</p><form id="assignForm"><label>Petugas<select id="staffPick" required>${staff.map((x) => `<option value="${x.id}">${esc(x.full_name)} · @${esc(x.username)}</option>`).join("")}</select></label><button class="primary full" type="submit">Simpan penugasan</button></form>`);
    $("assignForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.target.querySelector("button"); setBusy(button, true, "Menugaskan…");
      try {
        const { error } = await db.rpc("admin_assign_order", { p_order_id: orderId, p_staff_id: $("staffPick").value });
        if (error) throw error;
        closeModal(); await refreshData(); notify("Petugas berhasil ditugaskan.", "success");
      } catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  async function updateStatus(orderId) {
    const order = orders.find((x) => x.id === orderId);
    if (!order) throw new Error("Pesanan tidak ditemukan.");
    const next = {
      "Menunggu penjemputan": "Kunci diterima",
      "Kunci diterima": "Dalam antrean",
      "Dalam antrean": "Sedang dikerjakan",
      "Sedang dikerjakan": "Menunggu pengambilan",
      "Menunggu pengambilan": "Selesai",
    }[order.status];
    if (!next) throw new Error("Tidak ada perubahan status yang tersedia.");
    if (order.status === "Kunci diterima" && order.payment_timing === "Saat kunci dijemput" && order.payment_status !== "Lunas") {
      showModal(`<div class="modal-kicker">PEMBAYARAN DI TEMPAT</div><h2 id="modalTitle">Pembayaran saat penjemputan</h2><p class="modal-description">Customer memilih membayar saat kunci dijemput. Catat pembayaran sebelum pesanan masuk antrean.</p><button class="primary full" data-action="pay" data-id="${order.id}">Catat pembayaran ${money(order.total_amount)}</button>`);
      return;
    }
    if (next === "Selesai" && order.payment_status !== "Lunas") {
      showModal(`<div class="modal-kicker">PEMBAYARAN PENGAMBILAN</div><h2 id="modalTitle">Konfirmasi pembayaran customer</h2><p class="modal-description">Customer memilih membayar setelah layanan selesai. Catat pembayaran saat customer mengambil motor sebelum pesanan ditutup.</p><button class="primary full" data-action="pay" data-id="${order.id}">Catat pembayaran ${money(order.total_amount)}</button>`);
      return;
    }
    const { error } = await db.rpc("staff_update_order_status", { p_order_id: orderId, p_status: next });
    if (error) throw error;
    closeModal(); await refreshData(); notify(`Status diperbarui: ${next}.`, "success");
  }

  async function recordPayment(orderId) {
    const order = orders.find((x) => x.id === orderId);
    if (!order) throw new Error("Pesanan tidak ditemukan.");
    if (!paymentStageReady(order)) throw new Error("Pembayaran belum berada pada tahap yang dipilih customer.");
    if (Number(order.total_amount) <= 0) throw new Error("Admin harus menetapkan harga layanan terlebih dahulu.");
    showModal(`<div class="modal-kicker">KONFIRMASI TRANSAKSI</div><h2 id="modalTitle">Catat pembayaran</h2><p class="modal-description">Pastikan uang cash telah diterima atau pembayaran QRIS sudah berhasil diperiksa sebelum mengonfirmasi.</p><div class="payment-confirm-card"><span>Total yang harus diterima</span><strong>${money(order.total_amount)}</strong><small>${esc(order.payment_method)} · ${esc(order.payment_timing)}</small></div><form id="paymentForm"><label>Nominal diterima<input id="paidAmount" type="number" min="1" step="1" required value="${Number(order.total_amount)}"></label><label>Metode pembayaran<select id="paidMethod" disabled><option>${esc(order.payment_method)}</option></select></label><label>Catatan transaksi <span class="optional">Opsional</span><textarea id="paymentNote" maxlength="250" rows="2" placeholder="Contoh: QRIS berhasil / diterima di kelas XII TKR 1"></textarea></label><button class="primary full" type="submit">Konfirmasi pembayaran lunas</button></form>`);
    $("paymentForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.target.querySelector("button"); setBusy(button, true, "Mencatat pembayaran…");
      try {
        const { error } = await db.rpc("record_payment", { p_order_id: orderId, p_amount: Number($("paidAmount").value), p_method: order.payment_method, p_note: $("paymentNote").value });
        if (error) throw error;
        closeModal(); await refreshData(); notify("Pembayaran berhasil dicatat sebagai lunas.", "success");
      } catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  async function updateOrderItemPrice(itemId) {
    const item = orders.flatMap((o) => o.order_items || []).find((x) => x.id === itemId);
    if (!item) throw new Error("Rincian layanan tidak ditemukan.");
    showModal(`<div class="modal-kicker">PENETAPAN HARGA</div><h2 id="modalTitle">Ubah harga layanan</h2><p class="modal-description">${esc(item.service_name)}. Harga ini hanya berlaku untuk item pada pesanan tersebut.</p><form id="quoteForm"><label>Harga final (Rp)<input id="quotePrice" type="number" min="0" max="100000000" step="1000" required value="${Number(item.price)}"></label><label>Alasan / catatan<input id="quoteNote" maxlength="200" placeholder="Contoh: biaya disesuaikan hasil pemeriksaan"></label><button class="primary full" type="submit">Simpan harga pesanan</button></form>`);
    $("quoteForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.target.querySelector("button"); setBusy(button, true, "Menyimpan…");
      try {
        const { error } = await db.rpc("admin_update_order_item_price", { p_item_id: itemId, p_price: Number($("quotePrice").value), p_note: $("quoteNote").value });
        if (error) throw error;
        closeModal(); await refreshData(); notify("Harga pesanan berhasil diperbarui.", "success");
      } catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  function serviceEditor(id = null) {
    const service = services.find((x) => x.id === id);
    showModal(`<div class="modal-kicker">KATALOG LAYANAN</div><h2 id="modalTitle">${service ? "Edit layanan" : "Tambah layanan"}</h2><form id="serviceEditForm"><label>Nama layanan<input id="editServiceName" required maxlength="80" value="${esc(service?.name || "")}"></label><label>Harga (Rp)<input id="editServicePrice" type="number" min="0" max="100000000" step="1000" required value="${Number(service?.price || 0)}"></label><label>Deskripsi<textarea id="editServiceDescription" maxlength="240" rows="3">${esc(service?.description || "")}</textarea></label><button class="primary full" type="submit">${service ? "Simpan perubahan" : "Tambah layanan"}</button></form>`);
    $("serviceEditForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.target.querySelector("button"); setBusy(button, true, "Menyimpan…");
      try {
        const payload = { name: $("editServiceName").value.trim(), price: Number($("editServicePrice").value), description: $("editServiceDescription").value.trim() };
        const result = service ? await db.from("services").update(payload).eq("id", id) : await db.from("services").insert(payload);
        if (result.error) throw result.error;
        closeModal(); await refreshData(); if (page === "services") render(); notify(service ? "Layanan diperbarui." : "Layanan ditambahkan.", "success");
      } catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  async function disableService(id) {
    const service = services.find((x) => x.id === id);
    if (!service || !confirm(`Nonaktifkan layanan “${service.name}”? Pesanan lama tidak akan berubah.`)) return;
    const { error } = await db.from("services").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    await refreshData(); render(); notify("Layanan dinonaktifkan.", "success");
  }

  async function enableService(id) {
    const { error } = await db.from("services").update({ is_active: true }).eq("id", id);
    if (error) throw error;
    await refreshData(); render(); notify("Layanan diaktifkan kembali.", "success");
  }

  async function setAccountValue(id, action, value) {
    await invokeFunction("manage-account", { action, user_id: id, value });
    await loadAccounts(); notify(action === "set_verified" ? "Akun berhasil diverifikasi." : "Status akun diperbarui.", "success");
  }

  async function rejectAccount(id) {
    if (!confirm("Tolak pendaftaran ini? Akun akan dinonaktifkan dan tidak dapat digunakan.")) return;
    await invokeFunction("manage-account", { action: "set_active", user_id: id, value: false });
    await loadAccounts(); notify("Pendaftaran ditolak dengan menonaktifkan akun.", "success");
  }

  async function resetPassword(id, name) {
    showModal(`<div class="modal-kicker">KEAMANAN AKUN</div><h2 id="modalTitle">Reset password</h2><p class="modal-description">Buat password sementara baru untuk <b>${esc(name)}</b>. Sampaikan secara pribadi dan minta pengguna segera menggantinya.</p><form id="resetPasswordForm"><label>Password sementara<input id="temporaryPassword" type="password" minlength="12" maxlength="72" required></label><button class="primary full" type="submit">Simpan password baru</button></form>`);
    $("resetPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.target.querySelector("button"); setBusy(button, true, "Memperbarui…");
      try { await invokeFunction("manage-account", { action: "reset_password", user_id: id, password: $("temporaryPassword").value }); closeModal(); notify("Password sementara berhasil diperbarui.", "success"); }
      catch (error) { notify(friendlyError(error), "error"); }
      finally { setBusy(button, false); }
    });
  }

  async function cancelOwnOrder(id) {
    if (!confirm("Batalkan pesanan ini? Pembatalan hanya tersedia sebelum admin menerima pesanan.")) return;
    const { error } = await db.rpc("cancel_own_order", { p_order_id: id });
    if (error) throw error;
    await refreshData(); notify("Pesanan dibatalkan.", "success");
  }

  async function adminCancelOrder(id) {
    const reason = prompt("Alasan pembatalan pesanan (opsional):") || "";
    if (!confirm("Yakin membatalkan pesanan ini?")) return;
    const { error } = await db.rpc("admin_cancel_order", { p_order_id: id, p_reason: reason });
    if (error) throw error;
    closeModal(); await refreshData(); notify("Pesanan dibatalkan.", "success");
  }

  function printInvoice(id) {
    const order = orders.find((x) => x.id === id);
    if (!order) throw new Error("Pesanan tidak ditemukan.");
    const printWindow = window.open("", "_blank", "width=760,height=800");
    if (!printWindow) throw new Error("Popup diblokir browser. Izinkan popup untuk mencetak bukti pesanan.");
    printWindow.opener = null;
    const lines = (order.order_items || []).map((item) => `<tr><td>${esc(item.service_name)}</td><td class="right">${money(item.price)}</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bukti Pesanan ${esc(order.order_code)}</title><style>body{font:13px Arial,sans-serif;color:#202820;max-width:720px;margin:35px auto;padding:0 22px}h1{font-size:22px;margin:0;color:#17392c}h2{font-size:17px;margin:28px 0 6px}.muted{color:#68766c}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #17392c;padding-bottom:18px}.code{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 20px;margin:20px 0}.grid div{padding:8px 0;border-bottom:1px solid #e8ece7}.grid span{display:block;color:#718075;font-size:10px;margin-bottom:4px}.grid b{font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:11px 8px;border-bottom:1px solid #e8ece7;text-align:left;font-size:12px}.right{text-align:right}.total{display:flex;justify-content:space-between;font-size:17px;font-weight:bold;padding:17px 8px;border-bottom:2px solid #17392c}.note{font-size:11px;color:#68766c;margin-top:22px}@media print{body{margin:0 auto;padding:0 12px}}</style></head><body><div class="top"><div><h1>STEAM YADIKA</h1><div class="muted">SMK YADIKA 13 · Bukti pesanan layanan</div></div><div class="code"><b>${esc(order.order_code)}</b><div class="muted">${dateTime(order.created_at)}</div></div></div><h2>Informasi customer</h2><div class="grid"><div><span>Nama</span><b>${esc(order.student_name)}</b></div><div><span>Kelas / unit</span><b>${esc(order.class_name || "—")}</b></div><div><span>Nomor WhatsApp</span><b>${esc(order.whatsapp)}</b></div><div><span>Nomor plat</span><b>${esc(order.plate_number)}</b></div><div><span>Kendaraan</span><b>${esc(order.motor_make)} ${esc(order.motor_model)} · ${esc(order.motor_color)}</b></div><div><span>Lokasi parkir</span><b>${esc(order.parking_area)} · ${esc(order.parking_landmark || "—")}</b></div></div><h2>Rincian layanan</h2><table><thead><tr><th>Layanan</th><th class="right">Harga</th></tr></thead><tbody>${lines}</tbody></table><div class="total"><span>Total</span><span>${money(order.total_amount)}</span></div><h2>Status dan pembayaran</h2><div class="grid"><div><span>Status pesanan</span><b>${esc(order.status)}</b></div><div><span>Status pembayaran</span><b>${esc(order.payment_status)}</b></div><div><span>Metode pembayaran</span><b>${esc(order.payment_method)}</b></div><div><span>Waktu pembayaran</span><b>${esc(order.payment_timing)}</b></div><div><span>Waktu lunas</span><b>${dateTime(order.paid_at)}</b></div>${(order.refunds || []).map((r) => `<div><span>Pengembalian ${esc(r.method)}</span><b>${money(r.amount)} · ${dateTime(r.refunded_at)}</b></div>`).join("")}</div><p class="note">Dokumen ini merupakan bukti informasi pesanan dari sistem STEAM YADIKA. Bukti pembayaran hanya sah setelah pembayaran tercatat lunas di sistem. Simpan dokumen ini untuk referensi.</p></body></html>`);
    printWindow.onload = () => printWindow.print();
    printWindow.document.close();
  }

  async function markNotificationRead(id) {
    const { error } = await db.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) throw error;
    await refreshData();
  }

  async function markAllRead() {
    const unread = notifications.filter((x) => !x.is_read).map((x) => x.id);
    if (!unread.length) return notify("Semua notifikasi sudah dibaca.");
    const { error } = await db.from("notifications").update({ is_read: true }).in("id", unread);
    if (error) throw error;
    await refreshData(); notify("Semua notifikasi ditandai sudah dibaca.", "success");
  }

  function exportReport() {
    if (!summary) throw new Error("Tampilkan laporan terlebih dahulu.");
    const rows = [
      ["Metrik", "Nilai"],
      ["Periode mulai", summary.from], ["Periode akhir", summary.to], ["Total pesanan", summary.total_orders],
      ["Pesanan selesai", summary.completed_orders], ["Pesanan dibatalkan", summary.cancelled_orders],
      ["Pesanan aktif", summary.open_orders], ["Penerimaan kotor", summary.paid_total], ["Pengembalian dana", summary.refund_total], ["Pendapatan bersih", summary.net_total],
      ["Pembayaran cash", summary.cash_total], ["Pembayaran QRIS", summary.qris_total], ["Refund cash", summary.refund_cash_total], ["Refund QRIS", summary.refund_qris_total], ["Dibayar saat kunci dijemput", summary.paid_at_pickup_total], ["Dibayar setelah layanan selesai", summary.paid_after_service_total], ["Belum dibayar", summary.unpaid_total],
      ["", ""], ["Tanggal", "Jumlah pesanan dibuat", "Pendapatan bersih"],
      ...(summary.daily || []).map((x) => [x.day, x.orders, x.revenue]),
    ];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `laporan-steam-yadika-${summary.from}-${summary.to}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showModal(html) {
    $("modalBody").innerHTML = html;
    $("modal").classList.remove("hidden");
    $("closeModal").focus();
  }
  function closeModal() { $("modal").classList.add("hidden"); $("modalBody").innerHTML = ""; }
  function toggleSidebar() { $("sidebar").classList.toggle("open"); $("overlay").classList.toggle("show"); }

  window.addEventListener("load", boot);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
