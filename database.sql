-- ============================================================================
-- STEAM YADIKA — FINAL DATABASE
-- Supabase PostgreSQL. Safe to re-run on the original project schema.
-- Run as the Supabase SQL Editor owner. Never expose the service-role key.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1) PROFILES ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  class_name text,
  role text not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists member_type text;
alter table public.profiles add column if not exists is_verified boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists session_valid_after timestamptz;

-- Migrate old student profiles to the new separation of identity and access.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set member_type = 'student' where role = 'student' and member_type is null;
update public.profiles set role = 'member' where role = 'student';
update public.profiles set member_type = 'employee' where member_type is null and role in ('staff','admin');

alter table public.profiles alter column role set default 'member';
alter table public.profiles add constraint profiles_role_check
  check (role in ('member','staff','admin','leadership'));
alter table public.profiles drop constraint if exists profiles_member_type_check;
alter table public.profiles add constraint profiles_member_type_check
  check (member_type is null or member_type in ('student','teacher','employee'));
create index if not exists profiles_role_active_idx on public.profiles(role, is_active, is_verified);

-- 2) SERVICES ----------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.services add column if not exists updated_at timestamptz not null default now();
alter table public.services drop constraint if exists services_price_check;
alter table public.services add constraint services_price_check check (price between 0 and 100000000);
alter table public.services drop constraint if exists services_name_length_check;
alter table public.services add constraint services_name_length_check check (length(trim(name)) between 2 and 80);
create unique index if not exists services_name_ci_idx on public.services(lower(name));

-- 3) ORDERS ------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null default ('SY-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8))),
  student_id uuid not null references public.profiles(id),
  student_name text not null,
  class_name text not null default '',
  whatsapp text not null,
  motor_make text not null,
  motor_model text not null,
  motor_color text not null,
  plate_number text not null,
  parking_area text not null,
  parking_landmark text,
  notes text,
  payment_method text not null check (payment_method in ('Cash','QRIS')),
  payment_timing text not null,
  status text not null default 'Menunggu konfirmasi',
  payment_status text not null default 'Belum dibayar',
  assigned_staff uuid references public.profiles(id),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_type text;
alter table public.orders add column if not exists total_amount integer not null default 0;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists received_by uuid references public.profiles(id);
alter table public.orders add column if not exists privacy_consent_at timestamptz;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders alter column class_name set default '';
update public.orders set status = case
  when status in ('Menunggu','Menunggu konfirmasi') then 'Menunggu konfirmasi'
  when status in ('Diterima','Menunggu penjemputan') then 'Menunggu penjemputan'
  when status in ('Diproses','Dalam antrean') then 'Dalam antrean'
  when status in ('Sedang dikerjakan','Menunggu pengambilan','Selesai','Dibatalkan') then status
  else 'Menunggu konfirmasi' end
where status not in ('Menunggu konfirmasi','Menunggu penjemputan','Kunci diterima','Dalam antrean','Sedang dikerjakan','Menunggu pengambilan','Selesai','Dibatalkan');
update public.orders set payment_status = 'Belum dibayar' where payment_status not in ('Belum dibayar','Lunas','Dibatalkan','Dikembalikan');
alter table public.orders alter column status set default 'Menunggu konfirmasi';
alter table public.orders alter column payment_status set default 'Belum dibayar';
update public.orders o set customer_type = p.member_type from public.profiles p
  where o.student_id = p.id and o.customer_type is null;

alter table public.orders drop constraint if exists orders_payment_timing_check;
alter table public.orders add constraint orders_payment_timing_check
  check (payment_timing in ('Saat kunci dijemput','Setelah layanan selesai'));
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('Cash','QRIS'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('Belum dibayar','Lunas','Dibatalkan','Dikembalikan'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('Menunggu konfirmasi','Menunggu penjemputan','Kunci diterima','Dalam antrean','Sedang dikerjakan','Menunggu pengambilan','Selesai','Dibatalkan'));
create index if not exists orders_customer_created_idx on public.orders(student_id, created_at desc);
create index if not exists orders_staff_status_idx on public.orders(assigned_staff, status, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);

-- 4) ORDER ITEMS -------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.services(id),
  service_name text not null,
  price integer not null check (price >= 0)
);
alter table public.order_items alter column order_id set not null;
alter table public.order_items drop constraint if exists order_items_price_check;
alter table public.order_items add constraint order_items_price_check check (price between 0 and 100000000);
create index if not exists order_items_order_idx on public.order_items(order_id);

