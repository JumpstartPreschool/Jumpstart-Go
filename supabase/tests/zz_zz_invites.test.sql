-- 0020, as changed by 0039 (invitations go to a mobile by WhatsApp or text): only the admin invites; only someone with app access who hasn't signed in; the app's address comes from settings.
-- People from foundation.test.sql: a1 admin (signed in), c1 core. A new parent is added here without a sign-in account.
insert into public.profiles (id, full_name, email, phone) values
  ('00000000-0000-0000-0000-0000000000f9', 'Priya Invitee', 'priya@example.com', '+919876501234');
insert into public.guardianships (child_id, guardian_id, relation) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000f9', 'Mother');

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.invite_details('00000000-0000-0000-0000-0000000000f9');
  raise exception 'FAIL: the core team invited someone';
exception when insufficient_privilege then null;
end $$;
reset role;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare d jsonb;
begin
  -- No web address yet: refused with a reason the admin can act on.
  begin
    perform public.invite_details('00000000-0000-0000-0000-0000000000f9');
    raise exception 'FAIL: invited without the app address';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'no_app_url%', sqlerrm;
  end;
  begin
    update public.settings set app_url = 'http://insecure.example' where id;
    raise exception 'FAIL: an http address';
  exception when check_violation then null;
  end;
  update public.settings set app_url = 'https://app.jumpstartpreschool.in' where id;

  d := public.invite_details('00000000-0000-0000-0000-0000000000f9');
  assert d->>'phone' = '+919876501234' and d->>'app_url' = 'https://app.jumpstartpreschool.in' and not (d->>'staff')::boolean, 'details';
  assert d->'children' = '["Aarav"]'::jsonb, d->>'children';

  perform public.mark_invited('00000000-0000-0000-0000-0000000000f9', 'whatsapp');
  assert (select invited_via = 'whatsapp' and invited_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000f9'), 'recorded';
  begin
    perform public.mark_invited('00000000-0000-0000-0000-0000000000f9', 'pigeon');
    raise exception 'FAIL: an unknown channel';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_channel%', sqlerrm;
  end;

  -- Someone who already signed in isn't invited again.
  begin
    perform public.invite_details('00000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: invited someone who signed in';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'signed_in%', sqlerrm;
  end;
end $$;
reset role;

-- Without app access there's nothing to invite to.
update public.profiles set app_access = false where id = '00000000-0000-0000-0000-0000000000f9';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  perform public.invite_details('00000000-0000-0000-0000-0000000000f9');
  raise exception 'FAIL: invited without app access';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'no_access%', sqlerrm;
end $$;
reset role;
