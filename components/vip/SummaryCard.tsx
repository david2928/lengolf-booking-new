import React, { ReactNode } from 'react';
import Link from 'next/link';

interface SummaryCardProps {
  title: string;
  children: ReactNode;
  linkText?: string;
  linkHref?: string; // Changed from linkTo to linkHref for Next.js Link
}

const SummaryCard = ({ title, children, linkText, linkHref }: SummaryCardProps) => {
  return (
    <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-5">
      <h3 className="text-foreground font-semibold mb-3 text-lg">{title}</h3>
      <div className="text-muted-foreground">{children}</div>
      {linkText && linkHref && (
        <div className="mt-4">
          <Link href={linkHref} className="text-sm text-primary hover:underline font-medium">
            {linkText} →
          </Link>
        </div>
      )}
    </div>
  );
};

export default SummaryCard; 