update public.orders set total_amount = coalesce((select sum(oi.price) from public.order_items oi where oi.order_id = orders.id),0)
  where total_amount = 0;

-- 5) PAYMENTS: immutable transaction history --------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method text not null check (method in ('Cash','QRIS')),
  amount integer not null check (amount > 0),
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists payments_one_per_order_idx on public.payments(order_id);
-- Legacy paid orders may not have stored the receiving staff ID. Keep that history
-- without inventing an actor; all new RPC-recorded payments still set auth.uid().
alter table public.payments alter column received_by drop not null;
create index if not exists payments_order_idx on public.payments(order_id, received_at desc);
create index if not exists payments_received_at_idx on public.payments(received_at desc);

-- Full refund records are separate immutable cash-out events.
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  method text not null check (method in ('Cash','QRIS')),
  amount integer not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 5 and 250),
  refunded_by uuid not null references public.profiles(id),
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds(order_id, refunded_at desc);
create index if not exists refunds_refunded_at_idx on public.refunds(refunded_at desc);

-- Preserve old confirmed-payment records from the original schema when possible.
update public.orders set paid_at=coalesce(paid_at,verified_at,created_at), received_by=coalesce(received_by,verified_by) where payment_status='Lunas';
insert into public.payments(order_id,method,amount,received_by,received_at,note)
select o.id,o.payment_method,o.total_amount,coalesce(o.received_by,o.verified_by),coalesce(o.verified_at,o.paid_at,o.created_at),'Migrasi transaksi dari skema awal; verifikasi dilakukan sebelum tabel payments tersedia.'
from public.orders o
where o.payment_status='Lunas' and o.total_amount>0
  and not exists(select 1 from public.payments p where p.order_id=o.id);

-- 6) NOTIFICATIONS -----------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, is_read, created_at desc);

-- 7) AUDIT LOGS ---------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- 8) REGISTRATION RATE LIMIT DATA (service-role only) -------------------------
create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists registration_attempts_ip_time_idx on public.registration_attempts(ip_hash, created_at desc);

-- 9) COMMON HELPERS -----------------------------------------------------------
create or replace function public.current_role()
returns text language sql stable security definer set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
    and p.is_verified = true
    and p.must_change_password = false
    and (
      p.session_valid_after is null
      or case
        when coalesce(auth.jwt()->>'iat','') ~ '^[0-9]+$'
          then to_timestamp((auth.jwt()->>'iat')::double precision) >= p.session_valid_after
        else false
      end
    )
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists services_touch_updated_at on public.services;
create trigger services_touch_updated_at before update on public.services for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders for each row execute function public.touch_updated_at();

