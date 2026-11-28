# Staff roles — setup & test checklist

The Owner (your existing admin login) can now give other people their own sign-in, each with one or
more roles: **Manager, Counter / Biller, Kitchen, Delivery**. Everything is managed on **Admin → Staff**.

## One-time setup (about 10 minutes)

1. **Database update.** Supabase → *SQL Editor* → *New query* → paste all of
   `supabase/migrations/014_staff_roles.sql` → **Run**. It only adds things; your Owner login and
   existing data are untouched. (Undo any time with `supabase/rollbacks/014_rollback_staff_roles.sql`.)
2. **Secret key for creating logins.** Supabase → *Project Settings → API* → copy the **service_role**
   key. Vercel → your project → *Settings → Environment Variables* → add
   `SUPABASE_SERVICE_ROLE_KEY` = that key (do **not** tick any "expose to browser" option, no `VITE_`
   prefix) → **Redeploy**. Never paste this key into code, chat, or GitHub.
3. Sign in as the Owner → **Staff** (sidebar) → **Add staff**.

The desktop app needs no rebuild: it shows the website, so it picks all of this up automatically.

## Who can do what

| | Dashboard | Orders | Kitchen | Deliveries | Customers | Invoices | Revenue | Menu | Staff & Settings |
|---|---|---|---|---|---|---|---|---|---|
| Owner | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Manager | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Counter / Biller | — | ✔ (no cancel/undo) | — | — | — | ✔ | — | — | — |
| Kitchen | — | — | ✔ | — | — | — | — | — | — |
| Delivery | — | — | — | ✔ | — | — | — | — | — |

A person with several roles gets everything any of their roles allows. The database enforces these
rules itself, so a page can't be reached by typing its address.

## Test it (5 minutes)

1. Add a test person with the **Kitchen** role. Sign in as them in a private window → you should land on
   the Kitchen board only, and typing `/admin/orders` should bounce you back.
2. Place a test order from the storefront → the kitchen person sees it and can move it New → Preparing → Ready.
3. Add a **Counter** person → they can create a manual order, take payment and hand over, but have no
   cancel / undo buttons.
4. Add a **Delivery** person → Deliveries lists delivery orders only; "Cash received" hands one over.
5. On the Staff page: edit a role, reset a password, switch access off (they are blocked at once).
6. First sign-in of a new person offers them the chance to choose their own password (they can tap "Skip for now").

## Good to know

- Role changes and "switch access off" take effect in the database immediately; an open screen updates
  within about 2 minutes.
- Staff without email sign in with a short **username** (e.g. `ravi`). Behind the scenes it is stored as
  `ravi.staff@example.com`, an address that can never receive mail.
- Another **Owner** can't be created from the app (on purpose). Add one in Supabase → Authentication, then
  set its app metadata to `{"role": "admin"}` as you did for yours.
