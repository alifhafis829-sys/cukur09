(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let page = "dashboard";
  let orders = [
    { id: "1", order_code: "SY-1001", motor_make: "Honda", motor_model: "Vario 160", motor_color: "Hitam", plate_number: "B 1234 ABC", status: "Sedang dikerjakan", payment_status: "Lunas", payment_method: "Cash", payment_timing: "Saat kunci dijemput", total_amount: 75000, student_name: "Alif Hafis", class_name: "10 TKJ 1", created_at: new Date().toISOString(), order_items: [{ service_name: "Service Ringan & Cuci", price: 75000 }] },
    { id: "2", order_code: "SY-1002", motor_make: "Yamaha", motor_model: "NMAX", motor_color: "Putih", plate_number: "B 5678 XYZ", status: "Menunggu konfirmasi", payment_status: "Belum dibayar", payment_method: "QRIS", payment_timing: "Setelah layanan selesai", total_amount: 50000, student_name: "Budi Santoso", class_name: "10 TKR 1", created_at: new Date().toISOString(), order_items: [{ service_name: "Cuci Steam Motor", price: 50000 }] }
  ];

  function notify(message, kind = "info") {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${kind}`;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { toast.className = "toast"; }, 3800);
  }

  function boot() {
    // Sembunyikan halaman login, langsung buka aplikasi dashboard
    if ($("auth")) $("auth").classList.add("hidden");
    if ($("application")) $("application").classList.remove("hidden");
    if ($("userName")) $("userName").textContent = "Alif Hafis (Admin)";
    if ($("userRole")) $("userRole").textContent = "Administrator · Sistem";
    if ($("userAvatar")) $("userAvatar").textContent = "A";

    document.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (pageButton) { event.preventDefault(); page = pageButton.dataset.page; render(); return; }
    });

    if ($("logout")) {
      $("logout.addEventListener")("click", () => {
        alert("Mode bypass aktif. Anda tidak perlu keluar.");
      });
    }

    render();
    notify("Berhasil masuk menggunakan mode bypass demo!", "success");
  }

  function render() {
    const menus = [
      ["dashboard", "◫", "Dashboard"],
      ["booking", "＋", "Pesan layanan"],
      ["myorders", "▤", "Daftar pesanan"],
      ["accounts", "♙", "Manajemen akun"],
      ["services", "◇", "Layanan & harga"]
    ];

    if ($("nav")) {
      $("nav").innerHTML = menus.map(([key, icon, label]) => `
        <button class="navitem ${page === key ? "active" : ""}" data-page="${key}" type="button">
          <span class="nav-icon">${icon}</span><span>${label}</span>
        </button>`).join("");
    }

    const titles = {
      dashboard: "Dashboard Utama",
      booking: "Pesan Layanan",
      myorders: "Daftar Pesanan",
      accounts: "Manajemen Akun",
      services: "Layanan & Harga"
    };

    if ($("heading")) $("heading").textContent = titles[page] || "Dashboard";

    const view = $("view");
    if (!view) return;

    if (page === "dashboard") {
      view.innerHTML = `
        <section class="hero-panel">
          <div class="hero-content"><p class="eyebrow">PUSAT KENDALI DEMO</p>
            <h2>Selamat datang, Alif Hafis.</h2>
            <p>Sistem STEAM YADIKA berjalan dalam mode demo interaktif tanpa hambatan database.</p>
            <button class="hero-button" data-page="booking">＋ Buat Pesanan Baru</button>
          </div>
          <div class="hero-motif"><div class="motif-ring"></div><div class="motif-core">SY</div><span>SMART<br>MOTOR<br>SERVICE</span></div>
        </section>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-head"><span>Total pesanan</span><i>▤</i></div><strong>${orders.length}</strong><small>Data aktif di sistem</small></div>
          <div class="stat-card"><div class="stat-head"><span>Masih aktif</span><i>◷</i></div><strong>1</strong><small>Dalam proses pengerjaan</small></div>
          <div class="stat-card"><div class="stat-head"><span>Pendapatan</span><i>Rp</i></div><strong class="stat-currency">${money(75000)}</strong><small>Estimasi total</small></div>
        </div>
      `;
    } else if (page === "myorders") {
      view.innerHTML = `
        <div class="content-heading"><div><p class="eyebrow">DAFTAR PESANAN</p><h3>Semua Pesanan Masuk</h3></div></div>
        <div class="orders-list">
          ${orders.map(o => `
            <article class="order-card">
              <div class="order-card-main">
                <div class="order-code-line"><b>${esc(o.order_code)}</b><span>${dateTime(o.created_at)}</span></div>
                <h3>${esc(o.motor_make)} ${esc(o.motor_model)}</h3>
                <p class="order-subline">${esc(o.plate_number)} · ${esc(o.motor_color)} · <b>${esc(o.student_name)} (${esc(o.class_name)})</b></p>
                <div class="order-pills"><span class="pill status-info">${esc(o.status)}</span><span class="pill status-success">${esc(o.payment_status)}</span></div>
              </div>
              <div class="order-card-side"><strong>${money(o.total_amount)}</strong></div>
            </article>
          `).join("")}
        </div>
      `;
    } else if (page === "booking") {
      view.innerHTML = `
        <div class="panel form-panel">
          <h3>Formulir Pemesanan Demo</h3>
          <p>Fitur pemesanan langsung aktif untuk keperluan demonstrasi web.</p>
          <br>
          <button class="primary" onclick="alert('Pesanan simulasi berhasil dibuat!')">Simulasikan Kirim Pesanan</button>
        </div>
      `;
    } else {
      view.innerHTML = `<div class="panel"><h3>Menu ${titles[page]}</h3><p>Halaman ini aktif dan berjalan normal dalam mode demonstrasi.</p></div>`;
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
