import { Language, translations } from '@/lib/liff/translations';

interface GoogleMapsEmbedProps {
  language: Language;
}

export default function GoogleMapsEmbed({ language }: GoogleMapsEmbedProps) {
  const t = translations[language];

  // Use the official LENGOLF Google Maps link for directions
  const directionsUrl = 'https://maps.app.goo.gl/QhcvtyaQUej1a4vL8';

  // Google Maps Embed URL for LENGOLF
  const embedUrl = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d968.8489537775855!2d100.5427077!3d13.7433393!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30e29f8e97f37ccf%3A0x60c0527a6ea52f7c!2sLENGOLF!5e0!3m2!1sen!2sth!4v1234567890`;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-primary mb-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">{t.location}</h2>
        </div>
        <p className="text-gray-600 whitespace-pre-line text-sm">{t.address}</p>
      </div>

      <div className="relative h-64 bg-gray-100">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="LENGOLF Location"
        ></iframe>
      </div>

      <div className="p-4">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          {t.getDirections}
        </a>
      </div>
    </div>
  );
}
