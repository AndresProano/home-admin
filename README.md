# Home Admin — shared household and finances app

Web app to organize a shared home: a kitchen inventory shared by the members of a household, and personal plus shared finances between two partners.

## Features
- Sign-in with Google through Supabase Auth.
- Households with invite codes; members share a kitchen item list.
- Finances: bank accounts and expenses (category, payment method), personal vs. shared balances, partner linking with an invite code.
- Budgets (Presupuestos): monthly or annual, per category or for total spending, with pace marker and "per day / per month left".
- iPhone Shortcut on every Apple Pay payment: asks the category, logs the expense and notifies how much budget is left; skipped ones land in a "to classify" inbox the app asks about.
- Account balances are kept by a database trigger, so the app and the Shortcut never overwrite each other.
- Access control in PostgreSQL with Row Level Security: 6 tables, 23 policies and helper SQL functions (household membership, partner visibility).
- Installable PWA: on iPhone open it in Safari → Share → Add to Home Screen; it opens full screen with its own icon.
- Automatic deploy: every push to `main` builds the app and publishes it to GitHub Pages with GitHub Actions.

## Stack
Vue 3 · TypeScript · Vite · Vue Router · Supabase (PostgreSQL, Auth, RLS) · GitHub Actions · GitHub Pages

## Run locally
```bash
cd front-personal
npm install
# .env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_GOOGLE_CLIENT_ID
npm run dev
```
Database: run `front-personal/supabase-schema.sql` in the Supabase SQL editor, then the `migration-*.sql` files (`migration-presupuestos.sql` last).