-- 10) CREATE ORDER ------------------------------------------------------------
-- Remove the original signature so no caller can bypass the new consent requirement.
drop function if exists public.create_order(text,text,text,text,text,text,text,text,text,text,uuid[]);
drop function if exists public.create_order(text,text,text,text,text,text,text,text,text,text,uuid[],boolean);
create or replace function public.create_order(
  wa text, motor_make text, motor_model text, motor_color text, plate_number text,
  parking_area text, parking_landmark text, notes text, payment_method text,
  payment_timing text, service_ids uuid[], privacy_consent boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles%rowtype;
  oid uuid;
  selected_count integer;
  inserted_count integer := 0;
  s record;
  clean_plate text;
begin
  select * into p from public.profiles where id = auth.uid() and is_active and is_verified;
  if not found or p.member_type is null or public.current_role() is null then raise exception 'Akun warga sekolah belum aktif, belum diverifikasi, atau sesi perlu diperbarui'; end if;
  if length(trim(coalesce(wa,''))) < 8 or length(trim(wa)) > 24 or trim(wa) !~ '^[0-9+() -]+$' or length(regexp_replace(trim(wa),'[^0-9]','','g')) < 8 then raise exception 'Nomor WhatsApp tidak valid'; end if;
  if length(trim(coalesce(motor_make,''))) < 2 or length(trim(coalesce(motor_model,''))) < 2
     or length(trim(coalesce(motor_color,''))) < 2 or length(trim(coalesce(plate_number,''))) < 4
     or length(trim(coalesce(parking_area,''))) < 3 then raise exception 'Lengkapi data kendaraan dan lokasi parkir'; end if;
  if parking_area = 'Area lainnya' and length(trim(coalesce(parking_landmark,''))) < 4 then raise exception 'Jelaskan lokasi parkir pada kolom patokan jika memilih Area lainnya'; end if;
  if payment_method not in ('Cash','QRIS') or payment_timing not in ('Saat kunci dijemput','Setelah layanan selesai') then
    raise exception 'Pilihan pembayaran tidak valid';
  end if;
  if coalesce(privacy_consent,false) is not true then raise exception 'Persetujuan penggunaan data wajib diberikan sebelum membuat pesanan'; end if;
  if coalesce(array_length(service_ids,1),0) < 1 or array_length(service_ids,1) > 8 then raise exception 'Pilih 1 sampai 8 layanan'; end if;
  select count(distinct id) into selected_count from public.services where id = any(service_ids) and is_active;
  if selected_count <> (select count(distinct selected.service_id) from unnest(service_ids) as selected(service_id)) then raise exception 'Ada layanan yang tidak tersedia. Muat ulang halaman.'; end if;

  clean_plate := upper(regexp_replace(trim(plate_number), '\s+', ' ', 'g'));
  insert into public.orders(student_id,student_name,class_name,customer_type,whatsapp,motor_make,motor_model,motor_color,plate_number,parking_area,parking_landmark,notes,payment_method,payment_timing,status,payment_status,privacy_consent_at)
  values(p.id,p.full_name,coalesce(p.class_name,''),p.member_type,trim(wa),trim(motor_make),trim(motor_model),trim(motor_color),clean_plate,trim(parking_area),nullif(trim(coalesce(parking_landmark,'')),''),nullif(trim(coalesce(notes,'')),''),payment_method,payment_timing,'Menunggu konfirmasi','Belum dibayar',now())
  returning id into oid;

  for s in select id,name,price from public.services where id = any(service_ids) and is_active loop
    insert into public.order_items(order_id,service_id,service_name,price) values(oid,s.id,s.name,s.price);
    inserted_count := inserted_count + 1;
  end loop;
  if inserted_count = 0 then raise exception 'Tidak ada layanan valid'; end if;
  update public.orders set total_amount = (select coalesce(sum(price),0) from public.order_items where order_id=oid) where id=oid;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'order_created',oid,jsonb_build_object('order_code',(select order_code from public.orders where id=oid)));
  insert into public.notifications(recipient_id,order_id,title,message)
    select id,oid,'Pesanan baru','Ada pesanan baru yang menunggu konfirmasi.' from public.profiles where role='admin' and is_active and is_verified;
  return oid;
end $$;

-- 11) ASSIGN STAFF ------------------------------------------------------------
create or replace function public.admin_assign_order(p_order_id uuid,p_staff_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; s public.profiles%rowtype;
begin
  if coalesce(public.current_role(),'') <> 'admin' then raise exception 'Akses admin diperlukan'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status not in ('Menunggu konfirmasi','Menunggu penjemputan') then raise exception 'Pesanan tidak dapat ditugaskan atau sudah masuk tahap pengerjaan'; end if;
  select * into s from public.profiles where id=p_staff_id and role='staff' and is_active and is_verified;
  if not found then raise exception 'Petugas tidak valid atau belum aktif'; end if;
  update public.orders set assigned_staff=p_staff_id,status='Menunggu penjemputan' where id=p_order_id;
  if o.assigned_staff is not null and o.assigned_staff<>p_staff_id then
    insert into public.notifications(recipient_id,order_id,title,message)
      values(o.assigned_staff,p_order_id,'Penugasan dialihkan','Pesanan ini telah dialihkan kepada petugas lain oleh admin.');
  end if;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'assign_staff',p_order_id,jsonb_build_object('staff_id',p_staff_id));
  insert into public.notifications(recipient_id,order_id,title,message) values
    (p_staff_id,p_order_id,'Tugas baru','Ada pesanan yang ditugaskan kepada Anda.'),
    (o.student_id,p_order_id,'Pesanan diterima','Pesanan Anda diterima dan petugas akan menjemput kunci.');
end $$;

