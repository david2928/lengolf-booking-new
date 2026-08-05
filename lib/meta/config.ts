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
