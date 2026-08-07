# Nightly Meta CAPI Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload every non-cancelled booking to Meta's Conversions API nightly, against hashed identifiers, so Facebook can attribute the ~86% of bookings that never touch a browser we own.

**Architecture:** A pg_cron job calls an authenticated Next.js route. The route reads a `public.meta_capi_pending` view (which encapsulates all candidate rules — channel detection, test-row exclusion, the 7-day window, and the already-uploaded anti-join), resolves and hashes identifiers in pure helper modules, POSTs to `graph.facebook.com/v22.0/{dataset}/events`, and records the outcome in `marketing.meta_capi_uploads`.

**Tech Stack:** Next.js 15 App Router (Node runtime), TypeScript, Supabase PostgREST via `createServerClient()`, `libphonenumber-js`, Node `crypto`, Jest.

**Spec:** `docs/superpowers/specs/2026-08-05-meta-capi-offline-conversions-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/meta/config.ts` | Lazily read env, return `null` when unconfigured. Never throws. |
| `lib/meta/identity.ts` | Pure: normalise email/phone/name, hash, assemble `user_data`. No I/O. |
| `lib/meta/capi.ts` | Build the Purchase event; POST to Graph. The only module that does network I/O. |
| `supabase/migrations/20260805120000_meta_capi_uploads.sql` | `marketing.meta_capi_uploads` + `public.meta_capi_pending` view. |
| `supabase/migrations/20260805120100_meta_capi_upload_cron.sql` | pg_cron schedule. |
| `app/api/cron/meta-capi-upload/route.ts` | Auth, orchestration, tracking writes. |
| `__tests__/meta-capi-config.test.ts` | Config never throws / returns null. |
| `__tests__/meta-capi-identity.test.ts` | Normalisation, denylist, hashing, precedence. |
| `__tests__/meta-capi-events.test.ts` | Event shape, event_id stability, transport, chunking. |

Splitting `identity` from `capi` matters: identity is pure and gets the heaviest test coverage, while `capi` is the only place that touches the network and can be mocked wholesale.

---

### Task 1: Config that cannot break the build

**Files:**
- Create: `lib/meta/config.ts`
- Test: `__tests__/meta-capi-config.test.ts`

This is the single most important constraint in the repo. `MARKETING_PREFS_SECRET` and `SHOPEEPAY_*` both shipped module-load assertions that threw during Next.js `Collecting page data`, failing every build until env vars landed in all three Vercel environments. Read env **inside** the function, return `null`, never throw.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/meta-capi-config.test.ts
import { getMetaCapiConfig } from '@/lib/meta/config';

const ORIGINAL = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL };
});

afterAll(() => {
  process.env = ORIGINAL;
});