-- 12) STAFF STATUS TRANSITIONS -----------------------------------------------
create or replace function public.staff_update_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; allowed boolean := false;
begin
  if coalesce(public.current_role(),'') <> 'staff' then raise exception 'Akses petugas diperlukan'; end if;
  select * into o from public.orders where id=p_order_id and assigned_staff=auth.uid() for update;
  if not found then raise exception 'Pesanan bukan tugas Anda'; end if;
  if (o.status='Menunggu penjemputan' and p_status='Kunci diterima')
     or (o.status='Kunci diterima' and p_status='Dalam antrean')
     or (o.status='Dalam antrean' and p_status='Sedang dikerjakan')
     or (o.status='Sedang dikerjakan' and p_status='Menunggu pengambilan')
     or (o.status='Menunggu pengambilan' and p_status='Selesai' and o.payment_status='Lunas') then allowed := true; end if;
  if not allowed then raise exception 'Perubahan status tidak sesuai alur pesanan'; end if;
  if o.status='Kunci diterima' and p_status='Dalam antrean' and o.payment_timing='Saat kunci dijemput' and o.payment_status<>'Lunas' then
    raise exception 'Pembayaran saat penjemputan harus dicatat sebelum motor masuk antrean';
  end if;
  if p_status='Selesai' and o.payment_status<>'Lunas' then raise exception 'Pesanan belum lunas'; end if;
  update public.orders set status=p_status where id=p_order_id;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'status_changed',p_order_id,jsonb_build_object('from',o.status,'to',p_status));
  insert into public.notifications(recipient_id,order_id,title,message) values(o.student_id,p_order_id,'Status pesanan diperbarui','Status pesanan Anda sekarang: '||p_status||'.');
  insert into public.notifications(recipient_id,order_id,title,message)
    select id,p_order_id,'Progres pesanan diperbarui','Petugas memperbarui pesanan menjadi: '||p_status||'.'
    from public.profiles where role='admin' and is_active and is_verified;
end $$;

-- 13) RECORD PAYMENT AT THE CUSTOMER-CHOSEN MOMENT ----------------------------
create or replace function public.record_payment(p_order_id uuid,p_amount integer,p_method text,p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; payment_id uuid;
begin
  if coalesce(public.current_role(),'') not in ('staff','admin') then raise exception 'Hanya petugas yang ditugaskan atau admin yang dapat mencatat pembayaran'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if public.current_role()='staff' and o.assigned_staff<>auth.uid() then raise exception 'Pesanan bukan tugas Anda'; end if;
  if o.payment_status='Lunas' then raise exception 'Pembayaran sudah tercatat lunas'; end if;
  if o.status='Dibatalkan' or o.status='Selesai' then raise exception 'Pesanan sudah ditutup'; end if;
  if p_method <> o.payment_method then raise exception 'Metode pembayaran tidak sesuai pilihan customer'; end if;
  if length(coalesce(p_note,'')) > 250 then raise exception 'Catatan transaksi maksimal 250 karakter'; end if;
  if exists(select 1 from public.order_items where order_id=p_order_id and price=0) then raise exception 'Admin harus menetapkan harga setiap layanan terlebih dahulu'; end if;
  if coalesce(p_amount,0) <= 0 or p_amount <> o.total_amount then raise exception 'Nominal pembayaran harus sama dengan total pesanan'; end if;
  if o.payment_timing='Saat kunci dijemput' and o.status<>'Kunci diterima' then raise exception 'Pembayaran dijadwalkan saat kunci diterima petugas'; end if;
  if o.payment_timing='Setelah layanan selesai' and o.status<>'Menunggu pengambilan' then raise exception 'Pembayaran dijadwalkan saat customer mengambil motor'; end if;
  insert into public.payments(order_id,method,amount,received_by,note) values(p_order_id,p_method,p_amount,auth.uid(),nullif(trim(coalesce(p_note,'')),'')) returning id into payment_id;
  update public.orders set payment_status='Lunas',paid_at=now(),received_by=auth.uid(),verified_by=auth.uid(),verified_at=now() where id=p_order_id;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'payment_received',p_order_id,jsonb_build_object('method',p_method,'amount',p_amount,'timing',o.payment_timing));
  insert into public.notifications(recipient_id,order_id,title,message) values(o.student_id,p_order_id,'Pembayaran diterima','Pembayaran '||p_method||' sebesar Rp'||p_amount::text||' telah dicatat.');
  insert into public.notifications(recipient_id,order_id,title,message)
    select id,p_order_id,'Pembayaran dicatat','Petugas mencatat penerimaan '||p_method||' sebesar Rp'||p_amount::text||'.'
    from public.profiles where role='admin' and is_active and is_verified and id<>auth.uid();
  return payment_id;
end $$;

