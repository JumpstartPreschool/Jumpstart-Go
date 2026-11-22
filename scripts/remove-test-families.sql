-- Takes the "(Test)" children off every list and turns off their parents' app access, exactly as Admin → Child left
-- does (0012), acting as the admin so each change is in the audit log. Real children are untouched.
-- Run: psql "<live database connection>" -v ON_ERROR_STOP=1 -f scripts/remove-test-families.sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.profiles where email = 'ai@jumpstartpreschool.in'), 'role', 'authenticated')::text, true);
set local role authenticated;
select c.full_name, public.admin_child_left(c.id) from public.children c where c.active and c.full_name like '%(Test)';
commit;
