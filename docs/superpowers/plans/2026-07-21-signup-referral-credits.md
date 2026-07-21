# Signup and Referral Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each new user a configurable one-time USD-denominated credit grant and reward inviters through stable referral links when invited users first enter the application.

**Architecture:** Keep `credit_accounts` and `credit_ledger_entries` authoritative. Add a focused referral/onboarding repository that atomically synchronizes the account, settles first-entry credits, records one referral relationship, and marks onboarding complete. Capture referral codes through a public backend redirect and an HttpOnly cookie; extend existing account and admin billing APIs for display and configuration.

**Tech Stack:** TypeScript, Hono, Clerk, React 19, TanStack Query, Drizzle ORM, PostgreSQL, Vitest, Testcontainers, Cloudflare Workers, Node.js, Docker Compose.

---

### Task 1: Exact grant conversion

**Files:**
- Modify: `tg-web/src/backend/billing/credit-pricing.ts`
- Modify: `tg-web/tests/unit/credit-pricing.test.ts`

- [ ] **Step 1: Write failing conversion tests**

Add cases proving that `calculateGrantPoints(amountUsd, pointsPerUsd)` returns `500` for `5.00 * 100`, rounds `0.011 * 100` up to `2`, returns `0` for zero, rejects negative/invalid decimals, and rejects values above `Number.MAX_SAFE_INTEGER`.

```ts
expect(calculateGrantPoints('5.00', '100.000000')).toBe(500);
expect(calculateGrantPoints('0.011', '100')).toBe(2);
expect(calculateGrantPoints('0', '100')).toBe(0);
expect(() => calculateGrantPoints('-1', '100')).toThrow(RangeError);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm test:unit -- credit-pricing.test.ts`

Expected: FAIL because `calculateGrantPoints` is not exported.

- [ ] **Step 3: Implement exact conversion**

Reuse `decimalFraction`, `ceilFraction`, and `safePointNumber`:

```ts
export function calculateGrantPoints(
  amountUsd: string,
  pointsPerUsd: string,
): number {
  const amount = decimalFraction(amountUsd);
  const ratio = decimalFraction(pointsPerUsd);
  return safePointNumber(
    ceilFraction(
      amount.numerator * ratio.numerator,
      amount.denominator * ratio.denominator,
    ),
  );
}
```

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Run: `corepack pnpm test:unit -- credit-pricing.test.ts`

Expected: PASS.

### Task 2: Schema and forward migration

**Files:**
- Modify: `tg-web/src/backend/database/schema.ts`
- Create: `tg-web/drizzle/0004_<generated-name>.sql`
- Modify: `tg-web/drizzle/meta/_journal.json`
- Create: `tg-web/drizzle/meta/0004_snapshot.json`
- Modify: `tg-web/tests/unit/schema.test.ts`
- Modify: `tg-web/tests/unit/migrate.test.ts`

- [ ] **Step 1: Add failing schema assertions**

Assert that `product_users` exposes `referralCode` and `onboardingCompletedAt`, credit settings expose `signupGrantUsd` and `referralRewardUsd`, and `referralRelationships` is exported with invitee as its primary identity.

- [ ] **Step 2: Run schema tests and verify RED**

Run: `corepack pnpm test:unit -- schema.test.ts migrate.test.ts`

Expected: FAIL on missing columns/table.

- [ ] **Step 3: Define Drizzle schema**

Add non-null unique `referralCode`, nullable `onboardingCompletedAt`, the two `numeric(18, 2)` settings defaults, and `referralRelationships` with snapshots and a self-referral check:

```ts
check(
  'referral_relationships_distinct_users_check',
  sql`${table.inviteeClerkUserId} <> ${table.inviterClerkUserId}`,
)
```

- [ ] **Step 4: Generate migration metadata**

Run: `corepack pnpm db:generate`

Expected: a new `0004_*.sql` and snapshot are generated.

- [ ] **Step 5: Make the migration safe for existing users**

Amend the generated SQL so `referral_code` is initially nullable, then:

```sql
UPDATE product_users
SET referral_code = replace(gen_random_uuid()::text, '-', ''),
    onboarding_completed_at = now();
ALTER TABLE product_users ALTER COLUMN referral_code SET NOT NULL;
CREATE UNIQUE INDEX product_users_referral_code_key
  ON product_users (referral_code);
```

The migration must not grant credits to existing rows and must preserve all existing account and ledger data.

- [ ] **Step 6: Re-run schema/migration tests**

Run: `corepack pnpm test:unit -- schema.test.ts migrate.test.ts`

Expected: PASS.

### Task 3: Atomic onboarding and referral repository

**Files:**
- Create: `tg-web/src/backend/database/referral-repository.ts`
- Modify: `tg-web/src/backend/database/account-repository.ts`
- Modify: `tg-web/src/backend/database/repositories.ts`
- Modify: `tg-web/src/backend/database/client.ts`
- Modify: `tg-web/tests/integration/database.test.ts`
- Modify: `tg-web/tests/integration/credit-billing-database.test.ts`

