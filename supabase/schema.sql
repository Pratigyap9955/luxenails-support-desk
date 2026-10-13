-- Gloss & Grace salon booking schema for Supabase (PostgreSQL)
-- Run in Supabase SQL Editor. Never put a service-role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.services (
  id text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.services (id,name,category,description,price,duration_minutes) values
('classic-mani','Classic Manicure','Manicure','A tidy, nourishing reset for naturally beautiful nails.',650,35),
('gel-mani','Gel Manicure','Manicure','Glossy, chip-resistant colour with a flawless finish.',1100,50),
('luxury-mani','Signature Luxe Manicure','Manicure','Soak, exfoliation, mask, massage and your perfect polish.',1450,65),
('classic-pedi','Classic Pedicure','Pedicure','A fresh, clean finish from heel to toe.',950,45),
('spa-pedi','Rose Petal Spa Pedicure','Pedicure','A relaxing soak, gentle scrub and softening foot ritual.',1650,70),
('gel-pedi','Gel Pedicure','Pedicure','Long-lasting colour and a beautifully polished finish.',1400,55),
('extensions','Soft Gel Extensions','Extensions','Lightweight extensions shaped just for your hands.',2200,90),
('acrylic','Acrylic Extensions','Extensions','Strong, sculpted length with your choice of shape.',2500,100),
('refill','Extension Refill','Extensions','Refresh your growth area and restore your set.',1500,65),
('nail-art','Minimal Nail Art','Nail Art','Fine lines, tiny details and understated accents.',350,20),
('chrome','Chrome Finish','Nail Art','A luminous, mirror-like finish that catches the light.',450,20),
('french','French Tips','Nail Art','A timeless tip, from classic white to modern colour.',400,20),
('3d-art','3D & Occasion Art','Nail Art','Statement details for celebrations and special days.',850,35),
('removal','Gel Removal','Care','Careful removal with extra attention to nail health.',300,20),
('repair','Single Nail Repair','Care','A little rescue for a cracked or chipped nail.',200,15),
('nail-care','Nail Health Ritual','Care','Cuticle care, shaping and a nourishing treatment.',750,40),
('bridal','Bridal Nail Experience','Packages','A personalised consultation and picture-perfect set.',3500,120),
('mani-pedi','Mani-Pedi Ritual','Packages','Your hands and feet, treated to a little extra love.',1950,90)
on conflict (id) do update set name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,duration_minutes=excluded.duration_minutes;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_phone text not null check (char_length(customer_phone) between 5 and 40),
  service_id text references public.services(id),
  service_name text not null,
  price integer not null check (price >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text not null default '',
  status text not null default 'Pending' check (status in ('Pending','Confirmed','Cancelled','Completed')),
  created_at timestamptz not null default now(),
  constraint appointment_positive_duration check (ends_at > starts_at)
);
create index if not exists appointments_starts_at_idx on public.appointments(starts_at);
create index if not exists appointments_customer_email_idx on public.appointments(lower(customer_email));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'customer' check (role in ('customer','staff','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  message text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount integer not null check (amount > 0),
  balance integer not null check (balance >= 0),
  recipient_email text,
  status text not null default 'Active' check (status in ('Active','Redeemed','Expired')),
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.gift_cards enable row level security;

drop policy if exists "Public can view active services" on public.services;
create policy "Public can view active services" on public.services for select to anon, authenticated using (is_active = true);
drop policy if exists "Public can view published reviews" on public.reviews;
create policy "Public can view published reviews" on public.reviews for select to anon, authenticated using (is_published = true);
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Admins can manage services" on public.services;
create policy "Admins can manage services" on public.services for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
drop policy if exists "Staff can read appointments" on public.appointments;
create policy "Staff can read appointments" on public.appointments for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin')));
drop policy if exists "Staff can update appointments" on public.appointments;
create policy "Staff can update appointments" on public.appointments for update to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin'))) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin')));
drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles" on public.profiles for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Atomic booking function: serializes requests for the same calendar day, then checks
-- all non-cancelled appointments for time overlap before inserting.
create or replace function public.book_appointment(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_service_id text,
  p_service_name text,
  p_price integer,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service public.services%rowtype;
  v_end timestamptz;
  v_appointment public.appointments%rowtype;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 then
    raise exception 'Please provide your name.';
  end if;
  if p_customer_email is null or position('@' in p_customer_email) < 2 then
    raise exception 'Please provide a valid email address.';
  end if;
  if p_customer_phone is null or char_length(trim(p_customer_phone)) < 5 then
    raise exception 'Please provide a valid phone number.';
  end if;
  if p_starts_at <= now() then raise exception 'Please choose a future time.'; end if;

  select * into v_service from public.services s where s.id=p_service_id and s.is_active=true;
  if not found then raise exception 'That service is not currently available.'; end if;
  if p_duration_minutes <> v_service.duration_minutes then raise exception 'Service duration changed. Please refresh and try again.'; end if;
  v_end := p_starts_at + make_interval(mins => v_service.duration_minutes);

  perform pg_advisory_xact_lock(hashtext((p_starts_at at time zone 'UTC')::date::text));
  if exists (
    select 1 from public.appointments a
    where a.status <> 'Cancelled'
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_starts_at,v_end,'[)')
  ) then raise exception 'That time is no longer available. Please choose another slot.'; end if;

  insert into public.appointments(customer_name,customer_email,customer_phone,service_id,service_name,price,starts_at,ends_at,notes)
  values(trim(p_customer_name),lower(trim(p_customer_email)),trim(p_customer_phone),v_service.id,v_service.name,v_service.price,p_starts_at,v_end,coalesce(left(p_notes,1000),'')) returning * into v_appointment;

  return jsonb_build_object(
    'id',v_appointment.id,'name',v_appointment.customer_name,'email',v_appointment.customer_email,
    'phone',v_appointment.customer_phone,'service',v_appointment.service_name,'price',v_appointment.price,
    'starts_at',v_appointment.starts_at,'ends_at',v_appointment.ends_at,'status',v_appointment.status
  );
end;
$$;

revoke all on function public.book_appointment(text,text,text,text,text,integer,timestamptz,integer,text) from public;
grant execute on function public.book_appointment(text,text,text,text,text,integer,timestamptz,integer,text) to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant select, update on public.appointments to authenticated;
grant select on public.profiles to authenticated;
