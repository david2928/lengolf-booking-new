'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StatsOverview from '../components/StatsOverview';
import RoundsList from '../components/RoundsList';
import ScorecardDetail from '../components/ScorecardDetail';
import RangeSessions from '../components/RangeSessions';

type ActiveTab = 'overview' | 'rounds' | 'range';

interface Customer {
  id: string;
  name: string;
}

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

export default function SimulatorDemoPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
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

  const fetchCustomerData = useCallback(async (customerId: string) => {
    setLoadingData(true);
    setError('');
    setSelectedRoundId(null);
    setActiveTab('overview');

    try {
      const [statsRes, roundsRes, rangeRes] = await Promise.all([
        fetch(`/api/liff/simulator/stats?customerId=${customerId}`),
        fetch(`/api/liff/simulator/rounds?customerId=${customerId}&page=1&limit=10`),
        fetch(`/api/liff/simulator/range?customerId=${customerId}`),
      ]);

      const [statsJson, roundsJson, rangeJson] = await Promise.all([
        statsRes.json(),
        roundsRes.json(),
        rangeRes.json(),
      ]);

      if (!statsRes.ok || !roundsRes.ok || !rangeRes.ok) {
        throw new Error('Failed to fetch simulator data');
      }

      setStatsData(statsJson.stats);
      setRecentRounds(statsJson.recentRounds || []);
      setRoundsData(roundsJson.rounds || []);
      setRoundsPagination(roundsJson.pagination || { currentPage: 1, totalPages: 0, totalCount: 0 });
      setRangeData(rangeJson);
    } catch (err) {
      console.error('[Demo] Data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadMoreRounds = useCallback(async (page: number) => {
    if (!selectedCustomerId) return;
    try {
      const res = await fetch(`/api/liff/simulator/rounds?customerId=${selectedCustomerId}&page=${page}&limit=10`);
      const json = await res.json();
      if (res.ok) {
        setRoundsData(prev => [...prev, ...(json.rounds || [])]);
        setRoundsPagination(json.pagination);
      }
    } catch (err) {
      console.error('[Demo] Load more rounds error:', err);
    }
  }, [selectedCustomerId]);

  // Fetch customer list on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch('/api/liff/simulator/demo/customers');
        const json = await res.json();
        if (res.ok && json.customers?.length > 0) {
          setCustomers(json.customers);
          // Auto-select first customer
          const firstId = json.customers[0].id;
          setSelectedCustomerId(firstId);
          fetchCustomerData(firstId);
        }
      } catch (err) {
        console.error('[Demo] Failed to fetch customers:', err);
        setError('Failed to load customer list');
      } finally {
        setLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, [fetchCustomerData]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (customerId) {
      fetchCustomerData(customerId);
    }
  };

  const handleSelectRound = (roundId: string) => {
    setSelectedRoundId(roundId);
    setActiveTab('rounds');
  };

  const handleBackFromScorecard = () => {
    setSelectedRoundId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo header */}
      <div className="bg-[#005a32] px-4 py-4 text-white">
        <div className="flex items-center gap-2">
          <span role="img" aria-label="test">🧪</span>
          <h1 className="text-lg font-bold">Simulator Stats &mdash; Demo Mode</h1>
        </div>
        <p className="text-sm text-green-100 mt-0.5">Internal testing — no LINE/LIFF required</p>
      </div>

      {/* Customer picker */}
      <div className="px-4 py-4 bg-white border-b">
        <label htmlFor="customer-select" className="block text-sm font-medium text-gray-700 mb-1">
          Select Customer
        </label>
        {loadingCustomers ? (
          <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ) : customers.length === 0 ? (
          <p className="text-sm text-gray-500">No customers with simulator data found.</p>
        ) : (
          <select
            id="customer-select"
            value={selectedCustomerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#005a32] focus:border-transparent"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="px-4 py-4">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loadingData && (
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
      )}

      {/* Dashboard */}
      {!loadingData && !error && statsData && (
        <div className="px-4 py-4 pb-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="rounds">Rounds</TabsTrigger>
              <TabsTrigger value="range">Range</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <StatsOverview
                stats={statsData}
                recentRounds={recentRounds}
                onSelectRound={handleSelectRound}
              />
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
      )}
    </div>
  );
}
