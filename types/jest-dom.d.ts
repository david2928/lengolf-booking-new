// Wires @testing-library/jest-dom's custom matchers (toBeInTheDocument,
// toBeEnabled, toBeDisabled, ...) into TypeScript's view of Jest's Matchers
// interface. jest.setup.js imports '@testing-library/jest-dom' for the
// runtime side-effect, but that file is plain JS and isn't part of the TS
// program, so `tsc --noEmit` never sees the ambient module augmentation
// without this reference.
//
// TRAP: the `import` below makes this a module, not a script — TypeScript
// scopes any `declare global { ... }` you write to reach outside a module,
// but a plain top-level `declare`/`interface` added later in THIS file
// would be module-scoped, not global, and silently fail to augment
// anything ambient. If you need to add another global ambient declaration,
// either wrap it in `declare global { ... }` or put it in its own file
// with no top-level `import`/`export` (see types/messages.d.ts for that
// pattern).
import '@testing-library/jest-dom';
