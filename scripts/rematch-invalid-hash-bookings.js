#!/usr/bin/env node

/**
 * Rematch Bookings with Invalid stable_hash_id
 *
 * Some historical bookings were incorrectly tagged with an internal/back-office
 * placeholder stable_hash_id (e.g. 5949c7d454de981c21b099b295b7cbde).  This
 * script re-evaluates those bookings, finds the correct customer in
 * backoffice.customers via phone+name matching, and (optionally) updates the
 * bookings table.
 *
 * Usage:
 *   node scripts/rematch-invalid-hash-bookings.js \
 *       [--bad-hash=hash1,hash2] [--profile-id=UUID] \
 *       [--confidence=0.8] [--batch-size=50] [--apply] [--debug]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// -------------------- CLI configuration --------------------
const arg = (name, def) => {
  const raw = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!raw) return def;
  const [, value] = raw.split('=');
  return value;
};

const flag = name => process.argv.includes(`--${name}`);

const config = {
  badHashes: (arg('bad-hash', '5949c7d454de981c21b099b295b7cbde')).split(',').map(h => h.trim()).filter(Boolean),
  batchSize: parseInt(arg('batch-size', '50'), 10),
  confidenceThreshold: parseFloat(arg('confidence', '0.8')),
  profileId: arg('profile-id', null),
  apply: flag('apply'),
  debug: flag('debug')
};

if (config.debug) {
  console.log('[DEBUG] Config:', config);
}

// -------------------- Supabase client --------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// -------------------- Logging helpers --------------------
const logFileName = `rematch-bad-hash-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const logFilePath = path.join(__dirname, '..', 'logs', logFileName);

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    console.log(entry, data);
    fs.appendFileSync(logFilePath, `${entry}\n${JSON.stringify(data, null, 2)}\n`);
  } else {
    console.log(entry);
    fs.appendFileSync(logFilePath, `${entry}\n`);
  }
}

// -------------------- Utility functions (copied from previous script) --------------------
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  phone = String(phone);
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = normalized.substring(1);
  if (normalized.startsWith('66')) normalized = normalized.substring(2);
  if (normalized.length > 9 && !normalized.startsWith('66')) {
    normalized = normalized.substring(normalized.length - 9);
  }
  if (normalized.length > 8) return normalized.substring(normalized.length - 9);
  return normalized;
}

function calculateNameSimilarity(n1, n2) {
  if (!n1 || !n2) return 0;
  const norm = str => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const a = norm(n1);
  const b = norm(n2);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const pa = a.split(/\s+/);
  const pb = b.split(/\s+/);
  if (pa[0] === pb[0] && pa[0].length > 2) return 0.7;
  return 0;
}

function calculatePhoneSimilarity(p1, p2) {
  const a = normalizePhoneNumber(p1);
  const b = normalizePhoneNumber(p2);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  return 0;
}

async function loadCustomers() {
  const { data, error } = await supabase
    .schema('backoffice')
    .from('customers')
    .select('id, customer_name, contact_number, email, stable_hash_id');
  if (error) throw new Error(`Error fetching customers: ${error.message}`);
  return data;
}

function matchCustomer(booking, customers) {
  let best = null;
  let bestScore = 0;
  for (const c of customers) {
    const phoneScore = calculatePhoneSimilarity(booking.phone_number, c.contact_number);
    const nameScore = calculateNameSimilarity(booking.name, c.customer_name);
    if (phoneScore < 0.9) continue; // Require strong phone match
    const score = phoneScore * 0.8 + nameScore * 0.2;
    if (score > bestScore) {
      best = { customer: c, score, phoneScore, nameScore };
      bestScore = score;
    }
  }
  return bestScore >= config.confidenceThreshold ? best : null;
}

async function fetchProblemBookings() {
  let query = supabase
    .from('bookings')
    .select('id, user_id, name, phone_number, email, stable_hash_id')
    .in('stable_hash_id', config.badHashes);

  if (config.profileId) {
    query = query.eq('user_id', config.profileId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error fetching bookings: ${error.message}`);
  return data;
}

async function processBatch(bookings, customers, results) {
  for (const booking of bookings) {
    log('info', `Evaluating booking ${booking.id} (${booking.name}, ${booking.phone_number})`);

    const match = matchCustomer(booking, customers);
    if (!match) {
      log('warn', `No confident match for booking ${booking.id}`);

      if (config.apply) {
        // Clear the placeholder hash
        const { error: clrErr } = await supabase
          .from('bookings')
          .update({ stable_hash_id: null })
          .eq('id', booking.id);

        if (clrErr) {
          results.errors++;
          results.details.push({ bookingId: booking.id, status: 'error_clear', error: clrErr.message });
          log('error', `Failed to clear hash for booking ${booking.id}:`, clrErr);
        } else {
          results.cleared = (results.cleared || 0) + 1;
          results.details.push({ bookingId: booking.id, status: 'cleared_to_null' });
          log('info', `Cleared stable_hash_id to NULL for booking ${booking.id}`);
        }
      } else {
        // Dry-run preview of clearing
        results.previewClears = (results.previewClears || 0) + 1;
        results.details.push({ bookingId: booking.id, status: 'preview_clear_to_null' });
        log('info', `[DRY-RUN] Would clear stable_hash_id for booking ${booking.id}`);
      }
      continue;
    }

    const { customer, score } = match;
    const newHash = customer.stable_hash_id;

    if (config.apply) {
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ stable_hash_id: newHash })
        .eq('id', booking.id);
      if (updErr) {
        results.errors++;
        results.details.push({ bookingId: booking.id, status: 'error', error: updErr.message });
        log('error', `Failed to update booking ${booking.id}:`, updErr);
        continue;
      }
      results.fixed++;
      results.details.push({ bookingId: booking.id, status: 'fixed', oldHash: booking.stable_hash_id, newHash });
      log('info', `Updated booking ${booking.id} to ${newHash}`);
    } else {
      results.preview++;
      results.details.push({ bookingId: booking.id, status: 'preview', oldHash: booking.stable_hash_id, newHash, score });
      log('info', `[DRY-RUN] Would update booking ${booking.id} to ${newHash}`);
    }
  }
}

async function main() {
  try {
    log('info', 'Starting rematch for invalid hash bookings', config);

    const customers = await loadCustomers();
    const problemBookings = await fetchProblemBookings();

    log('info', `Found ${problemBookings.length} bookings to process`);

    const results = { preview: 0, fixed: 0, unmatched: 0, errors: 0, details: [] };

    for (let i = 0; i < problemBookings.length; i += config.batchSize) {
      const batch = problemBookings.slice(i, i + config.batchSize);
      await processBatch(batch, customers, results);
    }

    log('info', 'Processing finished', results);

    const jsonPath = logFilePath.replace('.log', '-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    log('info', `Detailed results saved to ${jsonPath}`);
  } catch (e) {
    log('error', 'Script failed:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 