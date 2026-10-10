-- No "called" name (nickname) for a child (D59): every screen, list and message uses the child's own name from their
-- record. Existing nicknames are cleared, and any that arrives later (an older app version, a bulk upload's "Called"
-- column) is dropped on the way in, so nothing can bring one back.
update public.children set preferred_name = null where preferred_name is not null;

create function app.no_called_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.preferred_name := null;
  return new;
end $$;
create trigger no_called_name before insert or update on public.children
  for each row execute function app.no_called_name();
revoke all on function app.no_called_name() from public, anon, authenticated;
