#!/usr/bin/env bash
# Middleware smoke tests. Requires `npm run dev` running.
# Override port via `BASE_URL=http://localhost:3001 bash __tests__/middleware-smoke.sh`.
#
# Smoke tests for middleware.ts i18n + auth handling.
#
# These exist to catch the two regressions fixed in commit:
#   1. /auth/* exclusion was too broad — /auth/login should be locale-handled.
#   2. Root rewrite ran before next-intl — cookie-driven `/` → `/th` redirect
#      was never invoked.
#
# Run: BASE_URL=http://localhost:3004 ./__tests__/middleware-smoke.sh
# (Start `npm run dev` first; defaults to http://localhost:3000.)

set -uo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
fail=0

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS [$label] status=$actual"
  else
    echo "  FAIL [$label] expected=$expected actual=$actual"
    fail=1
  fi
}

assert_header() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS [$label] = $actual"
  else
    echo "  FAIL [$label] expected=$expected actual=$actual"
    fail=1
  fi
}

# Like assert_header but tolerates an absolute-URL form. Next.js dev emits
# relative `Location: /foo`, but Vercel's edge runtime sometimes emits
# `Location: https://host/foo`. Both are valid for a same-origin redirect.
assert_location() {
  local label="$1" expected_path="$2" actual="$3"
  case "$actual" in
    "$expected_path"|*"://"*"$expected_path")
      echo "  PASS [$label] = $actual"
      ;;
    *)
      echo "  FAIL [$label] expected=$expected_path (or absolute form) actual=$actual"
      fail=1
      ;;
  esac
}

# Helper: returns HTTP status code from HEAD request
status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# Helper: extracts a header value (case-insensitive) from HEAD response
header_of() {
  local name="$1"; shift
  curl -sI "$@" | tr -d '\r' | awk -F': ' -v n="${name,,}" 'tolower($1)==n {print $2; exit}'
}

echo "Test 1: NEXT_LOCALE=th cookie at / -> 307 to /th"
status=$(status_of -b "NEXT_LOCALE=th" "$BASE/")
loc=$(header_of "location" -b "NEXT_LOCALE=th" "$BASE/")
assert_status "status" "307" "$status"
assert_header "location" "/th" "$loc"

echo "Test 2: NEXT_LOCALE=th cookie at /auth/login -> 307 to /th/auth/login"
status=$(status_of -b "NEXT_LOCALE=th" "$BASE/auth/login")
loc=$(header_of "location" -b "NEXT_LOCALE=th" "$BASE/auth/login")
assert_status "status" "307" "$status"
assert_header "location" "/th/auth/login" "$loc"

echo "Test 3: No cookie at /auth/error -> 200 (no localization)"
status=$(status_of "$BASE/auth/error")
assert_status "status" "200" "$status"

echo "Test 4: No cookie at / -> 200 (rewritten to /bookings)"
status=$(status_of "$BASE/")
rewrite=$(header_of "x-middleware-rewrite" "$BASE/")
assert_status "status" "200" "$status"
assert_header "x-middleware-rewrite" "/en/bookings" "$rewrite"

echo "Test 5: /th -> 308 redirect to /th/bookings (canonical localized URL)"
# Previously this rewrote to /th/bookings, but next-intl's middleware silently
# collapsed the locale back to `en` downstream — bare-locale URLs rendered
# with `<html lang="en">` and English content. A 308 forces the browser to
# fetch the canonical /th/bookings, where the locale resolves correctly.
# Next.js dev returns Location as a same-origin path; Vercel may emit absolute.
status=$(status_of "$BASE/th")
loc=$(header_of "location" "$BASE/th")
assert_status "status" "308" "$status"
assert_location "location" "/th/bookings" "$loc"

echo "Test 5b: /ko -> 308 redirect to /ko/bookings (same fix, all locales)"
status=$(status_of "$BASE/ko")
loc=$(header_of "location" "$BASE/ko")
assert_status "status" "308" "$status"
assert_location "location" "/ko/bookings" "$loc"

# Test 6+: every unprefixed customer route must be matched by middleware and
# rewritten to its /en/* equivalent. Regression guard for the /course-rental
# 404 where the page was moved under [locale]/ but the matcher wasn't updated —
# a live Google Ads landing page silently broke.
for route in bookings vip play-and-food golf-club-rental course-rental; do
  echo "Test: /$route -> 200 (rewritten to /en/$route)"
  status=$(status_of "$BASE/$route")
  rewrite=$(header_of "x-middleware-rewrite" "$BASE/$route")
  assert_status "status" "200" "$status"
  assert_header "x-middleware-rewrite" "/en/$route" "$rewrite"
done

if [ "$fail" -eq 0 ]; then
  echo ""
  echo "All middleware smoke tests passed."
else
  echo ""
  echo "Middleware smoke tests FAILED."
fi
exit "$fail"
