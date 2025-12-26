insert into public.cities (name, boundary_geom, center_lat, center_lng, default_zoom)
values
  (
    'Bengaluru',
    ST_GeomFromText('MULTIPOLYGON(((77.45 12.84, 77.75 12.84, 77.75 13.15, 77.45 13.15, 77.45 12.84)))', 4326),
    12.9716,
    77.5946,
    12
  ),
  (
    'Mysuru',
    ST_GeomFromText('MULTIPOLYGON(((76.50 12.20, 76.85 12.20, 76.85 12.45, 76.50 12.45, 76.50 12.20)))', 4326),
    12.2958,
    76.6394,
    13
  )
on conflict (name) do nothing;
