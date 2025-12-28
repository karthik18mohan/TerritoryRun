-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- Cities
create table if not exists public.cities (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  boundary_geom geometry(MULTIPOLYGON, 4326),
  center_lat double precision not null,
  center_lng double precision not null,
  default_zoom int not null
);

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz default now()
);

-- Sessions
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete cascade,
  mode text check (mode in ('walk_run','cycle')) not null,
  live_mode boolean default false,
  started_at timestamptz,
  ended_at timestamptz,
  closed_loop boolean default false,
  distance_m double precision,
  perimeter_m double precision,
  created_at timestamptz default now()
);

-- Session points
create table if not exists public.session_points (
  id bigserial primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  ts timestamptz not null,
  raw_geom geometry(POINT, 4326) not null,
  snapped_geom geometry(POINT, 4326),
  snapped boolean default false,
  accuracy_m double precision,
  speed_mps double precision
);

create index if not exists session_points_session_idx on public.session_points (session_id);
create index if not exists session_points_geom_idx on public.session_points using gist (raw_geom);

-- Territories
create table if not exists public.territories (
  id uuid primary key default uuid_generate_v4(),
  city_id uuid references public.cities(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  geom geometry(MULTIPOLYGON, 4326),
  geom_simplified geometry(MULTIPOLYGON, 4326),
  area_m2 double precision,
  updated_at timestamptz default now(),
  unique (city_id, owner_user_id)
);

create index if not exists territories_geom_idx on public.territories using gist (geom);

-- Claim events
create table if not exists public.claim_events (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.sessions(id) on delete cascade,
  city_id uuid references public.cities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  claim_geom geometry(MULTIPOLYGON, 4326),
  area_m2 double precision,
  created_at timestamptz default now()
);

create index if not exists claim_events_geom_idx on public.claim_events using gist (claim_geom);

-- Live players
create table if not exists public.live_players (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete cascade,
  username text,
  is_live boolean default false,
  last_ts timestamptz,
  last_point geometry(POINT, 4326),
  last_trail geometry(LINESTRING, 4326),
  updated_at timestamptz default now()
);

create index if not exists live_players_city_idx on public.live_players (city_id);

-- Trigger to create profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, null)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_points enable row level security;
alter table public.territories enable row level security;
alter table public.live_players enable row level security;
alter table public.claim_events enable row level security;

-- Policies
create policy "Profiles are viewable" on public.profiles
  for select using (true);

create policy "Profiles are updatable by owner" on public.profiles
  for update using (auth.uid() = id);

create policy "Sessions owned by user" on public.sessions
  for select using (auth.uid() = user_id);

create policy "Sessions insert by user" on public.sessions
  for insert with check (auth.uid() = user_id);

create policy "Sessions update by user" on public.sessions
  for update using (auth.uid() = user_id);

create policy "Session points owned by user" on public.session_points
  for select using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_points.session_id
      and sessions.user_id = auth.uid()
    )
  );

create policy "Session points insert by user" on public.session_points
  for insert with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_points.session_id
      and sessions.user_id = auth.uid()
    )
  );

create policy "Territories readable" on public.territories
  for select using (auth.role() = 'authenticated');

create policy "Live players readable" on public.live_players
  for select using (auth.role() = 'authenticated');

create policy "Live players upsert by owner" on public.live_players
  for insert with check (auth.uid() = user_id);

create policy "Live players update by owner" on public.live_players
  for update using (auth.uid() = user_id);

create policy "Claim events readable" on public.claim_events
  for select using (auth.role() = 'authenticated');

-- Claim RPC
create or replace function public.claim_territory(
  p_user_id uuid,
  p_city_id uuid,
  p_session_id uuid,
  p_polygon geometry(MULTIPOLYGON, 4326)
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_city_boundary geometry(MULTIPOLYGON, 4326);
  v_city_lat double precision;
  v_city_lng double precision;
  v_session_mode text;
  v_polygon geometry(MULTIPOLYGON, 4326);
  v_perimeter_m double precision;
  v_min_perimeter double precision;
  v_claim_area double precision;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'User mismatch';
  end if;

  select boundary_geom, center_lat, center_lng
    into v_city_boundary, v_city_lat, v_city_lng
    from public.cities
    where id = p_city_id;
  select mode into v_session_mode from public.sessions where id = p_session_id;

  if v_city_boundary is null then
    if v_city_lat is null or v_city_lng is null then
      raise exception 'City boundary not found';
    end if;
    v_city_boundary :=
      ST_Buffer(ST_SetSRID(ST_Point(v_city_lng, v_city_lat), 4326)::geography, 15000)::geometry;
    update public.cities
      set boundary_geom = v_city_boundary
      where id = p_city_id;
  end if;

  v_polygon := ST_MakeValid(ST_Intersection(p_polygon, v_city_boundary));

  if v_polygon is null or ST_IsEmpty(v_polygon) then
    raise exception 'Polygon outside city bounds';
  end if;

  v_perimeter_m := ST_Perimeter(v_polygon::geography);
  v_min_perimeter := case when v_session_mode = 'cycle' then 1000 else 200 end;

  if v_perimeter_m < v_min_perimeter then
    raise exception 'Perimeter too small';
  end if;

  -- Remove overlaps from other owners
  update public.territories
    set geom = ST_Difference(geom, v_polygon),
        geom_simplified = ST_Simplify(ST_Difference(geom, v_polygon), 0.0002),
        area_m2 = ST_Area(ST_Difference(geom, v_polygon)::geography),
        updated_at = now()
    where city_id = p_city_id
      and owner_user_id <> p_user_id
      and geom is not null
      and ST_Intersects(geom, v_polygon);

  delete from public.territories
    where city_id = p_city_id
      and owner_user_id <> p_user_id
      and (geom is null or ST_IsEmpty(geom));

  -- Merge user territory
  insert into public.territories (city_id, owner_user_id, geom, geom_simplified, area_m2, updated_at)
  values (
    p_city_id,
    p_user_id,
    v_polygon,
    ST_Simplify(v_polygon, 0.0002),
    ST_Area(v_polygon::geography),
    now()
  )
  on conflict (city_id, owner_user_id)
  do update set
    geom = ST_Union(public.territories.geom, excluded.geom),
    geom_simplified = ST_Simplify(ST_Union(public.territories.geom, excluded.geom), 0.0002),
    area_m2 = ST_Area(ST_Union(public.territories.geom, excluded.geom)::geography),
    updated_at = now();

  v_claim_area := ST_Area(v_polygon::geography);

  insert into public.claim_events (session_id, city_id, user_id, claim_geom, area_m2)
  values (p_session_id, p_city_id, p_user_id, v_polygon, v_claim_area);

  return jsonb_build_object(
    'claimed_area_m2', v_claim_area,
    'perimeter_m', v_perimeter_m
  );
end;
$$;

-- City boundary constraint for session points
create or replace function public.validate_point_in_city()
returns trigger as $$
declare
  v_city geometry(MULTIPOLYGON, 4326);
begin
  select boundary_geom into v_city
  from public.cities
  join public.sessions on sessions.city_id = cities.id
  where sessions.id = new.session_id;

  if v_city is not null and not ST_Contains(v_city, new.raw_geom) then
    raise exception 'Point outside city boundary';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger validate_session_point
  before insert on public.session_points
  for each row execute procedure public.validate_point_in_city();

-- Enable realtime
alter publication supabase_realtime add table public.live_players;
alter publication supabase_realtime add table public.territories;
alter publication supabase_realtime add table public.claim_events;
