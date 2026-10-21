# SCRA Compliance Tracker

Next.js (App Router, TypeScript, Tailwind v4, shadcn/ui) app for tracking loan
portfolios and DMDC SCRA compliance checks.

## Setup

```bash
npm install
cp .env.example .env
npm run gen:key        # paste the output into ENCRYPTION_KEY in .env
npm run db:migrate     # creates prisma/dev.db
npm run dev
```

Scripts: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run db:studio`.

## Security

- SSNs are encrypted with AES-256-GCM (`src/lib/encryption.ts`) using a key
  derived from `ENCRYPTION_KEY`. Plaintext SSNs are never stored.
- `ssnHash` is an HMAC blind index for de-duplication and matching DMDC response
  rows. `ssnLastFour` backs search and `***-**-1234` display.
- Losing or changing `ENCRYPTION_KEY` makes stored SSNs unreadable and changes
  every `ssnHash`. Keep it in a secrets manager in any shared environment.
- Never commit `.env`, real SSNs, or database files.

## Switching to PostgreSQL

1. In `prisma/schema.prisma`, set `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. Delete `prisma/migrations` (they are SQLite-specific) and run
   `npx prisma migrate dev --name init`.

The schema uses no native enums or db-specific types, so nothing else changes.

## SCRA 6% cap rule

A loan is eligible only if active duty is true, the active duty start date is
after the loan origination date, and the current rate is strictly above 6.00%.
