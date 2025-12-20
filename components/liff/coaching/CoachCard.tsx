import { useState } from 'react';
import { Coach } from '@/lib/liff/coaching-data';
import { Language, coachingTranslations } from '@/lib/liff/translations';
import Image from 'next/image';

interface CoachCardProps {
  coach: Coach;
  language: Language;
  onViewAvailability: () => void;
}

export default function CoachCard({ coach, language, onViewAvailability }: CoachCardProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const t = coachingTranslations[language];

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {/* Color Header */}
      <div
        className="h-2"
        style={{ backgroundColor: coach.color }}
      />

      {/* Coach Image */}
      <div
        className="relative h-48 bg-gray-100 cursor-pointer"
        onClick={() => setShowFullImage(true)}
      >
        <Image
          src={coach.imageUrl}
          alt={coach.fullName}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white opacity-0 hover:opacity-100 transition-opacity"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-xl font-bold mb-1" style={{ color: coach.color }}>
          PRO {coach.displayName}
        </h3>
        <p className="text-sm text-gray-600 mb-3">{coach.fullName}</p>

        {/* Specialties */}
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase mb-2">
            {t.specialties}
          </h4>
          <div className="flex flex-wrap gap-1">
            {coach.specialties[language].map((specialty, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700"
              >
                {specialty}
              </span>
            ))}
          </div>
        </div>

        {/* View Availability Button */}
        <button
          onClick={onViewAvailability}
          className="w-full py-2 px-4 rounded-lg text-white font-medium transition-colors"
          style={{ backgroundColor: coach.color }}
        >
          {t.viewAvailability}
        </button>
      </div>

      {/* Full-screen Image Modal */}
      {showFullImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setShowFullImage(false)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="relative w-full h-full max-w-4xl max-h-[90vh]">
            <Image
              src={coach.imageUrl}
              alt={coach.fullName}
              fill
              className="object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white text-lg font-bold">PRO {coach.displayName}</p>
            <p className="text-gray-300 text-sm">{coach.fullName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
