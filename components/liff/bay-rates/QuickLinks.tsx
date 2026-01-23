'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Language, bayRatesTranslations } from '@/lib/liff/translations';
import { LIFF_URLS } from '@/lib/liff/urls';

interface QuickLinksProps {
  language: Language;
}

type MenuType = 'premium' | 'food' | 'drink' | null;

export default function QuickLinks({ language }: QuickLinksProps) {
  const t = bayRatesTranslations[language];
  const [selectedMenu, setSelectedMenu] = useState<MenuType>(null);

  const menuImages = {
    premium: '/images/premium_club_rental.jpg',
    food: '/images/food_menu.jpg',
    drink: '/images/drink_menu.jpg',
  };

  const handleMenuClick = (type: MenuType) => {
    setSelectedMenu(type);
  };

  const handleClose = () => {
    setSelectedMenu(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
        <div className="flex items-center gap-2 text-primary mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">{t.quickLinks}</h2>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <a
            href="/golf-club-rental"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {t.premiumClub}
            </span>
          </a>

          <button
            onClick={() => handleMenuClick('food')}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-orange-50 hover:bg-orange-100 active:bg-orange-200 transition-colors"
          >
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {t.foodMenu}
            </span>
          </button>

          <button
            onClick={() => handleMenuClick('drink')}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-purple-50 hover:bg-purple-100 active:bg-purple-200 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18M4 7h16M5 11h14M6 15h12M7 19h10M9 19v-8m6 8v-8" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3v8a4 4 0 008 0V3" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {t.drinkMenu}
            </span>
          </button>

          <a
            href={LIFF_URLS.promotions}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-pink-50 hover:bg-pink-100 active:bg-pink-200 transition-colors"
          >
            <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {t.viewPromotions}
            </span>
          </a>

          <a
            href={LIFF_URLS.contact}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-green-50 hover:bg-green-100 active:bg-green-200 transition-colors"
          >
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {t.contactUs}
            </span>
          </a>
        </div>
      </div>

      {/* Image Modal */}
      {selectedMenu && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full">
            <Image
              src={menuImages[selectedMenu]}
              alt={selectedMenu === 'premium' ? t.premiumClub : selectedMenu === 'food' ? t.foodMenu : t.drinkMenu}
              fill
              className="object-contain"
              sizes="100vw"
            />
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
