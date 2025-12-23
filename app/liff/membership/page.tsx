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

interface MembershipDataResponse {
  status: 'linked' | 'not_linked';
  profile?: {
    id: string;
    name: string | null;
    email?: string | null;
    phone?: string | null;
    pictureUrl?: string | null;
    customerCode?: string;
  };
  packages?: {
    active: Package[];
    past: Package[];
  };
  bookings?: {
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
  const [prefetchedData, setPrefetchedData] = useState<MembershipDataResponse | null>(null);

  useEffect(() => {
    initializeLiff();
    // Load saved language
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('liff-membership-language') as Language;
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'th')) {
        setLanguage(savedLanguage);
      }

      // Try to prefetch data using cached userId
      const cachedUserId = sessionStorage.getItem('liff-membership-userId');
      if (cachedUserId) {
        console.log('[Membership] Prefetching data with cached userId:', cachedUserId);
        fetchData(cachedUserId).then(data => {
          if (data) {
            setPrefetchedData(data);
          }
        }).catch(err => {
          console.error('[Membership] Prefetch error:', err);
          // Clear stale cache on error
          sessionStorage.removeItem('liff-membership-userId');
        });
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
        await loadMembershipData(testUserId);
        return;
      }

      // Wait for LIFF SDK to be available (loaded via Script in layout)
      if (!window.liff) {
        // Poll for LIFF SDK to be ready (max 5 seconds)
        const maxWait = 5000;
        const startTime = Date.now();
        while (!window.liff && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.liff) {
          throw new Error('LIFF SDK failed to load');
        }
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

      // Cache userId for faster subsequent loads
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('liff-membership-userId', profile.userId);
      }

      // Check if we have prefetched data and it matches this userId
      if (prefetchedData && prefetchedData.profile?.id) {
        console.log('[Membership] Using prefetched data');
        handleDataResponse(prefetchedData);
        return;
      }

      // Fetch fresh data
      await loadMembershipData(profile.userId);

    } catch (err) {
      console.error('[Membership] LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  // Unified data fetching function
  const fetchData = async (userId: string) => {
    try {
      const response = await fetch(`/api/liff/membership/data?lineUserId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch data');
      }

      return data;
    } catch (err) {
      console.error('[Membership] Data fetch error:', err);
      throw err;
    }
  };

  const loadMembershipData = async (userId: string) => {
    try {
      const data = await fetchData(userId);
      handleDataResponse(data);
    } catch (err) {
      console.error('[Membership] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setViewState('error');
    }
  };

  const handleDataResponse = (data: MembershipDataResponse) => {
    if (data.status === 'not_linked') {
      setViewState('not_linked');
      return;
    }

    if (data.status === 'linked' && data.profile && data.packages && data.bookings) {
      setDashboardData({
        profile: data.profile,
        packages: data.packages,
        bookings: data.bookings
      });
      setViewState('dashboard');
    }
  };

  const handleLinkSuccess = async () => {
    // Refresh dashboard after account linking
    await loadMembershipData(lineUserId);
  };

  const toggleLanguage = () => {
    const newLanguage = language === 'en' ? 'th' : 'en';
    setLanguage(newLanguage);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liff-membership-language', newLanguage);
    }
  };

  const t = membershipTranslations[language];

  // Loading state - show skeleton if we have cached userId (faster perceived load)
  if (viewState === 'loading') {
    const hasCachedUserId = typeof window !== 'undefined' && sessionStorage.getItem('liff-membership-userId');
    return <LoadingState message={t.loading} skeleton={!!hasCachedUserId} />;
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
