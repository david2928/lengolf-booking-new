'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';

interface Package {
  id: string;
  name: string;
  description: string;
  expiration_date: string;
  remaining_sessions: number;
}

export function UserPackages() {
  const { data: session } = useSession();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPackages() {
      try {
        const response = await fetch('/api/user/packages');
        
        if (!response.ok) {
          throw new Error('Failed to fetch packages');
        }
        
        const data = await response.json();
        setPackages(data.packages || []);
      } catch (err) {
        setError('Error loading packages. Please try again later.');
        console.error('Error fetching packages:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchPackages();
    } else {
      setLoading(false);
    }
  }, [session]);

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-white rounded-lg shadow">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 p-4 bg-white rounded-lg shadow">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="mt-4 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Your Packages</h2>
        <p className="text-gray-500">You don't have any active packages.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Your Packages</h2>
      <div className="space-y-4">
        {packages.map((pkg) => (
          <div key={pkg.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-gray-900">{pkg.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {pkg.remaining_sessions} sessions left
                </span>
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-500">
              Expires: {format(new Date(pkg.expiration_date), 'PPP')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 