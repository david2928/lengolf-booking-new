'use client';

import { useEffect, useState } from 'react';
import { Language } from '@/lib/liff/translations';
import { membershipTranslations } from '@/lib/liff/membership-translations';
import LoadingState from '@/components/liff/membership/LoadingState';
import ErrorState from '@/components/liff/membership/ErrorState';
import MembershipHeader from '@/components/liff/membership/MembershipHeader';
import LinkAccountForm from '@/components/liff/membership/LinkAccountForm';
import ProfileCard from '@/components/liff/membership/ProfileCard';
import PackagesList from '@/components/liff/membership/PackagesList';
import BookingsList from '@/components/liff/membership/BookingsList';
import QuickActions from '@/components/liff/membership/QuickActions';

type ViewState = 'loading' | 'error' | 'not_linked' | 'dashboard';

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

interface Booking {
  id: string;
  date: string;
  startTime: string;
  duration: number;
  bay: string | null;
  status: string;
  numberOfPeople: number;
  notes?: string | null;
}

interface DashboardData {
  profile: {
    id: string;
    name: string | null;
    email?: string | null;
    phone?: string | null;
    pictureUrl?: string | null;
    customerCode?: string;
  };
  packages: {
    active: Package[];
    past: Package[];
  };
  bookings: {
    upcoming: Booking[];
    total: number;
  };
}

export default function MembershipPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [lineUserId, setLineUserId] = useState('');
  const [lineDisplayName, setLineDisplayName] = useState('');
  const [linePictureUrl, setLinePictureUrl] = useState('');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');

  useEffect(() => {
    initializeLiff();
    // Load saved language
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('liff-membership-language') as Language;
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'th')) {
        setLanguage(savedLanguage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE: Test without LIFF (use query param ?dev=true&userId=testUser)
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setLineUserId(testUserId);
        setLineDisplayName('Test User');
        await checkStatus(testUserId);
        return;
      }

      // Load LIFF SDK from CDN if not already loaded
      if (!window.liff) {
        const script = document.createElement('script');
        script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
        script.async = true;
        document.body.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_MEMBERSHIP_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.warn('LIFF Membership ID not configured');
        setViewState('not_linked');
        setLineDisplayName('Guest User');
        return;
      }

      await window.liff.init({ liffId }).catch((err) => {
        console.error('LIFF init error:', err);
        throw err;
      });

      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const profile = await window.liff.getProfile();
      setLineUserId(profile.userId);
      setLineDisplayName(profile.displayName);
      setLinePictureUrl(profile.pictureUrl || '');

      await checkStatus(profile.userId);

    } catch (err) {
      console.error('[Membership] LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  const checkStatus = async (userId: string) => {
    try {
      const response = await fetch(`/api/liff/membership/status?lineUserId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      if (data.status === 'not_linked') {
        setViewState('not_linked');
        return;
      }

      // User is linked, fetch dashboard data
      await fetchDashboard(userId);

    } catch (err) {
      console.error('[Membership] Status check error:', err);
      setError(err instanceof Error ? err.message : 'Failed to check status');
      setViewState('error');
    }
  };

  const fetchDashboard = async (userId: string) => {
    try {
      const response = await fetch(`/api/liff/membership/dashboard?lineUserId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch dashboard');
      }

      setDashboardData(data);
      setViewState('dashboard');

    } catch (err) {
      console.error('[Membership] Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard');
      setViewState('error');
    }
  };

  const handleLinkSuccess = async () => {
    // Refresh dashboard
    await fetchDashboard(lineUserId);
  };

  const toggleLanguage = () => {
    const newLanguage = language === 'en' ? 'th' : 'en';
    setLanguage(newLanguage);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liff-membership-language', newLanguage);
    }
  };

  const t = membershipTranslations[language];

  // Loading state
  if (viewState === 'loading') {
    return <LoadingState message={t.loading} />;
  }

  // Error state
  if (viewState === 'error') {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  // Not linked state
  if (viewState === 'not_linked') {
    return (
      <>
        <MembershipHeader
          language={language}
          onLanguageToggle={toggleLanguage}
        />
        <LinkAccountForm
          lineUserId={lineUserId}
          displayName={lineDisplayName}
          pictureUrl={linePictureUrl}
          language={language}
          onSuccess={handleLinkSuccess}
        />
      </>
    );
  }

  // Dashboard state
  if (viewState === 'dashboard' && dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <MembershipHeader
          language={language}
          onLanguageToggle={toggleLanguage}
          userName={dashboardData.profile.name || undefined}
        />

        <div className="px-4 py-6 space-y-4 pb-8">
          <ProfileCard
            profile={dashboardData.profile}
            language={language}
          />

          <PackagesList
            activePackages={dashboardData.packages.active}
            pastPackages={dashboardData.packages.past}
            language={language}
          />

          <BookingsList
            bookings={dashboardData.bookings.upcoming}
            total={dashboardData.bookings.total}
            language={language}
          />

          <QuickActions language={language} />
        </div>
      </div>
    );
  }

  return null;
}
