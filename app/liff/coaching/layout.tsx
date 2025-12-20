import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LENGOLF Coaching',
  description: 'Expert golf coaching at LENGOLF. View our professional coaches, pricing, and availability.',
};

export default function CoachingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