-- 14) ADMIN: RECORD A FULL REFUND -------------------------------------------
create or replace function public.record_refund(p_order_id uuid,p_method text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; paid_amount integer; refund_id uuid; clean_reason text;
begin
  if coalesce(public.current_role(),'') <> 'admin' then raise exception 'Akses admin diperlukan'; end if;
  if p_method not in ('Cash','QRIS') then raise exception 'Metode pengembalian tidak valid'; end if;
  clean_reason := trim(coalesce(p_reason,''));
  if length(clean_reason)<5 or length(clean_reason)>250 then raise exception 'Alasan pengembalian harus 5 sampai 250 karakter'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.payment_status <> 'Lunas' then raise exception 'Hanya pesanan lunas yang dapat dikembalikan'; end if;
  select coalesce(sum(amount),0) into paid_amount from public.payments where order_id=o.id;
  if paid_amount<=0 then raise exception 'Riwayat pembayaran tidak ditemukan'; end if;
  insert into public.refunds(order_id,method,amount,reason,refunded_by)
    values(o.id,p_method,paid_amount,clean_reason,auth.uid()) returning id into refund_id;
  update public.orders
    set payment_status='Dikembalikan',
        status=case when status='Selesai' then status else 'Dibatalkan' end
    where id=o.id;
  insert into public.audit_logs(actor_id,action,target_id,details)
    values(auth.uid(),'refund_recorded',o.id,jsonb_build_object('method',p_method,'amount',paid_amount,'reason',clean_reason));
  insert into public.notifications(recipient_id,order_id,title,message)
    values(o.student_id,o.id,'Pengembalian dana dicatat','Pengembalian dana sebesar Rp'||paid_amount::text||' telah dicatat oleh admin. Hubungi admin jika ada ketidaksesuaian.');
  if o.assigned_staff is not null then
    insert into public.notifications(recipient_id,order_id,title,message)
      values(o.assigned_staff,o.id,'Pesanan dikembalikan','Admin mencatat pengembalian dana. Jangan melanjutkan pengerjaan atau penyerahan motor tanpa instruksi admin.');
  end if;
  return refund_id;
end $$;

-- 15) ADMIN: PRICE QUOTE / SERVICE PRICE -------------------------------------
create or replace function public.admin_update_order_item_price(p_item_id uuid,p_price integer,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare itemrow public.order_items%rowtype; orderrow public.orders%rowtype;
begin
  if coalesce(public.current_role(),'')<>'admin' then raise exception 'Akses admin diperlukan'; end if;
  if p_price<0 or p_price>100000000 then raise exception 'Harga tidak valid'; end if;
  select * into itemrow from public.order_items where id=p_item_id for update;
  if not found then raise exception 'Item pesanan tidak ditemukan'; end if;
  select * into orderrow from public.orders where id=itemrow.order_id for update;
  if orderrow.payment_status='Lunas' or orderrow.status in ('Selesai','Dibatalkan') then raise exception 'Harga pesanan yang sudah ditutup tidak dapat diubah'; end if;
  update public.order_items set price=p_price where id=p_item_id;
  update public.orders set total_amount=(select coalesce(sum(price),0) from public.order_items where order_id=orderrow.id) where id=orderrow.id;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'order_price_updated',orderrow.id,jsonb_build_object('item_id',p_item_id,'new_price',p_price,'note',p_note));
  insert into public.notifications(recipient_id,order_id,title,message) values(orderrow.student_id,orderrow.id,'Biaya layanan diperbarui','Admin memperbarui rincian biaya pesanan Anda. Silakan periksa detail pesanan.');
  if orderrow.assigned_staff is not null then
    insert into public.notifications(recipient_id,order_id,title,message)
      values(orderrow.assigned_staff,orderrow.id,'Biaya pesanan diperbarui','Admin memperbarui rincian biaya pesanan. Periksa total sebelum menerima pembayaran.');
  end if;
end $$;

-- 16) CUSTOMER / ADMIN CANCELLATION ------------------------------------------
create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  if public.current_role() is null then raise exception 'Akun tidak aktif atau sesi perlu diperbarui'; end if;
  select * into o from public.orders where id=p_order_id and student_id=auth.uid() for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status<>'Menunggu konfirmasi' then raise exception 'Pesanan hanya dapat dibatalkan sebelum diterima admin'; end if;
  update public.orders set status='Dibatalkan',payment_status='Dibatalkan' where id=p_order_id;
  insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'customer_cancelled_order',p_order_id);
  insert into public.notifications(recipient_id,order_id,title,message)
    select id,p_order_id,'Pesanan dibatalkan','Customer membatalkan pesanan.' from public.profiles where role='admin' and is_active and is_verified;
