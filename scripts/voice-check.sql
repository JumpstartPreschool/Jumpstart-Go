-- Read-only check of the school's gate voice on the live database: are the children's announcements made ahead, is the
-- background job that makes them running, and how much of the allowance is used. Changes nothing.
\echo '1. Background job that makes the recordings (voice-drain), and its last runs'
select exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_on,
       exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_on;
select jobname, schedule, active from cron.job where jobname = 'voice-drain';
select status, count(*) as runs, max(start_time) as last_run
from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'voice-drain')
  and start_time > now() - interval '1 day' group by status;

\echo '2. Where the job sends its requests (a row must exist)'
select count(*) as voice_config_rows from app.voice_config;

\echo '3. Each active child: recordings made ahead (ready) or not'
select coalesce(p.audio_status, 'no row') as status, count(*) as children
from public.children c left join public.child_pronunciations p on p.child_id = c.id
where c.active group by 1 order by 1;

\echo '4. The voice the recordings are in'
select key, value, updated_at from public.voice_meta;

\echo '5. Live recordings asked for in the last hour, per gate person (limit 300 an hour each)'
select p.full_name, count(*) as live_requests_last_hour
from app.throttle_log t join public.profiles p on 'voice:' || p.id = t.key
where t.at > now() - interval '1 hour' group by p.full_name order by 2 desc;

\echo '6. Characters used this month (cap 450,000)'
select month, chars from public.voice_usage order by month desc limit 2;
