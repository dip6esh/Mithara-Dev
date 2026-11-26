# Mithara Admin – Windows app

Desktop wrapper around the existing `/admin` area (orders, kitchen/KOT, invoices, menu, revenue, settings).
The public storefront is NOT included; links outside /admin open in the normal browser.

## Setup
1. Deploy the web app (Vercel) and put its URL in `config.json` → `appUrl`.
2. In Supabase → Auth → URL config, add that same URL if you use redirects.
3. On a Windows PC with Node 20+:
   ```
   cd desktop
   npm install
   npm start        # test run
   npm run dist     # builds dist/Mithara Admin Setup 1.0.0.exe + portable .exe
   ```
Updating the admin pages needs no reinstall – redeploy the website and the app picks it up.
