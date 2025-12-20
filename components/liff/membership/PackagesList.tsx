'use client';

import { useState } from 'react';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import PackageCard from './PackageCard';

interface Package {
  id: string;
  packageName: string;
  packageCategory?: string;
  totalHours?: number | null;
  remainingHours?: number | null;
  usedHours?: number | null;
  expiryDate?: string | null;
  status: string;
}

interface PackagesListProps {
  activePackages: Package[];
  pastPackages: Package[];
  language: Language;
}

export default function PackagesList({ activePackages, pastPackages, language }: PackagesListProps) {
  const t = membershipTranslations[language];
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');

  const hasPastPackages = pastPackages.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">{t.myPackages}</h2>
      </div>

      {/* Tabs */}
      {hasPastPackages && (
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'active'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {t.activePackages} ({activePackages.length})
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'past'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {t.pastPackages} ({pastPackages.length})
          </button>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {activeTab === 'active' && (
          <>
            {activePackages.length > 0 ? (
              activePackages.map((pkg) => (
                <PackageCard key={pkg.id} package={pkg} language={language} />
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm">{t.noActivePackages}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'past' && (
          <>
            {pastPackages.length > 0 ? (
              pastPackages.map((pkg) => (
                <PackageCard key={pkg.id} package={pkg} language={language} />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 text-sm">{t.noPastPackages}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
