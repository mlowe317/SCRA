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
after the loan origination date (same day doesn't count), and the current rate
is strictly above 6.00%. Logic lives in `src/lib/scra.ts`. Estimated annual
savings = current balance × (rate − 6%).

## Workflow

1. **Upload loans** (Import / Export page, CSV). Borrowers are matched by SSN,
   loans by account number, so re-uploading updates in place. Try
   `samples/loans-sample.csv`.
2. **Export DMDC request** (Loans page). `src/lib/dmdc-batch.ts` builds a
   fixed-width Multiple Record Request with one record per borrower who has an
   active loan (current balance above 0) not verified in the last 30 days. The
   Customer Record ID field carries our borrower id so results match back.
3. **Batch SCRA** (`/batch-scra`). Drop the DMDC results file (`.csv` or
   `.txt`). `src/lib/dmdc-parser.ts` matches rows to borrowers, evaluates the
   6% cap for each loan, and shows a preview. Nothing is written until you
   apply. Applying writes a `ScraCheck` per loan and updates the loan's
   `rateCapEligible`, `estimatedAnnualSavings` and `lastScraCheckAt`. An older
   results file never overwrites a newer flag. Try
   `samples/dmdc-results-sample.csv`.

**Verify the DMDC fixed-width layouts** in `src/lib/dmdc/layout.ts` against the
current DMDC MRR spec before sending real files. The CSV results parser matches
columns by header name and doesn't depend on those positions.

## Not yet built

- Authentication and role-based access. Required before any real data goes in.
- Audit logging of who viewed or exported SSNs.
