import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface BookingStatusBannerProps {
  status: string;
  language: Language;
}

export default function BookingStatusBanner({ status, language }: BookingStatusBannerProps) {
  const t = membershipTranslations[language];

  const config = {
    confirmed: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      label: t.confirmed,
    },
    cancelled: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: <XCircle className="w-6 h-6 text-red-600" />,
      label: t.cancelled,
    },
    completed: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-700',
      icon: <Clock className="w-6 h-6 text-gray-500" />,
      label: t.completed,
    },
  };

  const c = config[status as keyof typeof config] || config.confirmed;

  return (
    <div className={`${c.bg} ${c.border} border rounded-lg p-4 flex items-center space-x-3`}>
      {c.icon}
      <span className={`text-lg font-semibold ${c.text}`}>{c.label}</span>
    </div>
  );
}
