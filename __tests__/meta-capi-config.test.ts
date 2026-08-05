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
