-- Undoes 0062 (Attendance & Reports). Order: 1. deploy the previous app (without Attendance & Reports), 2. this file.
-- Nothing is deleted: the corrections an admin made stay in public.attendance_corrections (and their effect on
-- public.attendance, which is the school's record), and every export stays in the audit log. Drop the table later only
-- if that history is truly unwanted. The trips (child_id, day) index is harmless and is kept.
begin;
drop function if exists public.log_report_export(text, text, jsonb);
drop function if exists public.correct_attendance(uuid, date, jsonb, text, uuid);
drop function if exists public.attendance_report(date, date, uuid, uuid, uuid);
commit;
