const path = require('path')
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Claude Code checks worktrees out under <repo>/.claude/worktrees/<name>, so a plain
// `npx jest` from the repo root also collects every other branch's tests. We can't anchor
// the exclusion with <rootDir> (see the testPathIgnorePatterns note below), and an
// unanchored '/\.claude/worktrees/' would match a worktree's OWN path — ignoring all of
// its tests when jest runs from inside one. So only apply it from the real repo root.
const insideWorktree = __dirname.includes(
  `${path.sep}.claude${path.sep}worktrees${path.sep}`
)
const worktreeIgnorePatterns = insideWorktree ? [] : ['/\\.claude/worktrees/']

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Keeps the worktree checkouts out of the haste module map too (otherwise every
  // worktree's package.json collides and jest warns on each run).
  modulePathIgnorePatterns: ['.next', ...worktreeIgnorePatterns],
  // Note: '/__tests__/mocks/' and the worktree pattern are written without <rootDir> —
  // <rootDir> substitution breaks when the resolved path contains '\.', which is exactly
  // the case for a worktree under .claude\worktrees. Jest rewrites '/' to the platform
  // separator, so these match on Windows as-is.
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '/__tests__/mocks/',
    ...worktreeIgnorePatterns,
  ]
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig) 