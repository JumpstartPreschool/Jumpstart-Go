-- A family's message reaches the office's phones too (D57). Before, only the school's replies were pushed to families,
-- so a parent's message waited unseen until someone opened Messages. Head office and the front desk (the two areas
-- with an inbox) each get a notification that opens the conversation in their own area; the sender never hears their
-- own message. One notification per child conversation (the tag), so a burst of messages replaces rather than piles up.
create or replace function app.push_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kid text := app.child_first(new.child_id);
  text_ text := format('%s: %s', split_part(new.sender_name, ' ', 1), new.body);
begin
  if new.sender_role in ('admin', 'core', 'pro') then
    perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('Message about %s', kid),
      text_, '/parent/messages/' || new.child_id, 'msg-' || new.child_id);
  else
    perform app.notify(array(select distinct profile_id from public.staff_roles where role = 'core' and profile_id <> new.sender),
      format('Message about %s', kid), text_, '/core/messages?child=' || new.child_id, 'msg-' || new.child_id);
    perform app.notify(array(select distinct profile_id from public.staff_roles where role = 'pro' and profile_id <> new.sender
                               and profile_id not in (select profile_id from public.staff_roles where role = 'core')),
      format('Message about %s', kid), text_, '/pro/messages?child=' || new.child_id, 'msg-' || new.child_id);
  end if;
  return null;
end $$;
