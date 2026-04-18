// Make TypeScript aware of the message shape, typed from `messages/en.json`.
// This enables type-safe calls to `useTranslations(...)` and surfaces any
// locale file missing a key that `en.json` has as a typecheck error —
// preventing silent drift between locales.
//
// See: https://next-intl.dev/docs/workflows/typescript
type Messages = typeof import('../messages/en.json');

declare interface IntlMessages extends Messages {}
