-- 0027: the studio voice. People from foundation.test.sql: a1 admin, c1 core, d1 coordinator. Earlier files give the
-- first parent staff roles, so this file adds its own parent-only account (v1).
insert into public.profiles (id, full_name, email) values ('00000000-0000-0000-0000-0000000000f7', 'Voice Parent', 'voice.parent@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'voice.parent@example.test');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000f7', 'Mother');

-- 1. Staff may ask for announcement audio; parents may not.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin assert public.voice_allowed(), 'coordinator allowed'; end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7"}';
set role authenticated;
do $$ begin assert not public.voice_allowed(), 'parent refused'; end $$;

-- 2. Parents can't read or change pronunciations.
do $$ begin
  perform public.admin_set_pronunciation('shreyas', 'Shrey-us');
  raise exception 'FAIL: a parent set a pronunciation';
exception when insufficient_privilege then null;
end $$;
do $$ begin assert (select count(*) from public.pronunciations) = 0, 'parent sees none'; end $$;
reset role;

-- 3. The admin sets one (stored lower-case, one word), changes it, and removes it with an empty spoken form.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  perform public.admin_set_pronunciation('  Shreyas ', 'Shrey-us');
  assert (select spoken from public.pronunciations where written = 'shreyas') = 'Shrey-us', 'saved lower-case';
  perform public.admin_set_pronunciation('Shreyas', 'Shray-us');
  assert (select count(*) from public.pronunciations) = 1 and (select spoken from public.pronunciations) = 'Shray-us', 'updated in place';
  begin
    perform public.admin_set_pronunciation('Shreyas Joshi', 'x');
    raise exception 'FAIL: two words accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_word%', sqlerrm;
  end;
  perform public.admin_set_pronunciation('Shreyas', '');
  assert (select count(*) from public.pronunciations) = 0, 'removed';
end $$;
reset role;

-- 4. The core team can read but not change them.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.admin_set_pronunciation('aarav', 'Aa-rav');
  raise exception 'FAIL: core team set a pronunciation';
exception when insufficient_privilege then null;
end $$;
reset role;

do $$ begin assert exists (select 1 from storage.buckets where id = 'voice-cache' and not public), 'private audio bucket'; end $$;
