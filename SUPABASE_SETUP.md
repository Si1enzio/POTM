# Supabase setup

Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.potm_state (
  id bigint primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.potm_state enable row level security;

create policy "public read state" on public.potm_state
for select to anon
using (true);

create policy "public write state" on public.potm_state
for insert to anon
with check (true);

create policy "public update state" on public.potm_state
for update to anon
using (true)
with check (true);
```

Then edit `supabase-config.js` and set:

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};
```
