'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SimulatorHeader from './components/SimulatorHeader';
import StatsOverview from './components/StatsOverview';
import RoundsList from './components/RoundsList';
import ScorecardDetail from './components/ScorecardDetail';
import RangeSessions from './components/RangeSessions';

type ViewState = 'loading' | 'error' | 'no_data' | 'dashboard';
type ActiveTab = 'overview' | 'rounds' | 'range';

interface StatsData {
  totalRounds: number;
  avgStrokesPerHole: number;
  fairwayPct: number;
  totalRangeBalls: number;
}

interface RecentRound {
  id: string;
  course: string;
  date: string;
  holesPlayed: number;
  isComplete: boolean;
  players: string[];
  totalStrokes: number;
}

interface RoundItem {
  id: string;
  course_name: string;
  round_date: string;
  holes_played: number;
  is_complete: boolean;
  players: string[];
  totalStrokes: number;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

interface RangeData {
  summary: {
    totalBalls: number;
    totalSessions: number;
    avgCarryYards: number;
  };
  sessions: {
    id: string;
    date: string;
    bayNumber: number | null;
    startTime: string | null;
    endTime: string | null;
    totalShots: number | null;
    avgCarryYards: number | null;
    primaryClub: string | null;
    clubs: { code: number; name: string; count: number; avgCarryYards: number }[];
  }[];
}

export default function SimulatorPage() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [lineUserId, setLineUserId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  // Data state
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [roundsData, setRoundsData] = useState<RoundItem[]>([]);
  const [roundsPagination, setRoundsPagination] = useState<Pagination>({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
  });
  const [rangeData, setRangeData] = useState<RangeData | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const fetchAllData = useCallback(async (userId: string) => {
    try {
      const [statsRes, roundsRes, rangeRes] = await Promise.all([
        fetch(`/api/liff/simulator/stats?lineUserId=${userId}`),
        fetch(`/api/liff/simulator/rounds?lineUserId=${userId}&page=1&limit=10`),
        fetch(`/api/liff/simulator/range?lineUserId=${userId}`),
      ]);

      const [statsJson, roundsJson, rangeJson] = await Promise.all([
        statsRes.json(),
        roundsRes.json(),
        rangeRes.json(),
      ]);

      // Check if user has no data / not matched
      if (statsJson.status === 'not_matched') {
        setViewState('no_data');
        return;
      }

      if (!statsRes.ok || !roundsRes.ok || !rangeRes.ok) {
        throw new Error('Failed to fetch simulator data');
      }

      setStatsData(statsJson.stats);
      setRecentRounds(statsJson.recentRounds || []);
      setRoundsData(roundsJson.rounds || []);
      setRoundsPagination(roundsJson.pagination || { currentPage: 1, totalPages: 0, totalCount: 0 });
      setRangeData(rangeJson);
      setViewState('dashboard');
    } catch (err) {
      console.error('[Simulator] Data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setViewState('error');
    }
  }, []);

  const loadMoreRounds = useCallback(async (page: number) => {
    if (!lineUserId) return;
    try {
      const res = await fetch(`/api/liff/simulator/rounds?lineUserId=${lineUserId}&page=${page}&limit=10`);
      const json = await res.json();
      if (res.ok) {
        setRoundsData(prev => [...prev, ...(json.rounds || [])]);
        setRoundsPagination(json.pagination);
      }
    } catch (err) {
      console.error('[Simulator] Load more rounds error:', err);
    }
  }, [lineUserId]);

  useEffect(() => {
    initializeLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeLiff = async () => {
    try {
      // DEV MODE: Test without LIFF (use query param ?dev=true&userId=...)
      const urlParams = new URLSearchParams(window.location.search);
      const devMode = urlParams.get('dev') === 'true';

      if (devMode && process.env.NODE_ENV === 'development') {
        const testUserId = urlParams.get('userId') || 'U-test-user-123';
        console.log('[DEV MODE] Bypassing LIFF initialization');
        setLineUserId(testUserId);
        setPlayerName('Test User');
        await fetchAllData(testUserId);
        return;
      }

      // Wait for LIFF SDK to be available (loaded via Script in layout)
      if (!window.liff) {
        const maxWait = 5000;
        const startTime = Date.now();
        while (!window.liff && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.liff) {
          throw new Error('LIFF SDK failed to load');
        }
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_SIMULATOR_ID;
      if (!liffId || liffId === 'your-liff-id-here') {
        console.warn('LIFF Simulator ID not configured');
        setViewState('no_data');
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
      setPlayerName(profile.displayName || '');

      // Cache userId for faster subsequent loads
      sessionStorage.setItem('liff-simulator-userId', profile.userId);

      await fetchAllData(profile.userId);
    } catch (err) {
      console.error('[Simulator] LIFF initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setViewState('error');
    }
  };

  const handleSelectRound = (roundId: string) => {
    setSelectedRoundId(roundId);
    setActiveTab('rounds');
  };

  const handleBackFromScorecard = () => {
    setSelectedRoundId(null);
  };

  // Loading state
  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <SimulatorHeader />
        <div className="px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="h-32 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50">
        <SimulatorHeader />
        <div className="px-4 py-12 text-center">
          <p className="text-red-500 text-sm mb-4">{error || 'Something went wrong'}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium text-[#005a32] underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (viewState === 'no_data') {
    return (
      <div className="min-h-screen bg-gray-50">
        <SimulatorHeader />
        <div className="px-4 py-12 text-center">
          <p className="text-2xl mb-2">🏌️</p>
          <p className="text-sm text-gray-500">
            No simulator data found for your account.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Play a round or hit the range to see your stats here!
          </p>
        </div>
      </div>
    );
  }

  // Dashboard state
  return (
    <div className="min-h-screen bg-gray-50">
      <SimulatorHeader playerName={playerName || undefined} />

      <div className="px-4 py-4 pb-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="rounds">Rounds</TabsTrigger>
            <TabsTrigger value="range">Range</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {statsData && (
              <StatsOverview
                stats={statsData}
                recentRounds={recentRounds}
                onSelectRound={handleSelectRound}
              />
            )}
          </TabsContent>

          <TabsContent value="rounds">
            {selectedRoundId ? (
              <ScorecardDetail
                roundId={selectedRoundId}
                onBack={handleBackFromScorecard}
              />
            ) : (
              <RoundsList
                rounds={roundsData}
                pagination={roundsPagination}
                onSelectRound={(id) => setSelectedRoundId(id)}
                onPageChange={loadMoreRounds}
              />
            )}
          </TabsContent>

          <TabsContent value="range">
            {rangeData && <RangeSessions rangeData={rangeData} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
