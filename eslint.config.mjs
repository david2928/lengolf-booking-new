import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Routing is `localePrefix: 'as-needed'` over en/th/ko/ja/zh, so `next/link` and
// the locale-aware half of `next/navigation` silently drop non-English users
// back to the unprefixed (English) route. `@/i18n/navigation` re-exports
// locale-aware equivalents. See CLAUDE.md, "Main-site i18n (non-LIFF)".
const localeAwareNavigation = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "next/link",
          message:
            "Use `Link` from '@/i18n/navigation' so the locale prefix is kept.",
        },
        {
          name: "next/navigation",
          // useSearchParams / useParams / notFound are not locale-aware and have
          // no equivalent in '@/i18n/navigation' — they stay allowed.
          importNames: [
            "useRouter",
            "usePathname",
            "redirect",
            "permanentRedirect",
          ],
          message:
            "Use the equivalent from '@/i18n/navigation' so the locale prefix is kept.",
        },
      ],
    },
  ],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: localeAwareNavigation,
  },
  {
    // Surfaces that must NOT use locale-aware navigation:
    //   - app/error.tsx / app/not-found.tsx and the shared components they
    //     render sit outside [locale], so no NextIntlClientProvider is in
    //     scope and next-intl's Link would throw.
    //   - VipStatusProvider is mounted in the root app/providers.tsx, which
    //     wraps LIFF routes too.
    //   - LIFF uses the separate hand-rolled i18n system under lib/liff/.
    //   - /auth/error is deliberately unprefixed (CLAUDE.md).
    files: [
      "app/error.tsx",
      "app/not-found.tsx",
      "app/global-error.tsx",
      "app/liff/**/*.{ts,tsx}",
      "app/auth/**/*.{ts,tsx}",
      "app/preferences/**/*.{ts,tsx}",
      "components/shared/ErrorPage.tsx",
      "components/shared/NotFoundPage.tsx",
      "components/providers/VipStatusProvider.tsx",
      "components/liff/**/*.{ts,tsx}",
      "lib/liff/**/*.{ts,tsx}",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
