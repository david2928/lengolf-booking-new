import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RootShell } from "@/components/layouts/RootShell";

export const metadata: Metadata = {
  title: "LENGOLF",
  description: "LENGOLF LINE Mini App",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LiffLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RootShell lang="en">{children}</RootShell>;
}