end $$;

create or replace function public.admin_cancel_order(p_order_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  if coalesce(public.current_role(),'')<>'admin' then raise exception 'Akses admin diperlukan'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status='Selesai' then raise exception 'Pesanan selesai tidak dapat dibatalkan'; end if;
  if o.payment_status='Lunas' then raise exception 'Pesanan sudah dibayar; proses pengembalian harus dicatat terpisah oleh pengelola'; end if;
  update public.orders set status='Dibatalkan',payment_status='Dibatalkan' where id=p_order_id;
  insert into public.audit_logs(actor_id,action,target_id,details) values(auth.uid(),'admin_cancelled_order',p_order_id,jsonb_build_object('reason',p_reason));
  insert into public.notifications(recipient_id,order_id,title,message) values(o.student_id,p_order_id,'Pesanan dibatalkan',coalesce(nullif(trim(p_reason),''),'Pesanan dibatalkan oleh admin.'));
  if o.assigned_staff is not null then
    insert into public.notifications(recipient_id,order_id,title,message)
      values(o.assigned_staff,p_order_id,'Pesanan dibatalkan','Admin membatalkan pesanan ini. Jangan lanjutkan penjemputan atau pengerjaan.');
  end if;
end $$;

-- 17) FORCE PASSWORD CHANGE: clear the flag only when Auth changes the hash.
-- A client cannot bypass this by calling a public RPC directly.
create or replace function public.handle_auth_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles
      set must_change_password = false
      where id = new.id and must_change_password = true;
    if found then
      insert into public.audit_logs(actor_id,action,target_id,details)
      values(new.id,'password_changed_by_user',new.id,jsonb_build_object('source','supabase_auth'));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists steam_yadika_auth_password_change on auth.users;
create trigger steam_yadika_auth_password_change
after update of encrypted_password on auth.users
for each row execute function public.handle_auth_password_change();

-- Retire the old RPC that could clear the forced-change flag without changing a password.
drop function if exists public.complete_password_change();
revoke all on function public.handle_auth_password_change() from public, anon, authenticated;
drop function if exists public.admin_verify_payment(uuid);

-- 18) MANAGEMENT SUMMARY (aggregate only; no personal data exposed) ----------
create or replace function public.management_summary(
  p_from date default ((now() at time zone 'Asia/Jakarta')::date-29),
  p_to date default ((now() at time zone 'Asia/Jakarta')::date)
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
  start_at timestamptz;
  end_at timestamptz;
begin
  if coalesce(public.current_role(),'') not in ('admin','leadership') then raise exception 'Akses laporan diperlukan'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Rentang laporan tidak valid (maksimal 367 hari)'; end if;
  start_at := p_from::timestamp at time zone 'Asia/Jakarta';
  end_at := (p_to+1)::timestamp at time zone 'Asia/Jakarta';

  select jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'total_orders',(select count(*) from public.orders where created_at>=start_at and created_at<end_at),
    'completed_orders',(select count(*) from public.orders where created_at>=start_at and created_at<end_at and status='Selesai'),
    'cancelled_orders',(select count(*) from public.orders where created_at>=start_at and created_at<end_at and status='Dibatalkan'),
    'open_orders',(select count(*) from public.orders where created_at>=start_at and created_at<end_at and status not in ('Selesai','Dibatalkan')),
    'paid_total',(select coalesce(sum(amount),0) from public.payments where received_at>=start_at and received_at<end_at),
    'cash_total',(select coalesce(sum(amount),0) from public.payments where received_at>=start_at and received_at<end_at and method='Cash'),
    'qris_total',(select coalesce(sum(amount),0) from public.payments where received_at>=start_at and received_at<end_at and method='QRIS'),
    'refund_total',(select coalesce(sum(amount),0) from public.refunds where refunded_at>=start_at and refunded_at<end_at),
    'refund_cash_total',(select coalesce(sum(amount),0) from public.refunds where refunded_at>=start_at and refunded_at<end_at and method='Cash'),
    'refund_qris_total',(select coalesce(sum(amount),0) from public.refunds where refunded_at>=start_at and refunded_at<end_at and method='QRIS'),
    'paid_at_pickup_total',(select coalesce(sum(pm.amount),0) from public.payments pm join public.orders o on o.id=pm.order_id where pm.received_at>=start_at and pm.received_at<end_at and o.payment_timing='Saat kunci dijemput'),
    'paid_after_service_total',(select coalesce(sum(pm.amount),0) from public.payments pm join public.orders o on o.id=pm.order_id where pm.received_at>=start_at and pm.received_at<end_at and o.payment_timing='Setelah layanan selesai'),
    'net_total',(select coalesce(sum(amount),0) from public.payments where received_at>=start_at and received_at<end_at) - (select coalesce(sum(amount),0) from public.refunds where refunded_at>=start_at and refunded_at<end_at),
    'unpaid_total',(select coalesce(sum(total_amount),0) from public.orders where created_at>=start_at and created_at<end_at and payment_status='Belum dibayar'),
    'unpaid_orders',(select count(*) from public.orders where created_at>=start_at and created_at<end_at and payment_status='Belum dibayar'),
    'by_status',(
      select coalesce(jsonb_object_agg(status,n), '{}'::jsonb)
      from (select status,count(*) n from public.orders where created_at>=start_at and created_at<end_at group by status) q
    ),
    'daily',(
      select coalesce(jsonb_agg(jsonb_build_object('day',d.day::date,'orders',coalesce(o.n,0),'revenue',coalesce(pm.rev,0)) order by d.day),'[]'::jsonb)
      from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') as d(day)
      left join (
        select (created_at at time zone 'Asia/Jakarta')::date AS day,count(*) n
        from public.orders where created_at>=start_at and created_at<end_at
        group by (created_at at time zone 'Asia/Jakarta')::date 
      ) o on o.day=d.day::date
      left join (
        select day, sum(amount) as rev from (
          select (received_at at time zone 'Asia/Jakarta')::date AS day, amount from public.payments where received_at>=start_at and received_at<end_at
          union all
          select (refunded_at at time zone 'Asia/Jakarta')::date AS day, -amount as amount from public.refunds where refunded_at>=start_at and refunded_at<end_at
        ) cashflow group by day
      ) pm on pm.day=d.day::date AS
    )
  ) into result;
  return result;