describe('getMetaCapiConfig', () => {
  it('returns null when nothing is set', () => {
    delete process.env.META_CAPI_ACCESS_TOKEN;
    delete process.env.META_CAPI_DATASET_ID;
    expect(getMetaCapiConfig()).toBeNull();
  });

  it('returns null when only the token is set', () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'tok';
    delete process.env.META_CAPI_DATASET_ID;
    expect(getMetaCapiConfig()).toBeNull();
  });

  it('returns null when a value is blank or whitespace', () => {
    process.env.META_CAPI_ACCESS_TOKEN = '   ';
    process.env.META_CAPI_DATASET_ID = '1326508338698235';
    expect(getMetaCapiConfig()).toBeNull();
  });

  it('returns the config when both are set', () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'tok';
    process.env.META_CAPI_DATASET_ID = '1326508338698235';
    expect(getMetaCapiConfig()).toEqual({
      accessToken: 'tok',
      datasetId: '1326508338698235',
      testEventCode: null,
    });
  });

  it('carries the optional test event code', () => {
    process.env.META_CAPI_ACCESS_TOKEN = 'tok';
    process.env.META_CAPI_DATASET_ID = '1326508338698235';
    process.env.META_CAPI_TEST_EVENT_CODE = 'TEST12345';
    expect(getMetaCapiConfig()?.testEventCode).toBe('TEST12345');
  });

  it('never throws — importing and calling with a hostile env is safe', () => {
    process.env.META_CAPI_ACCESS_TOKEN = '';
    process.env.META_CAPI_DATASET_ID = '';
    expect(() => getMetaCapiConfig()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/meta-capi-config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/meta/config'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/meta/config.ts
/**
 * Meta Conversions API configuration.
 *
 * Deliberately NOT a module-load assertion. This repo has failed production
 * builds twice on exactly that pattern (MARKETING_PREFS_SECRET, SHOPEEPAY_*):
 * a throw at import time fires during Next.js `Collecting page data` and blocks
 * every deploy until the env vars land in all three Vercel environments. Callers
 * treat `null` as "not configured — log once and skip".
 */

export interface MetaCapiConfig {
  accessToken: string;
  datasetId: string;
  testEventCode: string | null;
}

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getMetaCapiConfig(): MetaCapiConfig | null {
  const accessToken = readEnv('META_CAPI_ACCESS_TOKEN');
  const datasetId = readEnv('META_CAPI_DATASET_ID');
  if (!accessToken || !datasetId) return null;

  return {
    accessToken,
    datasetId,
    testEventCode: readEnv('META_CAPI_TEST_EVENT_CODE'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/meta-capi-config.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/meta/config.ts __tests__/meta-capi-config.test.ts
git commit -m "feat(meta): lazy CAPI config that never throws at import"
```

---

### Task 2: Promote libphonenumber-js to a direct dependency

**Files:**
- Modify: `package.json`

It already resolves at 1.12.8 as a transitive dependency of `react-phone-number-input`. Declaring it directly costs nothing in install size and stops a future `react-phone-number-input` bump from silently removing our phone parser.

- [ ] **Step 1: Confirm the current resolved version**

Run: `node -e "console.log(require('libphonenumber-js/package.json').version)"`
Expected: `1.12.8`

- [ ] **Step 2: Add the direct dependency**

Add to the `dependencies` block of `package.json`, between `jsonwebtoken` and `lucide-react` (verified alphabetical position):

```json
    "libphonenumber-js": "^1.12.8",
```

- [ ] **Step 3: Install and verify the lockfile holds exactly one version**

```bash
npm install
node -e "const l=require('./package-lock.json');const k=Object.keys(l.packages).filter(p=>p.endsWith('node_modules/libphonenumber-js'));console.log(k.map(p=>p+' -> '+l.packages[p].version))"
```

Expected: exactly one entry, `node_modules/libphonenumber-js -> 1.12.8`. More than one entry means a nested duplicate — resolve it before continuing, per the native-dep lockfile rule in CLAUDE.md.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: promote libphonenumber-js to a direct dependency"
```

---

### Task 3: Email and phone normalisation

**Files:**
- Create: `lib/meta/identity.ts`
- Test: `__tests__/meta-capi-identity.test.ts`

The denylist is the load-bearing part. 383 of 411 staff bookings share one `@len.golf` address; sending it would attribute 383 conversions to a single person.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/meta-capi-identity.test.ts
import {
  normalizeEmail,
  normalizePhoneE164,
  phoneCountry,
  splitName,
} from '@/lib/meta/identity';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['no at sign', 'notanemail'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeEmail(input as string | null)).toBeNull();
  });

  // The placeholder: one shared address on 383 of 411 staff bookings.
  it.each([
    'info@len.golf',
    'INFO@LEN.GOLF',
    '  booking@len.golf  ',
    'anything@len.golf',
  ])('rejects the @len.golf placeholder: %s', (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });

  it('does not reject a lookalike domain that merely contains len.golf', () => {
    expect(normalizeEmail('someone@notlen.golf.com')).toBe('someone@notlen.golf.com');
  });
});

describe('normalizePhoneE164', () => {
  it.each([
    ['Thai local 10-digit', '0812345678', '+66812345678'],
    ['Thai with country code, no plus', '66812345678', '+66812345678'],
    ['Thai bare 9-digit, missing leading zero', '812345678', '+66812345678'],
    ['Thai with separators', '081-234-5678', '+66812345678'],
    ['Thai 09 prefix', '0991112222', '+66991112222'],
    ['Singapore tourist', '+6591234567', '+6591234567'],
    ['German tourist', '+4917612345678', '+4917612345678'],
  ])('normalises %s', (_label, input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['null', null],
    ['garbage', 'not a phone'],
    ['too short', '123'],
  ])('rejects %s', (_label, input) => {
    expect(normalizePhoneE164(input as string | null)).toBeNull();
  });
});

describe('phoneCountry', () => {
  // Meta wants a lowercase ISO-3166-1 alpha-2 country. Deriving it from the
  // parsed number is accurate per customer; hardcoding 'th' would be wrong for
  // every tourist in the book.
  it.each([
    ['Thai local', '0812345678', 'th'],
    ['Singapore', '+6591234567', 'sg'],
    ['Germany', '+4917612345678', 'de'],
  ])('derives %s', (_label, input, expected) => {
    expect(phoneCountry(input)).toBe(expected);
  });

  it('returns null for an unparseable number', () => {
    expect(phoneCountry('not a phone')).toBeNull();
  });
});

describe('splitName', () => {
  it('splits first and last', () => {
    expect(splitName('John Doe')).toEqual({ first: 'john', last: 'doe' });
  });

  it('treats a single token as first name only', () => {
    expect(splitName('Cher')).toEqual({ first: 'cher', last: null });
  });

  it('folds middle names into the last name field', () => {
    expect(splitName('Mary Jane Watson')).toEqual({ first: 'mary', last: 'jane watson' });
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(splitName("  O'Brien,  Sean  ")).toEqual({ first: 'obrien', last: 'sean' });
  });

  // Thai tone marks and vowel signs are Unicode category Mn, and Thai has no
  // precomposed forms. Stripping them rewrites the name and hashes to something
  // that matches nobody — the majority of this customer base.
  it.each([
    ['สมชาย ใจดี', { first: 'สมชาย', last: 'ใจดี' }],
    ['นิดา น้ำใส', { first: 'นิดา', last: 'น้ำใส' }],
    ['ธีระพงษ์ วงศ์คำ', { first: 'ธีระพงษ์', last: 'วงศ์คำ' }],
  ])('preserves Thai combining marks in %s', (input, expected) => {
    expect(splitName(input as string)).toEqual(expected);
  });

  it('folds decomposed and precomposed spellings to the same string', () => {
    // Build both forms from escapes. Written as pasted literals these are
    // visually identical, so the test would silently compare a string to
    // itself and prove nothing.
    const precomposed = 'José';       // e-acute as a single code point
    const decomposed = 'José';       // 'e' + combining acute
    expect(precomposed).not.toBe(decomposed);
    expect(splitName(decomposed)).toEqual(splitName(precomposed));
    expect(splitName(precomposed).first).toBe('josé');
  });

  it('returns nulls for blank input', () => {
    expect(splitName('  ')).toEqual({ first: null, last: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/meta-capi-identity.test.ts`
Expected: FAIL — `Cannot find module '@/lib/meta/identity'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/meta/identity.ts
/**
 * Identifier normalisation + hashing for the Meta Conversions API.
 *
 * Pure by design — no env reads, no network, no Supabase. Everything here is
 * unit-testable, which matters because a mistake in this file is invisible in
 * production: Meta accepts a wrong hash exactly as happily as a right one and
 * simply never matches it.
 */
import { createHash } from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Addresses that are not real customers. `@len.golf` is the placeholder staff
 * enter when a walk-in has no email — 383 of 411 staff bookings in the
 * Jul 4 - Aug 2 window carry the SAME one. Hashing and sending it would tell
 * Meta that a single person booked 383 times, and if that mailbox belongs to a
 * real Meta user, every staff booking misattributes onto them.
 */
const EMAIL_DOMAIN_DENYLIST = ['len.golf'];

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;

  // Exact domain match, not substring — `someone@notlen.golf.com` is a real
  // address and must survive.
  const domain = normalized.slice(at + 1);
  if (EMAIL_DOMAIN_DENYLIST.includes(domain)) return null;

  return normalized;
}

/**
 * Thai numbers are stored in a mix of shapes (`0xx` 10-digit, `66xx` 11-digit,
 * bare 9-digit missing the leading zero) and the customer base includes real
 * international numbers (+65, +49, +44, +62). A blanket "+66" prefix corrupts
 * the internationals, so parse properly with TH as the default region: explicit
 * international numbers keep their own country, bare local ones resolve to TH.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, 'TH');
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

/**
 * Lowercase ISO-3166-1 alpha-2, derived from the number itself. Meta accepts
 * `country` as a match key; hardcoding 'th' would be wrong for the +65/+49/+44
 * tourists and would feed Meta a false signal rather than no signal.
 */
export function phoneCountry(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, 'TH');
    if (!parsed || !parsed.isValid() || !parsed.country) return null;
    return parsed.country.toLowerCase();
  } catch {
    return null;
  }
}

export interface SplitName {
  first: string | null;
  last: string | null;
}

export function splitName(raw: string | null | undefined): SplitName {
  if (typeof raw !== 'string') return { first: null, last: null };

  // `\p{M}` (combining marks) is load-bearing, not decoration. Thai tone marks
  // and vowel signs are category Mn, and Thai has no precomposed letter+mark
  // forms — so `[^\p{L}\p{N}\s]` silently rewrites almost every Thai name
  // (สมชาย ใจดี -> สมชาย ใจด). Since the customer base is largely Thai, that
  // would hash the wrong string for most people: worse than sending no name,
  // because it looks like a signal and matches nobody.
  //
  // NFC first so a decomposed name and its precomposed twin hash identically —
  // once marks are preserved, "José" spelled two ways would otherwise produce
  // two different hashes.
  const cleaned = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) return { first: null, last: null };

  const parts = cleaned.split(' ');
  return {
    first: parts[0],
    last: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/meta-capi-identity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/meta/identity.ts __tests__/meta-capi-identity.test.ts
git commit -m "feat(meta): normalise email/phone/name for CAPI identifiers"
```

---

### Task 4: Hashing and user_data assembly

**Files:**
- Modify: `lib/meta/identity.ts` (append)
- Test: `__tests__/meta-capi-identity.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/meta-capi-identity.test.ts`, and extend the existing import at the top of the file to:

```ts
import {
  normalizeEmail,
  normalizePhoneE164,
  phoneCountry,
  splitName,
  hashIdentifier,
  buildUserData,
} from '@/lib/meta/identity';
```

```ts
describe('hashIdentifier', () => {
  // Verified against `node -e "crypto.createHash('sha256')..."`.
  it.each([
    ['test@example.com', '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b'],
    ['+66812345678', '7fc93a279e8accbc8e77df576f2f1806df2b9cbff068711f3de71108184e6bb2'],
    ['john', '96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a'],
    ['doe', '799ef92a11af918e3fb741df42934f3b568ed2d93ac1df74f1b8d41a27932a6f'],
    ['th', '6bde0b830d8bd56dea61c5c1cb648c7ffca6ffce2923ad1db9f29079cac947e0'],
  ])('hashes %s to the documented SHA-256', (input, expected) => {
    expect(hashIdentifier(input)).toBe(expected);
  });
});

describe('buildUserData', () => {
  it('prefers the customer record email over the booking email', () => {
    const result = buildUserData({
      bookingEmail: 'stale@example.com',
      customerEmail: 'test@example.com',
      phone: null,
      name: null,
    });
    expect(result?.userData.em).toEqual([
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    ]);
  });

  // The whole point of the customers join: 139 of 411 staff bookings hide a
  // real address behind the @len.golf placeholder on the booking row.
  it('falls back to the booking email when the customer email is the placeholder', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: 'info@len.golf',
      phone: null,
      name: null,
    });
    expect(result?.userData.em).toEqual([
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    ]);
  });

  it('hashes the phone in E.164', () => {
    const result = buildUserData({
      bookingEmail: null,
      customerEmail: null,
      phone: '0812345678',
      name: null,
    });
    expect(result?.userData.ph).toEqual([
      '7fc93a279e8accbc8e77df576f2f1806df2b9cbff068711f3de71108184e6bb2',
    ]);
  });

  it('includes hashed first and last name when present', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: null,
      phone: null,
      name: 'John Doe',
    });
    expect(result?.userData.fn).toEqual([
      '96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a',
    ]);
    expect(result?.userData.ln).toEqual([
      '799ef92a11af918e3fb741df42934f3b568ed2d93ac1df74f1b8d41a27932a6f',
    ]);
  });

  it('derives the country from the phone, not a hardcoded th', () => {
    const thai = buildUserData({
      bookingEmail: null, customerEmail: null, phone: '0812345678', name: null,
    });
    expect(thai?.userData.country).toEqual([
      '6bde0b830d8bd56dea61c5c1cb648c7ffca6ffce2923ad1db9f29079cac947e0',
    ]);

    const german = buildUserData({
      bookingEmail: null, customerEmail: null, phone: '+4917612345678', name: null,
    });
    // Must differ from the Thai hash — a tourist is not in Thailand.
    expect(german?.userData.country).not.toEqual(thai?.userData.country);
  });

  it('omits country when there is no phone to derive it from', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com', customerEmail: null, phone: null, name: null,
    });
    expect(result?.userData).not.toHaveProperty('country');
  });

  it('reports which identifier kinds were sent, never their values', () => {
    const result = buildUserData({
      bookingEmail: 'test@example.com',
      customerEmail: null,
      phone: '0812345678',
      name: 'John Doe',
    });
    expect(result?.matchKeys.sort()).toEqual(['country', 'em', 'fn', 'ln', 'ph']);
  });

  // Name alone is far too weak to match on and would pollute match-quality
  // metrics, so it is never sufficient on its own.
  it('returns null when neither email nor phone survives', () => {
    expect(
      buildUserData({
        bookingEmail: 'info@len.golf',
        customerEmail: null,
        phone: '',
        name: 'John Doe',
      }),
    ).toBeNull();
  });

  it('omits absent fields rather than sending empty arrays', () => {
    const result = buildUserData({
      bookingEmail: null,
      customerEmail: null,
      phone: '0812345678',
      name: null,
    });
    expect(result?.userData).not.toHaveProperty('em');
    expect(result?.userData).not.toHaveProperty('fn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/meta-capi-identity.test.ts`
Expected: FAIL — `hashIdentifier is not a function`

- [ ] **Step 3: Append the implementation to `lib/meta/identity.ts`**

```ts
/** SHA-256 hex. The value MUST already be normalised — Meta hashes normalised text. */
export function hashIdentifier(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

/** Meta's `user_data`. Every value is hashed; nothing here is reversible. */
export interface MetaUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  country?: string[];
}

export interface BuiltUserData {
  userData: MetaUserData;
  /** Identifier KINDS present, e.g. ['em','ph']. Never values — safe to log and store. */
  matchKeys: string[];
}

export interface IdentityInput {
  bookingEmail: string | null | undefined;
  customerEmail: string | null | undefined;
  phone: string | null | undefined;
  name: string | null | undefined;
}

export function buildUserData(input: IdentityInput): BuiltUserData | null {
  // Customer record first: it is clean (zero placeholders observed), while the
  // booking row carries the @len.golf placeholder on most staff bookings. Both
  // go through the denylist, so if the customer record is ever polluted the
  // booking row still gets its chance.
  const email = normalizeEmail(input.customerEmail) ?? normalizeEmail(input.bookingEmail);
  const phone = normalizePhoneE164(input.phone);

  // A name is a weak signal on its own and would inflate our apparent match
  // rate while matching nobody. Require at least one strong identifier.
  if (!email && !phone) return null;

  const { first, last } = splitName(input.name);

  const userData: MetaUserData = {};
  const matchKeys: string[] = [];

  if (email) {
    userData.em = [hashIdentifier(email)];
    matchKeys.push('em');
  }
  if (phone) {
    userData.ph = [hashIdentifier(phone)];
    matchKeys.push('ph');
  }
  if (first) {
    userData.fn = [hashIdentifier(first)];
    matchKeys.push('fn');
  }
  if (last) {
    userData.ln = [hashIdentifier(last)];
    matchKeys.push('ln');
  }

  // Only ever derived from the number we just parsed. Defaulting to 'th' would
  // feed Meta a false signal for every tourist rather than simply no signal.
  const country = phoneCountry(input.phone);
  if (country) {
    userData.country = [hashIdentifier(country)];
    matchKeys.push('country');
  }

  return { userData, matchKeys };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/meta-capi-identity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/meta/identity.ts __tests__/meta-capi-identity.test.ts
git commit -m "feat(meta): hash identifiers and assemble user_data"
```

---

### Task 5: Tracking table and candidate view

**Files:**
- Create: `supabase/migrations/20260805120000_meta_capi_uploads.sql`

The view holds every candidate rule in one reviewable place, so the route does not re-implement business logic in TypeScript and cannot drift from it.

- [ ] **Step 1: Write the migration**

```sql
-- Nightly Meta Conversions API upload: tracking table + candidate view.
--
-- Meta sees ~14% of bookings today. LIFF loads no GTM (it lives outside
-- app/[locale]/), and staff-created bookings never touch a browser we own.
-- This is the Meta analogue of marketing.google_ads_conversion_uploads.
--
-- Destination dataset is LENGOLF v2 (1326508338698235) -- Lengolf-owned and
-- attached to act_725466328005161. The pixel firing on the site
-- (480537434714703) is owned by someone outside our Business Manager and
-- cannot be written to; see the design spec.

CREATE TABLE IF NOT EXISTS marketing.meta_capi_uploads (
  booking_id      TEXT PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_id        TEXT NOT NULL,
  event_name      TEXT NOT NULL DEFAULT 'Purchase',
  event_time      TIMESTAMPTZ NOT NULL,
  value           NUMERIC NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'THB',
  action_source   TEXT NOT NULL,
  -- Identifier KINDS only ('em','ph','fn','ln'). Never values: this table must
  -- stay free of PII, hashed or otherwise.
  match_keys      TEXT[],
  status          TEXT NOT NULL CHECK (status IN ('pending','uploaded','failed','skipped')),
  events_received INTEGER,
  fbtrace_id      TEXT,
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  uploaded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_uploads_status_created
  ON marketing.meta_capi_uploads (status, created_at);

COMMENT ON TABLE marketing.meta_capi_uploads IS
  'Idempotency + diagnostics for the nightly Meta CAPI upload. match_keys records '
  'WHICH identifier kinds were sent, never their values.';

-- Candidate view. Every exclusion rule lives here so the route cannot drift.
--
-- The 7-day floor is not a nicety: Meta rejects the ENTIRE request if any
-- event_time is older than 7 days, so a single stale row would poison the whole
-- batch.
--
-- "staff-created" == no 'Booking creation' row in booking_process_logs. Web and
-- LIFF both write one and are indistinguishable in `bookings`; they share
-- action_source 'website', which is correct for both since LIFF is a webview.
CREATE OR REPLACE VIEW public.meta_capi_pending AS
SELECT
  b.id                                        AS booking_id,
  b.created_at                                AS event_time,
  b.name                                      AS customer_name,
  NULLIF(BTRIM(b.email), '')                  AS booking_email,
  NULLIF(BTRIM(c.email), '')                  AS customer_email,
  COALESCE(
    NULLIF(BTRIM(b.phone_number), ''),
    NULLIF(BTRIM(c.contact_number), '')
  )                                           AS phone,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.booking_process_logs l
     WHERE l.booking_id = b.id
       AND l.step = 'Booking creation'
  ) THEN 'website' ELSE 'physical_store' END  AS action_source
FROM public.bookings b
LEFT JOIN public.customers c ON c.id = b.customer_id
WHERE b.status <> 'cancelled'
  AND COALESCE(b.customer_notes, '') NOT ILIKE '%TEST BOOKING%'
  AND b.created_at >= NOW() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM marketing.meta_capi_uploads u
     WHERE u.booking_id = b.id
       -- 'pending' is deliberately NOT terminal: it means a previous run staged
       -- the row and then died before recording an outcome. Those must retry,
       -- and the stable event_id makes the retry safe against double-counting.
       AND (u.status IN ('uploaded','skipped')
            OR (u.status = 'failed' AND u.retry_count >= 3))
  );

COMMENT ON VIEW public.meta_capi_pending IS
  'Bookings eligible for Meta CAPI upload: non-cancelled, non-test, within Meta''s '
  '7-day event_time window, not already uploaded/skipped/exhausted.';

-- Server-side only. The route uses createServerClient() (service_role), and per
-- the Supabase hardening rules nothing in public may be readable by anon.
REVOKE ALL ON public.meta_capi_pending FROM anon, authenticated;
REVOKE ALL ON marketing.meta_capi_uploads FROM anon, authenticated;
```

- [ ] **Step 2: Apply to the database**

Apply via the Supabase MCP `apply_migration` tool (name: `meta_capi_uploads`) or the SQL editor. A migration file in the repo is **not** an applied migration — the marketing-consent incident lost three months of writes to exactly that gap.

- [ ] **Step 3: Verify the view returns rows and the anti-join works**

```sql
SELECT COUNT(*) AS pending, COUNT(*) FILTER (WHERE action_source='physical_store') AS staff
FROM public.meta_capi_pending;
```

Expected: a non-zero count, with `staff` making up the majority. Then confirm the table exists and is empty:

```sql
SELECT COUNT(*) FROM marketing.meta_capi_uploads;
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260805120000_meta_capi_uploads.sql
git commit -m "feat(meta): tracking table and candidate view for CAPI upload"
```

---

### Task 6: Build the Purchase event

**Files:**
- Create: `lib/meta/capi.ts`
- Test: `__tests__/meta-capi-events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/meta-capi-events.test.ts
import { buildPurchaseEvent, BOOKING_CONVERSION_VALUE_THB } from '@/lib/meta/capi';

const CANDIDATE = {
  booking_id: 'BK-12345',
  event_time: '2026-08-04T10:30:00+07:00',
  customer_name: 'John Doe',
  booking_email: 'test@example.com',
  customer_email: null,
  phone: '0812345678',
  action_source: 'physical_store' as const,
};

describe('buildPurchaseEvent', () => {
  it('uses a stable event_id derived from the booking id', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.event.event_id).toBe('booking-BK-12345');
  });

  it('is deterministic — the same booking always yields the same event_id', () => {
    const a = buildPurchaseEvent(CANDIDATE)?.event.event_id;
    const b = buildPurchaseEvent({ ...CANDIDATE })?.event.event_id;
    expect(a).toBe(b);
  });

  it('sends Purchase with the agreed value', () => {
    const built = buildPurchaseEvent(CANDIDATE);
    expect(built?.event.event_name).toBe('Purchase');
    // 1200, not 1813 — the latter is per-CUSTOMER and overstates a booking ~46%.
    expect(BOOKING_CONVERSION_VALUE_THB).toBe(1200);
    expect(built?.event.custom_data).toEqual({ value: 1200, currency: 'THB' });
  });

  it('converts event_time to unix SECONDS, not milliseconds', () => {
    const built = buildPurchaseEvent(CANDIDATE);
    // 2026-08-04T10:30:00+07:00 === 2026-08-04T03:30:00Z
    expect(built?.event.event_time).toBe(Math.floor(Date.parse('2026-08-04T03:30:00Z') / 1000));
    expect(String(built?.event.event_time)).toHaveLength(10);
  });

  it('carries the action_source through', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.event.action_source).toBe('physical_store');
    expect(
      buildPurchaseEvent({ ...CANDIDATE, action_source: 'website' })?.event.action_source,
    ).toBe('website');
  });

  it('exposes matchKeys alongside the event for tracking', () => {
    expect(buildPurchaseEvent(CANDIDATE)?.matchKeys.sort()).toEqual([
      'country', 'em', 'fn', 'ln', 'ph',
    ]);
  });

  it('returns null when no identifier survives, so the caller can mark it skipped', () => {
    expect(
      buildPurchaseEvent({
        ...CANDIDATE,
        booking_email: 'info@len.golf',
        customer_email: null,
        phone: null,
      }),
    ).toBeNull();
  });

  it('returns null for an unparseable event_time rather than sending a wrong instant', () => {
    expect(buildPurchaseEvent({ ...CANDIDATE, event_time: 'not-a-date' })).toBeNull();
  });

  it('never puts raw PII in the payload', () => {
    const json = JSON.stringify(buildPurchaseEvent(CANDIDATE));
    expect(json).not.toContain('test@example.com');
    expect(json).not.toContain('0812345678');
    expect(json).not.toContain('John');
    expect(json.toLowerCase()).not.toContain('john doe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/meta-capi-events.test.ts`
Expected: FAIL — `Cannot find module '@/lib/meta/capi'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/meta/capi.ts
/**
 * Meta Conversions API transport for booking conversions.
 *
 * The server is the SOLE source of the Purchase conversion: the GTM container
 * fires PageView / CompleteRegistration / custom micro-events, no Purchase, and
 * passes no eventID to any fbq call. So there is nothing on the browser side to
 * deduplicate against today.
 *
 * The stable event_id is kept regardless, because the live duplicate risk is
 * ours: a retried cron tick, two overlapping ticks, or a send that succeeds and
 * then fails to record. Meta collapses same-name + same-id events within 48h.
 */
import { buildUserData, type MetaUserData } from './identity';
// NOTE: `MetaCapiConfig` is imported in Task 7, when `sendEvents` starts using
// it. Importing it here would fail lint as an unused binding.

/**
 * Per-booking conversion value. Derived in the notes on GTM tag 62 in container
 * GTM-MKCHVJKW. Do NOT use 1813 — that is the per-CUSTOMER figure and overstates
 * a single booking by ~46%.
 */
export const BOOKING_CONVERSION_VALUE_THB = 1200;

export const GRAPH_API_VERSION = 'v22.0';

export type MetaActionSource = 'website' | 'physical_store';

/** One row of public.meta_capi_pending. */
export interface PendingBooking {
  booking_id: string;
  event_time: string;
  customer_name: string | null;
  booking_email: string | null;
  customer_email: string | null;
  phone: string | null;
  action_source: MetaActionSource;
}

export interface MetaServerEvent {
  event_name: 'Purchase';
  event_id: string;
  event_time: number;
  action_source: MetaActionSource;
  user_data: MetaUserData;
  custom_data: { value: number; currency: string };
}

export interface BuiltEvent {
  bookingId: string;
  event: MetaServerEvent;
  matchKeys: string[];
}

/** Stable and derived purely from the primary key, so retries collapse. */
export function eventIdForBooking(bookingId: string): string {
  return `booking-${bookingId}`;
}

export function buildPurchaseEvent(row: PendingBooking): BuiltEvent | null {
  const built = buildUserData({
    bookingEmail: row.booking_email,
    customerEmail: row.customer_email,
    phone: row.phone,
    name: row.customer_name,
  });
  if (!built) return null;

  const ms = Date.parse(row.event_time);
  if (Number.isNaN(ms)) return null;

  return {
    bookingId: row.booking_id,
    matchKeys: built.matchKeys,
    event: {
      event_name: 'Purchase',
      event_id: eventIdForBooking(row.booking_id),
      // Unix SECONDS. Milliseconds would read as the year ~57000 and be rejected.
      event_time: Math.floor(ms / 1000),
      action_source: row.action_source,
      user_data: built.userData,
      custom_data: {
        value: BOOKING_CONVERSION_VALUE_THB,
        currency: 'THB',
      },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/meta-capi-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/meta/capi.ts __tests__/meta-capi-events.test.ts
git commit -m "feat(meta): build Purchase events with stable event ids"
```

---

### Task 7: Transport

**Files:**
- Modify: `lib/meta/capi.ts` (append)
- Test: `__tests__/meta-capi-events.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Extend the import at the top of `__tests__/meta-capi-events.test.ts`:

```ts
import {
  buildPurchaseEvent,
  BOOKING_CONVERSION_VALUE_THB,
  sendEvents,
  MAX_EVENTS_PER_REQUEST,
} from '@/lib/meta/capi';
```

Append:

```ts
describe('sendEvents', () => {
  const CONFIG = {
    accessToken: 'tok-123',
    datasetId: '1326508338698235',
    testEventCode: null,
  };

  const EVENT = buildPurchaseEvent(CANDIDATE)!.event;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1, messages: [], fbtrace_id: 'trace-abc' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts to the dataset events endpoint', async () => {
    await sendEvents(CONFIG, [EVENT]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v22.0/1326508338698235/events');
  });

  it('sends the token in the body, never in the query string', async () => {
    await sendEvents(CONFIG, [EVENT]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('tok-123');
    expect(JSON.parse(init.body).access_token).toBe('tok-123');
  });

  it('returns events_received and the trace id', async () => {
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result).toEqual({
      ok: true,
      eventsReceived: 1,
      fbTraceId: 'trace-abc',
      error: null,
    });
  });

  it('omits test_event_code when unset', async () => {
    await sendEvents(CONFIG, [EVENT]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('test_event_code');
  });

  it('includes test_event_code when set', async () => {
    await sendEvents({ ...CONFIG, testEventCode: 'TEST123' }, [EVENT]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).test_event_code).toBe('TEST123');
  });

  it('surfaces a Graph API error without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: '(#100) Missing perms', code: 100, fbtrace_id: 'trace-err' },
      }),
    });
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing perms');
    expect(result.fbTraceId).toBe('trace-err');
  });

  it('surfaces a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const result = await sendEvents(CONFIG, [EVENT]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('socket hang up');
  });

  it('does nothing and reports ok for an empty batch', async () => {
    const result = await sendEvents(CONFIG, []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, eventsReceived: 0, fbTraceId: null, error: null });
  });

  it('caps a request at MAX_EVENTS_PER_REQUEST', () => {
    expect(MAX_EVENTS_PER_REQUEST).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/meta-capi-events.test.ts`
Expected: FAIL — `sendEvents is not a function`

- [ ] **Step 3: Append the implementation to `lib/meta/capi.ts`**

First add the config import at the top of the file, replacing the note left by Task 6:

```ts
import type { MetaCapiConfig } from './config';
```

Then append:

```ts
/** Meta's documented per-request ceiling. */
export const MAX_EVENTS_PER_REQUEST = 1000;

export interface SendResult {
  ok: boolean;
  eventsReceived: number;
  fbTraceId: string | null;
  error: string | null;
}

/**
 * POST one batch to the dataset. Never throws — a cron route that dies mid-run
 * leaves rows staged 'pending' with no diagnostic, so every failure path has to
 * come back as data the caller can record.
 */
export async function sendEvents(
  config: MetaCapiConfig,
  events: MetaServerEvent[],
): Promise<SendResult> {
  if (events.length === 0) {
    return { ok: true, eventsReceived: 0, fbTraceId: null, error: null };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.datasetId}/events`;

  // The token goes in the BODY. In the query string it would land in access
  // logs and any proxy in between.
  const body: Record<string, unknown> = {
    data: events,
    access_token: config.accessToken,
  };
  if (config.testEventCode) {
    body.test_event_code = config.testEventCode;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; code?: number; fbtrace_id?: string };
    };

    if (!response.ok || payload.error) {
      const message = payload.error?.message ?? `HTTP ${response.status}`;
      return {
        ok: false,
        eventsReceived: 0,
        fbTraceId: payload.error?.fbtrace_id ?? payload.fbtrace_id ?? null,
        error: message,
      };
    }

    return {
      ok: true,
      eventsReceived: payload.events_received ?? 0,
      fbTraceId: payload.fbtrace_id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      eventsReceived: 0,
      fbTraceId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Split a batch into request-sized chunks. */
export function chunkEvents<T>(events: T[], size = MAX_EVENTS_PER_REQUEST): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < events.length; i += size) {
    chunks.push(events.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/meta-capi-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/meta/capi.ts __tests__/meta-capi-events.test.ts
git commit -m "feat(meta): CAPI transport with non-throwing error surfacing"
```

---

### Task 8: The cron route

**Files:**
- Create: `app/api/cron/meta-capi-upload/route.ts`

Auth is copied deliberately from `app/api/cron/club-rental-expired-notify/route.ts:48-75` — same 503-when-unconfigured, same constant-time compare.

- [ ] **Step 1: Write the route**

```ts
/**
 * GET /api/cron/meta-capi-upload
 *
 * Nightly upload of bookings to the Meta Conversions API (dataset LENGOLF v2,
 * 1326508338698235). Meta sees ~14% of bookings without this: LIFF loads no GTM
 * and staff-created bookings never touch a browser we own.
 *
 * Scheduled by pg_cron ('meta-capi-upload-nightly', 20:00 UTC = 03:00 Bangkok;
 * net.http_get + Bearer CRON_API_KEY from Vault).
 *
 * Idempotency is belt-and-braces: public.meta_capi_pending anti-joins rows
 * already uploaded/skipped/exhausted, AND every event carries a stable
 * event_id derived from the booking id so Meta collapses any duplicate that
 * slips through a crashed run.
 *
 * `?dryRun=1` builds the payload and reports counts without POSTing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { getMetaCapiConfig } from '@/lib/meta/config';
import {
  buildPurchaseEvent,
  chunkEvents,
  sendEvents,
  eventIdForBooking,
  BOOKING_CONVERSION_VALUE_THB,
  type PendingBooking,
  type BuiltEvent,
} from '@/lib/meta/capi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET_MIN_LENGTH = 32;
const BATCH_LIMIT = 200;
/** Meta rejects the ENTIRE request if any event_time exceeds 7 days. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Safety margin so a row cannot age past the limit between query and POST. */
const AGE_SAFETY_MS = 60 * 60 * 1000;

function verifyCronSecret(
  request: NextRequest,
): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.CRON_API_KEY;
  if (!expected || expected.length < CRON_SECRET_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message: 'Cron endpoint is not configured. Set CRON_API_KEY (32+ chars) in this environment.',
    };
  }
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing or malformed Authorization header' };
  }
  const presented = header.slice('Bearer '.length).trim();
  if (presented.length !== expected.length) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return { ok: false, status: 401, message: 'Invalid token' };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const config = getMetaCapiConfig();
  if (!config && !dryRun) {
    // Fail SOFT. Never throw on missing config — see CLAUDE.md.
    console.warn('[meta-capi] META_CAPI_ACCESS_TOKEN / META_CAPI_DATASET_ID not set — skipping.');
    return NextResponse.json({ skipped: 'not configured' });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('meta_capi_pending')
    .select('booking_id, event_time, customer_name, booking_email, customer_email, phone, action_source')
    .order('event_time', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error('[meta-capi] candidate query failed:', error.message);
    return NextResponse.json({ error: 'Candidate query failed' }, { status: 500 });
  }

  const candidates = (data ?? []) as PendingBooking[];
  if (candidates.length === 0) {
    return NextResponse.json({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
  }

  // Re-check the age floor in the app. The view uses NOW() at query time; this
  // guards the window between the query and the POST, and one over-age event
  // would fail the whole request for every other booking in the batch.
  const ageFloor = Date.now() - MAX_EVENT_AGE_MS + AGE_SAFETY_MS;

  const built: BuiltEvent[] = [];
  const skipped: Array<{ row: PendingBooking; reason: string }> = [];

  for (const row of candidates) {
    const ms = Date.parse(row.event_time);
    if (Number.isNaN(ms)) {
      skipped.push({ row, reason: 'Unparseable event_time' });
      continue;
    }
    if (ms < ageFloor) {
      skipped.push({ row, reason: 'Outside Meta 7-day event_time window' });
      continue;
    }
    const event = buildPurchaseEvent(row);
    if (!event) {
      skipped.push({ row, reason: 'No usable email or phone identifier' });
      continue;
    }
    built.push(event);
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      configured: config !== null,
      scanned: candidates.length,
      wouldSend: built.length,
      skipped: skipped.length,
      // Kinds only — never identifier values.
      matchKeyHistogram: built.reduce<Record<string, number>>((acc, b) => {
        const key = b.matchKeys.slice().sort().join('+');
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      skipReasons: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }

  const nowIso = new Date().toISOString();

  // Record skips first so they never re-enter the candidate set.
  if (skipped.length > 0) {
    const { error: skipError } = await supabase
      .schema('marketing')
      .from('meta_capi_uploads')
      .upsert(
        skipped.map(({ row, reason }) => ({
          booking_id: row.booking_id,
          event_id: eventIdForBooking(row.booking_id),
          event_time: row.event_time,
          value: BOOKING_CONVERSION_VALUE_THB,
          action_source: row.action_source,
          status: 'skipped',
          error_message: reason,
        })),
        { onConflict: 'booking_id' },
      );
    if (skipError) {
      console.error('[meta-capi] failed to record skipped rows:', skipError.message);
    }
  }

  if (built.length === 0) {
    return NextResponse.json({ scanned: candidates.length, sent: 0, skipped: skipped.length, failed: 0 });
  }

  // Stage BEFORE sending. Sending without a tracking row is how untracked
  // duplicates are created, so a staging failure aborts the run.
  const { error: stageError } = await supabase
    .schema('marketing')
    .from('meta_capi_uploads')
    .upsert(
      built.map((b) => ({
        booking_id: b.bookingId,
        event_id: b.event.event_id,
        event_time: new Date(b.event.event_time * 1000).toISOString(),
        value: BOOKING_CONVERSION_VALUE_THB,
        action_source: b.event.action_source,
        match_keys: b.matchKeys,
        status: 'pending',
        error_message: null,
      })),
      { onConflict: 'booking_id' },
    );

  if (stageError) {
    console.error('[meta-capi] staging failed, aborting before send:', stageError.message);
    return NextResponse.json({ error: 'Staging failed' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunkEvents(built)) {
    const result = await sendEvents(config!, chunk.map((b) => b.event));
    const ids = chunk.map((b) => b.bookingId);

    if (result.ok) {
      sent += chunk.length;
      const { error: updateError } = await supabase
        .schema('marketing')
        .from('meta_capi_uploads')
        .update({
          status: 'uploaded',
          uploaded_at: nowIso,
          events_received: result.eventsReceived,
          fbtrace_id: result.fbTraceId,
          error_message: null,
        })
        .in('booking_id', ids);
      if (updateError) {
        // The events ARE at Meta. The rows stay 'pending' and will retry, which
        // the stable event_id makes safe — Meta collapses the duplicate.
        console.error('[meta-capi] send succeeded but tracking update failed:', updateError.message);
      }
    } else {
      failed += chunk.length;
      console.error('[meta-capi] batch failed:', result.error);
      const { error: failError } = await supabase.rpc('increment_meta_capi_retry', {
        p_booking_ids: ids,
        p_error_message: result.error ?? 'Unknown error',
        p_fbtrace_id: result.fbTraceId,
      });
      if (failError) {
        console.error('[meta-capi] retry increment failed:', failError.message);
      }
    }
  }

  console.log(
    `[meta-capi] scanned=${candidates.length} sent=${sent} skipped=${skipped.length} failed=${failed}`,
  );

  return NextResponse.json({ scanned: candidates.length, sent, skipped: skipped.length, failed });
}
```

- [ ] **Step 2: Add the atomic retry-increment function**

Create `supabase/migrations/20260805120050_meta_capi_retry_rpc.sql`:

```sql
-- Atomic retry bookkeeping for the Meta CAPI upload. A read-then-write from the
-- app would race two overlapping cron ticks and could reset retry_count,
-- letting a permanently-broken row retry forever.
CREATE OR REPLACE FUNCTION public.increment_meta_capi_retry(
  p_booking_ids   TEXT[],
  p_error_message TEXT,
  p_fbtrace_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'marketing'
AS $function$
  UPDATE marketing.meta_capi_uploads
     SET status        = 'failed',
         retry_count   = retry_count + 1,
         error_message = p_error_message,
         fbtrace_id    = COALESCE(p_fbtrace_id, fbtrace_id)
   WHERE booking_id = ANY(p_booking_ids);
$function$;

REVOKE ALL ON FUNCTION public.increment_meta_capi_retry(TEXT[], TEXT, TEXT) FROM anon, authenticated;
```

Apply it to the database the same way as Task 5.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Verify the dry run against real data**

Start the dev server, then:

```bash
curl -s -H "Authorization: Bearer $CRON_API_KEY" "http://localhost:3000/api/cron/meta-capi-upload?dryRun=1"
```

Expected: JSON with a non-zero `wouldSend`, and a `matchKeyHistogram` in which `em+fn+ln+ph` and `fn+ln+ph` dominate. If `wouldSend` is 0 while `scanned` is non-zero, the identifier resolution is broken — investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/meta-capi-upload/route.ts supabase/migrations/20260805120050_meta_capi_retry_rpc.sql
git commit -m "feat(meta): nightly CAPI upload cron route"
```

---

### Task 9: Route contract tests

**Files:**
- Create: `__tests__/meta-capi-route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/meta-capi-route.test.ts
import fs from 'fs';
import path from 'path';

const ROUTE = path.join(process.cwd(), 'app/api/cron/meta-capi-upload/route.ts');
const source = fs.readFileSync(ROUTE, 'utf8');

describe('meta-capi-upload route contract', () => {
  // The repo has failed production builds twice on module-load env assertions
  // (MARKETING_PREFS_SECRET, SHOPEEPAY_*). This must never regress.
  it('does not throw on missing configuration', () => {
    expect(source).toMatch(/getMetaCapiConfig\(\)/);
    expect(source).toMatch(/skipped: 'not configured'/);
    expect(source).not.toMatch(/throw new Error\([^)]*META_CAPI/);
  });

  it('requires a bearer token with a constant-time compare', () => {
    expect(source).toMatch(/CRON_API_KEY/);
    expect(source).toMatch(/charCodeAt\(i\) \^ expected\.charCodeAt\(i\)/);
  });

  it('stages tracking rows before sending', () => {
    const stageIdx = source.indexOf("status: 'pending'");
    const sendIdx = source.indexOf('sendEvents(');
    expect(stageIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(stageIdx).toBeLessThan(sendIdx);
  });

  it('aborts the run when staging fails', () => {
    expect(source).toMatch(/staging failed, aborting before send/i);
  });

  it('enforces the 7-day window in the app as well as the view', () => {
    expect(source).toMatch(/MAX_EVENT_AGE_MS/);
    expect(source).toMatch(/7 \* 24 \* 60 \* 60 \* 1000/);
  });

  // CLAUDE.md: side effects are awaited or wrapped in after(), never floating.
  it('has no floating promises', () => {
    expect(source).not.toMatch(/^\s*void\s+\w+\(/m);
    expect(source).not.toMatch(/\)\s*\.then\(/);
  });

  it('never logs identifier values', () => {
    // Only counts and kinds may be logged.
    expect(source).not.toMatch(/console\.(log|warn|error)\([^)]*\b(email|phone_number|booking_email|customer_email)\b/);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest __tests__/meta-capi-route.test.ts`
Expected: PASS

These are source-level assertions by necessity — the route needs a live Supabase client and jsdom performs no network, so a render-style test would pass against a broken implementation. This mirrors the approach already used in `__tests__/mobile-nav-scroll.test.ts` and `__tests__/booking-create-defers-side-effects.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add __tests__/meta-capi-route.test.ts
git commit -m "test(meta): route contract guards for config, auth, staging order"
```

---

### Task 10: Schedule the job

**Files:**
- Create: `supabase/migrations/20260805120100_meta_capi_upload_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Nightly Meta CAPI upload. 20:00 UTC == 03:00 Asia/Bangkok.
--
-- Nightly (not hourly) is deliberate: Meta's event_time window is 7 days, so a
-- daily cadence leaves six days of slack to notice and recover from an outage,
-- and steady-state events are never more than ~24h old.
--
-- The URL and the Vault key mirror 'club-rental-expired-notify-1min'.
-- SECURITY: the Vault lookup is a SUBQUERY inside the scheduled command, so
-- the token is resolved at execution time and never stored. Do NOT interpolate
-- it with format() -- that writes the secret in plaintext into
-- cron.job.command, readable by anyone who can query cron.job, and is exactly
-- what the July 2026 cron-token-to-Vault migration removed. Mirrors the
-- existing 'club-rental-expired-notify-1min' job.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed -- enable it and re-run this migration.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_api_key') THEN
    RAISE EXCEPTION 'Vault secret "cron_api_key" not found -- create it before scheduling.';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-capi-upload-nightly') THEN
    PERFORM cron.unschedule('meta-capi-upload-nightly');
  END IF;

  PERFORM cron.schedule(
    'meta-capi-upload-nightly',
    '0 20 * * *',
    $cron$
      SELECT net.http_get(
        url := 'https://booking.len.golf/api/cron/meta-capi-upload',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'cron_api_key' LIMIT 1
          )
        ),
        timeout_milliseconds := 55000
      ) AS request_id;
    $cron$
  );
END
$$;
```

- [ ] **Step 2: Confirm the Vault secret name matches reality**

```sql
SELECT name FROM vault.decrypted_secrets WHERE name ILIKE '%cron%';
```

Expected: a row named `cron_api_key`. If the name differs, correct the migration before applying — do not paste the secret value anywhere.

- [ ] **Step 3: Apply and verify the schedule**

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'meta-capi-upload-nightly';
```

Expected: one active row on `0 20 * * *`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260805120100_meta_capi_upload_cron.sql
git commit -m "feat(meta): schedule the nightly CAPI upload via pg_cron"
```

---

### Task 11: Gates, live verification, docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full gate set**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all four green. `npm run build` is not optional — it catches Server Component and webpack errors that typecheck and lint miss.

If `npm run build` fails in this worktree with `Module not found ../node_modules/next/dist/...` or `supabaseUrl is required`, junction `node_modules` to the parent checkout and copy in `.env.local` first — a known worktree quirk, not a code defect.

- [ ] **Step 2: Verify live against Events Manager Test Events**

Set `META_CAPI_TEST_EVENT_CODE` locally to the code shown in Events Manager → Test Events, then:

```bash
curl -s -H "Authorization: Bearer $CRON_API_KEY" "http://localhost:3000/api/cron/meta-capi-upload"
```

Expected: `{"scanned":N,"sent":N,"skipped":M,"failed":0}` and matching Purchase events appearing in the Test Events tab within a few seconds. Confirm in the Meta UI that `Value` reads 1200 THB and that the events show as matched on email/phone.

**Then clear the test rows** so the real run is not blocked:

```sql
DELETE FROM marketing.meta_capi_uploads;
```

- [ ] **Step 3: Document the feature in CLAUDE.md**

Add a section after the "Google Ads attribution capture" section:

```markdown
## Meta Conversions API upload (nightly)

`/api/cron/meta-capi-upload` uploads bookings to Meta dataset **LENGOLF v2
(1326508338698235)**, nightly at 03:00 Bangkok via pg_cron. Without it Meta sees
~14% of bookings — LIFF loads no GTM, and staff-created bookings never touch a
browser we own.

### The pixel on the site is not ours

`480537434714703` (GTM tag #48) is **not reachable from the LENGOLF Business
Manager** — not owned, not a client pixel, not on `act_725466328005161`. Its
audiences are named `MTZ - …`, which points at the agency. Do not try to send
CAPI events to it; you will get `(#100) Missing perms`. If GTM tag #48 has not
yet been repointed to `1326508338698235`, the browser and server halves are
still in different datasets.

### Never send the `@len.golf` email

It is the placeholder staff enter for walk-ins — **383 of 411** staff bookings in
Jul 2026 shared the same one. Sending it tells Meta that a single person booked
383 times. `lib/meta/identity.ts` denylists the domain; identity resolves from
`customers.email` first (clean, and recovers a real address for ~a third of
staff bookings), and phone carries the rest.

### Phone must be parsed, not prefixed

Bookings hold Thai `0xx`, `66xx`, bare 9-digit, **and** real `+65`/`+49`/`+44`/
`+62` tourist numbers. `libphonenumber-js` with default region `TH` is the only
correct treatment; a blanket `+66` corrupts the internationals. (The Google
uploader in `lengolf-ads-etl` still has the naive version — same latent bug.)

### The 7-day window is a hard edge

Meta rejects the **entire request** if any `event_time` is more than 7 days old.
Both `public.meta_capi_pending` and the route filter on it. This is also why
there is no backfill: history starts when the job is switched on. The 62-day
figure in older Meta docs belongs to the deprecated Offline Conversions API.

### Dedup

The container fires no `Purchase` and passes no `eventID`, so the server is the
sole source of the conversion and there is nothing to dedupe against on the
browser side. The stable `event_id` (`booking-<id>`) is still load-bearing: it
protects against our own retried or overlapping cron ticks, which is why a
tracking-update failure after a successful send is safe to leave for retry.

Env: `META_CAPI_ACCESS_TOKEN` (System User token, `ads_management`),
`META_CAPI_DATASET_ID`, optional `META_CAPI_TEST_EVENT_CODE`. All read lazily —
**never add a module-load assertion**, see the two incidents above.

Design spec: `docs/superpowers/specs/2026-08-05-meta-capi-offline-conversions-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the Meta CAPI upload and its non-obvious constraints"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/meta-capi-offline-conversions
gh pr create --base main --title "feat(meta): nightly Meta CAPI upload for bookings" --body "See docs/superpowers/specs/2026-08-05-meta-capi-offline-conversions-design.md"
```

Then run the `code-reviewer` agent on the branch, address findings, and merge with `gh pr merge --squash`.

**Do not merge before `META_CAPI_ACCESS_TOKEN` and `META_CAPI_DATASET_ID` exist in Production + Preview + Development.** The code fails soft so the build will not break — but the job will silently no-op every night, which is the failure mode that hid the marketing-consent bug for three months.

---

## Deferred (do not build here)

- `_fbp` / `_fbc` capture, the Meta analogue of `lib/attribution/click-ids.ts`.
- Real-time CAPI in `/api/bookings/create` under `after()`, importing these helpers.
- Fixing the Thai-only phone normaliser in `lengolf-ads-etl/src/extractors/google/conversion-upload.ts:445`.
- Changing campaign objectives off `OUTCOME_TRAFFIC`/`OUTCOME_ENGAGEMENT` so delivery can actually optimise on these conversions.
