import React, { ReactNode } from 'react';
import Link from 'next/link';

interface DashboardCardProps {
  title: string;
  icon: ReactNode;
  href: string; // Changed from 'to' to 'href' for Next.js Link
  description?: string;
}

const DashboardCard = ({ title, icon, href, description }: DashboardCardProps) => {
  return (
    <Link href={href} className="block w-full h-full">
      {/* Applying card-like styling, can be adjusted to match project's Card component */}
      <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-6 h-full flex flex-col hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-primary text-2xl">{icon}</div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {description && (
          <p className="text-muted-foreground text-sm mt-1 flex-grow">{description}</p>
        )}
        <div className="mt-auto pt-4 text-sm text-primary font-medium">
          View more →
        </div>
      </div>
    </Link>
  );
};

export default DashboardCard; 