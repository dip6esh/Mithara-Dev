-- ============================================================
-- Mithara: remove ALL staff accounts (so you can create them fresh from Admin > Staff)
--
-- WARNING: permanently deletes every staff login created on the Staff page, together with their
-- role assignments. They can no longer sign in.
--
-- Untouched: your Owner login, customers and their addresses, orders, invoices, menu, settings.
-- (Orders or invoices a staff member handled stay exactly as they are.)
--
-- Why this script and not just "delete from staff_members": each staff login is a Supabase
-- Authentication user. Deleting only the staff list rows would leave the logins behind, and the
-- same username could not be reused. Deleting the login removes the staff row automatically.
--
-- Run in: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

begin;

-- 1. Delete the staff logins. This also removes their rows in the staff list and the empty
--    customer profile that was auto-created for each of them (all "on delete cascade").
--    The role check is a safety net so the Owner can never be removed by this script.
delete from auth.users
 where id in (select user_id from public.staff_members)
   and coalesce(raw_app_meta_data ->> 'role', '') <> 'admin';

-- 2. Safety net: clear any leftover rows in the staff list.
delete from public.staff_members
 where user_id not in (select id from auth.users where raw_app_meta_data ->> 'role' = 'admin');

commit;

-- Check: both should now show 0 staff.
-- select count(*) as staff_rows   from public.staff_members;
-- select count(*) as staff_logins from auth.users where raw_app_meta_data ->> 'role' = 'staff';
