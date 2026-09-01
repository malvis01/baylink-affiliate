-- BayLINK Affiliate core schema. Run in the BayLINK Affiliates Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.affiliate_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'affiliate' check (role in ('affiliate','business','admin')),
  referral_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  created_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null, description text, website text, category text, location text,
  approved boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.affiliate_offers (
  id uuid primary key default gen_random_uuid(), business_id uuid references public.business_profiles(id) on delete cascade,
  business_name text not null, title text not null, description text, commission_rate numeric(6,2) not null default 5 check (commission_rate >= 0 and commission_rate <= 100), active boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.affiliate_offers(id) on delete cascade, affiliate_id uuid not null references auth.users(id) on delete cascade, referral_code text not null, created_at timestamptz not null default now()
);

create table if not exists public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.affiliate_offers(id) on delete cascade, affiliate_id uuid not null references auth.users(id) on delete cascade, order_reference text unique, sale_amount numeric(14,2) not null default 0, commission_amount numeric(14,2) not null default 0, status text not null default 'pending' check(status in ('pending','approved','paid','rejected')), created_at timestamptz not null default now()
);

create or replace view public.affiliate_stats with (security_invoker=true) as
select p.id as user_id,
       count(distinct c.id)::int as clicks,
       count(distinct v.id) filter (where v.status in ('approved','paid'))::int as conversions,
       coalesce(sum(v.commission_amount) filter (where v.status in ('approved','paid')),0) as commission
from public.affiliate_profiles p
left join public.affiliate_clicks c on c.affiliate_id=p.id
left join public.affiliate_conversions v on v.affiliate_id=p.id
group by p.id;

alter table public.affiliate_profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.affiliate_offers enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_conversions enable row level security;

drop policy if exists "profiles own read" on public.affiliate_profiles;
create policy "profiles own read" on public.affiliate_profiles for select to authenticated using ((select auth.uid())=id);

drop policy if exists "business public approved read" on public.business_profiles;
create policy "business public approved read" on public.business_profiles for select to anon, authenticated using (approved=true or owner_id=(select auth.uid()));

drop policy if exists "offers public active read" on public.affiliate_offers;
create policy "offers public active read" on public.affiliate_offers for select to anon, authenticated using (active=true);

drop policy if exists "affiliate own clicks" on public.affiliate_clicks;
create policy "affiliate own clicks" on public.affiliate_clicks for select to authenticated using ((select auth.uid())=affiliate_id);
create policy "affiliate insert clicks" on public.affiliate_clicks for insert to authenticated with check ((select auth.uid())=affiliate_id);

drop policy if exists "affiliate own conversions" on public.affiliate_conversions;
create policy "affiliate own conversions" on public.affiliate_conversions for select to authenticated using ((select auth.uid())=affiliate_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='handle_affiliate_profile') then
    create or replace function public.handle_new_affiliate_profile() returns trigger language plpgsql security invoker as $$
    begin insert into public.affiliate_profiles(id,display_name,role) values(new.id,new.raw_user_meta_data->>'display_name',coalesce(new.raw_user_meta_data->>'requested_role','affiliate')); return new; end; $$;
    create trigger handle_affiliate_profile after insert on auth.users for each row execute function public.handle_new_affiliate_profile();
  end if;
end $$;
