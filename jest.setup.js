import '@testing-library/jest-dom' 

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
}));

// Mock cache functions
jest.mock('@/lib/cache', () => ({
  calendarCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  authCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  getCacheKey: {
    auth: jest.fn(),
    calendar: jest.fn(),
  },
  updateCalendarCache: jest.fn(),
}));

// Mock debug functions
jest.mock('@/lib/debug', () => ({
  debug: {
    log: jest.fn(),
  },
}));

// Mock web APIs
if (typeof global.Request === 'undefined') {
  global.Request = class MockRequest {
    constructor(input, init) {
      this.input = input;
      this.init = init;
      this.method = init?.method || 'GET';
      this.body = init?.body;
    }

    async json() {
      return JSON.parse(this.body);
    }
  };
}

if (typeof global.Response === 'undefined') {
  global.Response = class MockResponse {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Headers(init.headers);
    }

    async json() {
      return JSON.parse(this._body);
    }

    get body() {
      return this._body;
    }
  };
}

// Mock NextResponse
jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: (data, init) => {
        const jsonStr = JSON.stringify(data);
        const response = new Response(jsonStr, init);
        Object.defineProperty(response, 'json', {
          value: async () => data
        });
        return response;
      },
    },
  };
});

// Mock performance API
if (typeof global.performance === 'undefined') {
  global.performance = {
    now: () => Date.now(),
  };
}

// Mock Headers API
if (typeof global.Headers === 'undefined') {
  global.Headers = class MockHeaders {
    constructor(init = {}) {
      this._headers = new Map();
      Object.entries(init).forEach(([key, value]) => {
        this._headers.set(key.toLowerCase(), value);
      });
    }

    get(key) {
      return this._headers.get(key.toLowerCase()) || null;
    }

    set(key, value) {
      this._headers.set(key.toLowerCase(), value);
    }
  };
}

// Mock URL API
if (typeof global.URL === 'undefined') {
  global.URL = class MockURL {
    constructor(url) {
      this.href = url;
    }
  };
} 