- [ ] **Step 1: Write PostgreSQL integration tests**

Cover no-invite onboarding, valid referral, duplicate calls, two concurrent calls, multiple invitees for one inviter, self-referral, invalid code, zero rewards, and settings snapshots. Assert exact balances and ledger idempotency keys.

```ts
await database.referrals.completeFirstAccess(user, inviterCode);
expect(await database.billing.getAvailableCredits(['inviter', user.id])).toEqual({
  inviter: 200,
  [user.id]: 500,
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `corepack pnpm test:integration -- database.test.ts credit-billing-database.test.ts`

Expected: FAIL because the referral repository does not exist.

- [ ] **Step 3: Add repository contracts and code generation helper**

Expose:

```ts
export interface ReferralRepository {
  isValidCode(code: string): Promise<boolean>;
  completeFirstAccess(user: AuthUser, referralCode: string | null): Promise<void>;
  getSummary(clerkUserId: string): Promise<ReferralSummary>;
}
```

Generate 128-bit base64url codes with `node:crypto`/Web Crypto-compatible APIs and retry unique conflicts a bounded number of times. Update normal account sync so administrator-triggered inserts receive a code but never set `onboardingCompletedAt`.

- [ ] **Step 4: Implement the transaction**

Within one transaction: upsert user, ensure credit account/code, lock the user row, stop if already completed, read current settings, grant welcome points, validate and insert referral relation, reward inviter, and set `onboardingCompletedAt`. Only update balances when the corresponding idempotent ledger insert returns a row.

- [ ] **Step 5: Re-run integration tests and verify GREEN**

Run: `corepack pnpm test:integration -- database.test.ts credit-billing-database.test.ts`

Expected: PASS with no duplicate ledger entries.

### Task 4: Invitation redirect, cookie, and auth integration

**Files:**
- Create: `tg-web/src/backend/routes/referrals.ts`
- Modify: `tg-web/src/backend/auth/middleware.ts`
- Modify: `tg-web/src/backend/app.ts`
- Modify: `tg-web/src/runtimes/node.ts`
- Modify: `tg-web/src/runtimes/cloudflare.ts`
- Modify: `tg-web/tests/unit/app.test.ts`
- Modify: `tg-web/tests/integration/node-runtime.test.ts`
- Modify: `tg-web/tests/worker/cloudflare.test.ts`

- [ ] **Step 1: Add failing route and middleware tests**

Verify valid `/invite/:code` responses set `HttpOnly; SameSite=Lax; Max-Age=2592000` and redirect to `/sign-up`; invalid codes redirect to `/sign-up?invite=invalid` without setting a cookie. Verify authenticated requests pass the cookie code to `completeFirstAccess` and delete it only after successful settlement.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm test:unit -- app.test.ts && corepack pnpm test:integration -- node-runtime.test.ts && corepack pnpm test:worker -- cloudflare.test.ts`

Expected: FAIL because `/invite` is still handled as an SPA path and auth does not settle onboarding.

- [ ] **Step 3: Implement the public referral route**

Use `hono/cookie` to set `tradingagents_referral` and Hono redirect responses. Sanitize codes with a strict base64url length regex before querying the database.

- [ ] **Step 4: Integrate authentication settlement**

Replace the protected-request-only `account.syncUser(user)` call with `referrals.completeFirstAccess(user, getCookie(...))`, call `next()`, and delete the referral cookie after successful completion. Keep admin-target user synchronization on `account.syncUser`.

- [ ] **Step 5: Route `/invite/` through Hono in both runtimes**

Update Node and Worker dispatch conditions from API-only to API-or-invite without changing static asset handling for other routes.

- [ ] **Step 6: Re-run route/runtime tests**

Expected: all focused tests PASS.

### Task 5: Account referral API and UI

**Files:**
- Modify: `tg-web/src/backend/account/contract.ts`
- Modify: `tg-web/src/backend/routes/account.ts`
- Modify: `tg-web/src/frontend/lib/account.ts`
- Modify: `tg-web/src/frontend/pages/account-page.tsx`
- Modify: `tg-web/src/frontend/i18n/locales/en/account.json`
- Modify: `tg-web/src/frontend/i18n/locales/zh/account.json`
- Create: `tg-web/tests/unit/account-page.test.tsx`
- Modify: `tg-web/tests/unit/app.test.ts`

- [ ] **Step 1: Write failing API and UI tests**

