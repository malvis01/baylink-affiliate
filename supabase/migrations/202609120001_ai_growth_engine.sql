create table if not exists public.ai_growth_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'overnight_growth',
  generated_at timestamptz not null default now(),
  summary text not null,
  recommendations jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb
);

alter table public.ai_growth_reports enable row level security;

drop policy if exists "growth reports admin read" on public.ai_growth_reports;
create policy "growth reports admin read"
  on public.ai_growth_reports
  for select
  to authenticated
  using (public.is_admin());

create index if not exists ai_growth_reports_generated_at_idx
  on public.ai_growth_reports (generated_at desc);
