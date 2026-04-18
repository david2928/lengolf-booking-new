import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RootShell } from "@/components/layouts/RootShell";

export const metadata: Metadata = {
  title: "LENGOLF Authentication",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RootShell lang="en">{children}</RootShell>;
}
