# tomb of ariel

A small homework tracker. One column per class, each assignment gets a date and a status, and that's about it. Works on a laptop and a phone.

Built with Vite, React, TypeScript and Supabase. Hosted on Vercel.

## The name

Tomb of Ariel is the title of Volume 7 in Shadow Slave, a web novel by Guiltythree. It's my favorite arc, so now my homework lives in a tomb. Naturally.

## Running it locally

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. In Authentication settings, turn off "Confirm email".
4. Copy `.env.example` to `.env` and fill in your project URL and anon key.
5. Install and start:

```bash
npm install
npm run dev
```

To try it on your phone, run `npm run dev -- --host` and open the Network address on the same Wi-Fi.

## Deploying

Import the repo into Vercel and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. Every push to `main` redeploys.

## How accounts work

Accounts are username and password only. Supabase needs an email, so the app signs you up as `username@tomb.local` behind the scenes. Supabase also requires 6 character passwords, so the app adds a fixed suffix to whatever you type. There is no password recovery, so don't forget it.

## How data is stored

Everything for one user lives in a single JSON row in the `app_state` table. The app keeps a copy in localStorage so it opens instantly, then syncs with Supabase in the background.
