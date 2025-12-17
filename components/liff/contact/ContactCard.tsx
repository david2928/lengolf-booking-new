import { ReactNode } from 'react';

interface ContactCardProps {
  icon: ReactNode;
  title: string;
  value: string;
  actionLabel: string;
  actionHref: string;
}

export default function ContactCard({
  icon,
  title,
  value,
  actionLabel,
  actionHref,
}: ContactCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-primary mt-1">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-600 mb-1">{title}</div>
          <div className="text-lg font-semibold text-gray-900 mb-3 break-all">{value}</div>
          <a
            href={actionHref}
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 active:opacity-80 transition-opacity"
          >
            {actionLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
