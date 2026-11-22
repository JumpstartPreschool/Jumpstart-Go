-- The PRO team (front office) is a role of its own (PRD D25). Added alone because a new enum value can't be used in the
-- transaction that adds it; 0011 gives it its access.
alter type public.app_role add value if not exists 'pro';
