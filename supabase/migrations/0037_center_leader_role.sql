-- 0037: a new staff role, Center Leader ('leader'), separate from Center Coordinator ('coordinator').
-- Its own file because a new enum value can't be used in the same transaction that adds it (as 0010 did for 'pro').
-- What the role may do is set in 0038.
alter type public.app_role add value if not exists 'leader';
