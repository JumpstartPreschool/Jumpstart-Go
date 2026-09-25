-- Location, decided by the owner on 2026-09-25 (PRD D38, replaces D12's sharing by parents and D14's gate map):
-- * Parents and family the school registered never share their location. Their "on my way" sends only a time.
-- * Only someone collecting with a one-time link (a person not on the child's record) is asked to share, and may say no.
-- * Only the parent who sent that link sees where the person is. The school and the gate never see location.
-- A child's location is never tracked.

-- 1. Who can read location points: the parent who arranged a one-off collection, while they're still on the record.
drop policy read on public.trip_points;
create policy read on public.trip_points for select to authenticated using (
  exists (select 1 from public.trips t
          where t.id = trip_points.trip_id
            and t.traveller_kind = 'third_person'
            and t.created_by = app.me()
            and app.is_guardian_of(t.child_id))
);

-- 2. Parents and family no longer share their own location.
create or replace function public.share_location(p_trip uuid, p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'no_location: Only someone collecting with a one-time link shares their location.' using errcode = 'P0001';
end $$;

-- 3. What was shared under the old rule is removed now rather than kept for 30 days.
delete from public.trip_points tp using public.trips t where t.id = tp.trip_id and t.traveller_kind = 'guardian';
update public.trips set sharing = false where traveller_kind = 'guardian' and sharing;