end $$;

-- Keep at least one active, verified admin even under concurrent account updates.
create or replace function public.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role='admin' and old.is_active and old.is_verified
     and (new.role <> 'admin' or new.is_active = false or new.is_verified = false) then
    perform pg_advisory_xact_lock(hashtext('steam_yadika_last_admin_guard'));
    if (select count(*) from public.profiles p
        where p.role='admin' and p.is_active=true and p.is_verified=true and p.id<>old.id) < 1 then
      raise exception 'Admin aktif dan terverifikasi terakhir tidak dapat dinonaktifkan';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
before update of role,is_active,is_verified on public.profiles
for each row execute function public.protect_last_active_admin();
revoke all on function public.protect_last_active_admin() from public, anon, authenticated;

-- 17) ROW LEVEL SECURITY ------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.registration_attempts enable row level security;

-- Drop original and current policies so this file can safely be re-run.
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists services_read on public.services;
drop policy if exists services_admin on public.services;
drop policy if exists orders_read on public.orders;
drop policy if exists items_read on public.order_items;
drop policy if exists audit_read on public.audit_logs;
drop policy if exists payments_read on public.payments;
drop policy if exists refunds_read on public.refunds;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;

create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_admin_read on public.profiles for select to authenticated using(public.current_role()='admin');
create policy services_read on public.services for select to authenticated using(public.current_role() is not null and (is_active or public.current_role()='admin'));
create policy services_admin on public.services for all to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy orders_read on public.orders for select to authenticated using(public.current_role() is not null and (student_id=auth.uid() or assigned_staff=auth.uid() or public.current_role()='admin'));
create policy items_read on public.order_items for select to authenticated using(public.current_role() is not null and exists(select 1 from public.orders o where o.id=order_id and (o.student_id=auth.uid() or o.assigned_staff=auth.uid() or public.current_role()='admin')));
create policy payments_read on public.payments for select to authenticated using(public.current_role() is not null and exists(select 1 from public.orders o where o.id=order_id and (o.student_id=auth.uid() or o.assigned_staff=auth.uid() or public.current_role()='admin')));
create policy refunds_read on public.refunds for select to authenticated using(public.current_role() is not null and exists(select 1 from public.orders o where o.id=order_id and (o.student_id=auth.uid() or o.assigned_staff=auth.uid() or public.current_role()='admin')));
create policy notifications_read on public.notifications for select to authenticated using(public.current_role() is not null and recipient_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using(public.current_role() is not null and recipient_id=auth.uid()) with check(public.current_role() is not null and recipient_id=auth.uid());
create policy audit_read on public.audit_logs for select to authenticated using(public.current_role()='admin');

revoke all on public.registration_attempts from public, anon, authenticated;
revoke all on public.audit_logs from public, anon, authenticated;
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.services from public, anon, authenticated;
revoke all on public.orders from public, anon, authenticated;
revoke all on public.order_items from public, anon, authenticated;
revoke all on public.payments from public, anon, authenticated;
revoke all on public.refunds from public, anon, authenticated;
revoke all on public.notifications from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles,public.services,public.orders,public.order_items,public.payments,public.refunds,public.notifications,public.audit_logs to authenticated;
grant update(is_read) on public.notifications to authenticated;
grant insert,update,delete on public.services to authenticated;

-- Only explicitly granted RPCs may mutate orders or payment records.
revoke all on function public.create_order(text,text,text,text,text,text,text,text,text,text,uuid[],boolean) from public, anon, authenticated;
revoke all on function public.admin_assign_order(uuid,uuid) from public, anon, authenticated;
revoke all on function public.staff_update_order_status(uuid,text) from public, anon, authenticated;
revoke all on function public.record_payment(uuid,integer,text,text) from public, anon, authenticated;
revoke all on function public.record_refund(uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_update_order_item_price(uuid,integer,text) from public, anon, authenticated;
revoke all on function public.cancel_own_order(uuid) from public, anon, authenticated;
revoke all on function public.admin_cancel_order(uuid,text) from public, anon, authenticated;
revoke all on function public.management_summary(date,date) from public, anon, authenticated;
revoke all on function public.current_role() from public, anon, authenticated;
grant execute on function public.create_order(text,text,text,text,text,text,text,text,text,text,uuid[],boolean) to authenticated;
grant execute on function public.admin_assign_order(uuid,uuid) to authenticated;
grant execute on function public.staff_update_order_status(uuid,text) to authenticated;
grant execute on function public.record_payment(uuid,integer,text,text) to authenticated;
grant execute on function public.record_refund(uuid,text,text) to authenticated;
grant execute on function public.admin_update_order_item_price(uuid,integer,text) to authenticated;
grant execute on function public.cancel_own_order(uuid) to authenticated;
grant execute on function public.admin_cancel_order(uuid,text) to authenticated;
grant execute on function public.management_summary(date,date) to authenticated;
grant execute on function public.current_role() to authenticated;

-- 19) INITIAL SERVICE CATALOG (insert only when absent) -----------------------
insert into public.services(name,description,price)
select v.name,v.description,v.price from (values
  ('Steam Motor','Cuci motor',15000),
  ('Ganti Oli','Harga ditetapkan setelah pemeriksaan',0),
  ('Bore Up','Harga ditetapkan setelah pemeriksaan',0),
  ('Spare Part','Harga ditetapkan setelah pemeriksaan',0),
  ('Tune Up','Harga ditetapkan setelah pemeriksaan',0),
  ('Service Injeksi','Harga ditetapkan setelah pemeriksaan',0)
) as v(name,description,price)
where not exists(select 1 from public.services s where lower(s.name)=lower(v.name));

-- IMPORTANT: After this script, deploy the Edge Functions described in README.md.
-- Existing student accounts are migrated to role='member', member_type='student'.
-- Existing staff/admin accounts remain active; confirm their member_type as needed.

-- Audit catalog changes made by authorized admins (seed inserts above are excluded).
create or replace function public.log_service_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare action_name text;
begin
  if tg_op='INSERT' then action_name := 'service_created';
  elsif tg_op='UPDATE' then action_name := 'service_updated';
  else action_name := 'service_deleted'; end if;
  if tg_op='DELETE' then
    insert into public.audit_logs(actor_id,action,target_id,details)
    values(auth.uid(),action_name,old.id,jsonb_build_object('name',old.name,'price',old.price,'active',old.is_active));
    return old;
  else
    insert into public.audit_logs(actor_id,action,target_id,details)
    values(auth.uid(),action_name,new.id,jsonb_build_object('name',new.name,'price',new.price,'active',new.is_active));
    return new;
  end if;
end $$;
drop trigger if exists services_audit_change on public.services;
create trigger services_audit_change
after insert or update or delete on public.services
for each row execute function public.log_service_catalog_change();
revoke all on function public.log_service_catalog_change() from public, anon, authenticated;


