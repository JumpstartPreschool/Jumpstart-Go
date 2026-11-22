-- Starting data: the Karve Road programmes from jumpstartpreschool.in (PRD §5), for the 2026–27 year.
-- The core team confirms or corrects them in the app. Re-running changes nothing (names are unique).
-- Drop-off is the first 30 minutes and pickup the last 30 minutes of fixed programmes; "flexible" programmes
-- (360°+ and the Learning Center) let each child's own times be set within the hours.

insert into public.programmes (name, weekdays, saturday_rule, term_start, term_end, starts, ends, flexible, dropoff_from, dropoff_to, pickup_from, pickup_to) values
  ('Playgroup · Half day (morning)',   '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '11:30', false, '09:00', '09:30', '11:00', '11:30'),
  ('Playgroup · Half day (afternoon)', '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '11:45', '14:15', false, '11:45', '12:15', '13:45', '14:15'),
  ('Playgroup · 360°',                 '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '11:45', '17:30', false, '11:45', '12:15', '17:00', '17:30'),
  ('Playgroup · 360°+',                '{1,2,3,4,5,6}', 'except_2nd_and_last', '2026-06-01', '2027-05-31', '09:00', '19:00', true,  null, null, null, null),
  ('Nursery · Half day (morning)',     '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '11:30', false, '09:00', '09:30', '11:00', '11:30'),
  ('Nursery · Half day (afternoon)',   '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '11:45', '14:15', false, '11:45', '12:15', '13:45', '14:15'),
  ('Nursery · 360°',                   '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '11:45', '17:30', false, '11:45', '12:15', '17:00', '17:30'),
  ('Nursery · 360°+',                  '{1,2,3,4,5,6}', 'except_2nd_and_last', '2026-06-01', '2027-05-31', '09:00', '19:00', true,  null, null, null, null),
  ('Jr KG · Half day',                 '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '13:00', false, '09:00', '09:30', '12:30', '13:00'),
  ('Jr KG · 360°',                     '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '16:30', false, '09:00', '09:30', '16:00', '16:30'),
  ('Jr KG · 360°+',                    '{1,2,3,4,5,6}', 'except_2nd_and_last', '2026-06-01', '2027-05-31', '09:00', '19:00', true,  null, null, null, null),
  ('Sr KG · Half day',                 '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '13:00', false, '09:00', '09:30', '12:30', '13:00'),
  ('Sr KG · 360°',                     '{1,2,3,4,5}',   'every',               '2026-06-01', '2027-03-31', '09:00', '16:30', false, '09:00', '09:30', '16:00', '16:30'),
  ('Sr KG · 360°+',                    '{1,2,3,4,5,6}', 'except_2nd_and_last', '2026-06-01', '2027-05-31', '09:00', '19:00', true,  null, null, null, null),
  ('Learning Center',                  '{1,2,3,4,5,6}', 'except_2nd_and_last', null,         null,         '09:00', '19:00', true,  null, null, null, null),
  ('After School Program',             '{1,2,3,4,5}',   'every',               null,         null,         '16:00', '19:00', false, '16:00', '16:30', '18:30', '19:00'),
  ('Preschool Readiness Program',      '{1,2,3,4,5}',   'every',               null,         null,         '11:30', '13:00', false, '11:30', '11:45', '12:45', '13:00')
on conflict (name) do nothing;