Test `GET /api/account/referral` and render a referral section containing a read-only link, copy icon button, successful referral count, and earned credits. Mock `navigator.clipboard.writeText` and assert success/error toasts.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm test:unit -- app.test.ts account-page.test.tsx`

Expected: FAIL because the endpoint and UI do not exist.

- [ ] **Step 3: Add referral summary contract and API**

Return a relative path so the browser origin remains authoritative:

```ts
export type ReferralSummary = {
  referralPath: string;
  successfulReferrals: number;
  earnedCredits: number;
};
```

- [ ] **Step 4: Build the account referral section**

Use the existing Card/Input/Button primitives and Lucide `Copy`/`Check` icons. Construct the absolute link with `new URL(referralPath, window.location.origin)`. Keep stable dimensions while loading and use i18n text for all labels/toasts.

- [ ] **Step 5: Re-run account tests**

Expected: API and UI tests PASS.

### Task 6: Configurable signup and referral amounts

**Files:**
- Modify: `tg-web/src/backend/billing/contract.ts`
- Modify: `tg-web/src/backend/database/billing-repository.ts`
- Modify: `tg-web/src/backend/routes/billing.ts`
- Modify: `tg-web/src/frontend/lib/billing.ts`
- Modify: `tg-web/src/frontend/pages/admin-billing-page.tsx`
- Modify: `tg-web/src/frontend/i18n/locales/en/billing.json`
- Modify: `tg-web/src/frontend/i18n/locales/zh/billing.json`
- Modify: `tg-web/tests/unit/app.test.ts`
- Modify: `tg-web/tests/unit/billing-pages.test.tsx`
- Modify: `tg-web/tests/integration/credit-billing-database.test.ts`

- [ ] **Step 1: Add failing settings tests**

Require defaults `5.00` and `2.00`, allow zero, reject negative/more-than-two-decimal/over-limit values, persist both values, and include both in audit snapshots.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm test:unit -- app.test.ts billing-pages.test.tsx && corepack pnpm test:integration -- credit-billing-database.test.ts`

- [ ] **Step 3: Extend backend contracts and validation**

Add `signupGrantUsd` and `referralRewardUsd` to `CreditBillingSettings` and `UpdateCreditBillingSettingsInput`. Validate with a non-negative decimal schema limited to two fractional digits and a bounded USD maximum.

- [ ] **Step 4: Persist and audit both settings**

Update `updateCreditSettings`, `ensureCreditSettings`, and `settingsSnapshot` so API responses and audit events contain both fields.

- [ ] **Step 5: Extend the admin credits form**

Add two USD numeric inputs and point previews computed through the exact conversion helper. Submit all credit settings in one PUT request and preserve the existing save/error flow.

- [ ] **Step 6: Re-run settings tests**

Expected: unit and integration tests PASS.

### Task 7: Ledger presentation and documentation

**Files:**
- Modify: `tg-web/src/frontend/pages/billing-page.tsx`
- Modify: `tg-web/src/frontend/i18n/locales/en/billing.json`
- Modify: `tg-web/src/frontend/i18n/locales/zh/billing.json`
- Modify: `tg-web/tests/unit/billing-pages.test.tsx`
- Modify: `tg-core/docs/API_SERVICE.md`
- Modify: `tg-core/docs/ARCHITECTURE_DESIGN.md`

- [ ] **Step 1: Add failing ledger presentation assertions**

Assert `referenceType=signup_grant` and `referenceType=referral_reward` render localized activity labels rather than raw English database descriptions.

- [ ] **Step 2: Implement localized ledger labels**

Map known reference types to `billing` i18n keys and retain the stored description as fallback for unknown/admin/Stripe events.

- [ ] **Step 3: Update service documentation**

Document the public invite redirect, authenticated referral summary endpoint, expanded admin credit settings, first-entry transaction, no-Stripe-free-subscription boundary, migration order, and idempotency keys.

- [ ] **Step 4: Run billing UI tests**

Run: `corepack pnpm test:unit -- billing-pages.test.tsx`

Expected: PASS.

### Task 8: Full verification and local deployment

**Files:**
- Verify all modified paths

- [ ] **Step 1: Run static validation**

Run: `corepack pnpm lint && corepack pnpm format:check && corepack pnpm typecheck`

Expected: exit 0 for all commands.

- [ ] **Step 2: Run test suites**

Run: `corepack pnpm test && corepack pnpm test:integration && corepack pnpm test:worker`

Expected: all tests PASS. If Docker/Testcontainers is unavailable, record that explicitly and retain the focused unit evidence.

- [ ] **Step 3: Build both production bundles**

Run: `corepack pnpm build && corepack pnpm build:node`

Expected: frontend and Node bundles build successfully.

- [ ] **Step 4: Inspect the patch**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors and only feature-related files changed.

- [ ] **Step 5: Rebuild images and migrate before application startup**

Run from repository root:

```powershell
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml build tradingagents-api tradingagents-web
docker compose --env-file tg-core/.env -f docker/docker-compose.yml up -d --wait postgres
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml run --rm --no-deps tradingagents-web node dist/backend/migrate-cli.js
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml up -d --no-build --wait
```

Expected: migration succeeds and all four services are healthy.

- [ ] **Step 6: Smoke-test final behavior**

Verify Core `/health`, Web `/api/ready`, an invalid invite redirect, and the account/admin pages in the running application. Do not create external Clerk users or Stripe objects solely for smoke testing.

No Git commits are included because repository instructions prohibit commits unless the user explicitly requests one.
