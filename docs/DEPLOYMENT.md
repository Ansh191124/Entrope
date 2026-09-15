# Deployment

**Not executed as part of this build** — no cloud account/credentials were available in the
environment this was built in. These are the steps to run yourself.

## Application — Vercel

1. Push the repository to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Because `npm run dev`/`start` use a custom server (`server/index.ts`) for the embedded
   WebSocket, plain Vercel serverless functions **cannot** host the realtime channel — Vercel's
   platform doesn't support long-lived WebSocket connections in serverless functions. Two options:
   - Deploy the app to a platform that runs a persistent Node process (Render, Fly.io, a VM,
     Railway, etc.) instead of Vercel, so `server/index.ts` keeps running continuously; **or**
   - Deploy the Next.js app itself to Vercel and replace the embedded `ws` server with a managed
     realtime provider (e.g. Supabase Realtime, Pusher, Ably) — swap the implementation behind
     `src/server/realtime/broadcast.ts` and `src/hooks/useRealtime.ts`, whose interfaces were
     deliberately kept small for exactly this kind of swap.
3. Set environment variables (see below) in the platform's dashboard/secret manager — never commit
   `.env`.
4. Set the build command to `npm run build` and the start command to `npm run start` (or the
   platform-appropriate equivalent for a custom Node server).

## Database

- **Managed Postgres** (Neon, Supabase, RDS, Cloud SQL, etc.) — point `DATABASE_URL` at it and run
  `npx prisma migrate deploy` as part of your deploy pipeline (not `migrate dev`, which prompts
  interactively and is for local iteration only).
- **If you switch to Supabase specifically**: `DATABASE_URL` becomes Supabase's connection string;
  you gain Row Level Security as an additional defense layer (configure policies mirroring the
  RBAC rules in `docs/SECURITY.md`); you could also replace the custom JWT auth with Supabase Auth
  and the embedded WebSocket with Supabase Realtime — both were intentionally isolated behind
  small interfaces (`src/server/lib/jwt.ts`, `src/server/realtime/broadcast.ts`) to make this a
  contained swap rather than a rewrite.
- Enable automated backups and point-in-time recovery on whichever managed Postgres you choose.

## Environment variables checklist

| Variable | Notes |
|---|---|
| `DATABASE_URL` | production Postgres connection string |
| `JWT_SECRET` | long random value, unique per environment — rotating it invalidates all sessions |
| `QR_SECRET` | long random value, unique per environment — rotating it invalidates all *outstanding* QR sessions (harmless; they're short-lived) |
| `QR_TTL_SECONDS` | 10–60 per spec; defaults to 20 |
| `NEXT_PUBLIC_APP_URL` | the deployed origin |
| `PORT` | usually set by the platform automatically |
| `NODE_ENV=production` | enables `secure` cookies — deploy behind HTTPS or logins will silently fail to persist |

## Security settings to double-check before going live

- HTTPS is mandatory — `secure` cookies (`src/app/api/auth/login/route.ts`) will not be sent over
  plain HTTP, and browsers require HTTPS for camera access (`getUserMedia`) outside `localhost`
  anyway, which the student QR scanner depends on.
- Confirm the security headers set in `next.config.js` (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`) survive whatever CDN/edge layer sits in front of the app.
- Re-run `npm audit` and update dependencies — see the note in the top-level README about advisory
  data referencing not-yet-published fix versions at the time of this build.
