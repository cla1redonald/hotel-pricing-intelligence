import '@testing-library/jest-dom/vitest';

// Patch Node.js module resolution to support @/ path aliases in require() calls.
// This allows test files to use require('@/lib/supabase') to reconfigure mocks.
// We inject proxy stubs into Node's require cache keyed by absolute paths.
// The proxies delegate all property access to the live vitest ESM mock, so
// require('@/lib/supabase').supabase.from.mockReturnValue(...) affects the same
// vi.fn() that the route's await import('@/lib/supabase') receives.
import { register } from 'tsconfig-paths';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi, beforeEach } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, '..');
const srcPath = path.resolve(rootPath, 'src');

// Register @/* alias via tsconfig-paths
register({
  baseUrl: rootPath,
  paths: { '@/*': ['src/*'] },
});

// Patch _resolveFilename to try .ts/.tsx extensions for extensionless paths
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module = (await import('module')).Module as any;
const originalResolveFilename = Module._resolveFilename.bind(Module);

Module._resolveFilename = function(request: string, ...args: unknown[]): string {
  try {
    return originalResolveFilename(request, ...args);
  } catch {
    if (!path.extname(request)) {
      for (const ext of ['.ts', '.tsx']) {
        try { return originalResolveFilename(request + ext, ...args); } catch { /* continue */ }
      }
    }
    throw new Error(`Cannot find module '${request}'`);
  }
};

// ---------------------------------------------------------------------------
// Live-proxy require stubs
// ---------------------------------------------------------------------------
// Each stub is a Proxy that, on every property access, looks up the current
// vitest ESM mock for that module (via dynamic import in a beforeEach-synced
// cache) and delegates to it. This ensures require('@/lib/supabase').supabase.from
// is the SAME vi.fn() instance as the one the route receives from
// await import('@/lib/supabase').
//
// Implementation: we maintain a mutable "live" object per module that is
// refreshed in a beforeEach hook. The CJS stub's exports object is a Proxy
// that reads from the live object on every access. The beforeEach syncs the
// live object from the ESM mock before each test.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveModule = Record<string, any>;

const liveModules: Record<string, LiveModule> = {
  supabase: { supabase: { from: vi.fn() } },
  pinecone: { getPineconeIndex: vi.fn() },
  embeddings: { generateQueryEmbedding: vi.fn() },
  'rate-limit': { rateLimit: vi.fn(), getClientIp: vi.fn() },
};

// Sync live modules from the vitest ESM mock registry before each test.
// This ensures that after vi.clearAllMocks() and vi.mock() factory setup,
// require('@/lib/...') returns the same objects as import('@/lib/...').
beforeEach(async () => {
  const moduleMap: Array<[string, string]> = [
    ['supabase', '@/lib/supabase'],
    ['pinecone', '@/lib/pinecone'],
    ['embeddings', '@/lib/embeddings'],
    ['rate-limit', '@/lib/rate-limit'],
  ];

  for (const [key, moduleId] of moduleMap) {
    try {
      const esmMock = await import(moduleId);
      // Deep-merge the ESM mock's exports into the live module object.
      // We mutate the EXISTING live object so the CJS stub's exports proxy
      // always reflects the current state.
      const live = liveModules[key];
      for (const exportKey of Object.keys(esmMock)) {
        live[exportKey] = (esmMock as LiveModule)[exportKey];
      }
    } catch {
      // Module not mocked or not found — keep the fallback vi.fn() stubs
    }
  }
});

function injectModuleStub(
  relativePath: string,
  liveModule: LiveModule,
) {
  const absPath = path.resolve(srcPath, relativePath);
  // The exports object IS the live module object (not a copy).
  // Mutations to liveModule are reflected immediately in any code that
  // has a reference to this exports object.
  (require.cache as Record<string, unknown>)[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports: liveModule,
    children: [],
    paths: [],
  };
}

injectModuleStub('lib/supabase.ts', liveModules['supabase']);
injectModuleStub('lib/pinecone.ts', liveModules['pinecone']);
injectModuleStub('lib/embeddings.ts', liveModules['embeddings']);
injectModuleStub('lib/rate-limit.ts', liveModules['rate-limit']);
