'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Booking } from '@/app/types';
import { format } from 'date-fns';
import { CheckCircleIcon, CalendarIcon, ClockIcon, UserGroupIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import Layout from '@/app/components/booking/Layout';
import html2canvas from 'html2canvas';

export default function ConfirmationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bookingDetailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      const bookingId = searchParams.get('id');
      if (!bookingId) {
        setError('No booking ID provided');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: bookingData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (error) {
        setError('Failed to fetch booking details');
        setLoading(false);
        return;
      }

      if (bookingData) {
        const bookingWithTypes: Booking = {
          id: bookingData.id,
          user_id: bookingData.user_id,
          name: bookingData.name,
          email: bookingData.email,
          phone_number: bookingData.phone_number,
          date: bookingData.date,
          start_time: bookingData.start_time,
          duration: bookingData.duration,
          number_of_people: bookingData.number_of_people,
          status: bookingData.status as 'confirmed' | 'cancelled',
          created_at: bookingData.created_at,
          updated_at: bookingData.updated_at
        };
        setBooking(bookingWithTypes);
      }
      setLoading(false);
    };

    fetchBooking();
  }, [searchParams]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const handleDownloadScreenshot = async () => {
    if (bookingDetailsRef.current) {
      const canvas = await html2canvas(bookingDetailsRef.current);
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `booking-${booking?.id}.png`;
      link.click();
    }
  };

  if (loading) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-[36rem]">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-lg text-gray-600">Loading booking details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !booking) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="flex flex-col items-center justify-center min-h-[36rem]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Booking Not Found</h2>
            <p className="text-gray-600 mb-8">{error || 'Unable to find booking details'}</p>
            <button
              onClick={() => router.push('/bookings')}
              className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
            >
              Make a New Booking
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-3xl mx-auto">
        {/* Confirmation Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircleIcon className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600">Your booking has been successfully confirmed. Here are your booking details:</p>
        </div>

        {/* Booking Details Card */}
        <div ref={bookingDetailsRef} className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date */}
            <div className="flex items-center">
              <CalendarIcon className="w-6 h-6 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-semibold">
                  {booking?.date ? format(new Date(booking.date), 'EEEE, MMMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-center">
              <ClockIcon className="w-6 h-6 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Start Time</p>
                <p className="font-semibold">{booking?.start_time}</p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center">
              <ClockIcon className="w-6 h-6 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Duration</p>
                <p className="font-semibold">{booking?.duration} {booking?.duration === 1 ? 'hour' : 'hours'}</p>
              </div>
            </div>

            {/* People */}
            <div className="flex items-center">
              <UserGroupIcon className="w-6 h-6 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Number of People</p>
                <p className="font-semibold">{booking?.number_of_people}</p>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-semibold">{booking?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-semibold">{booking?.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-semibold">{booking?.phone_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Booking ID</p>
                <p className="font-semibold">{booking?.id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <button
            onClick={handleDownloadScreenshot}
            className="bg-gray-600 text-white py-3 px-6 rounded-lg hover:bg-gray-700 transition-colors font-semibold flex items-center gap-2"
          >
            <ClipboardIcon className="h-5 w-5" />
            Save Details
          </button>
          <button
            onClick={() => router.push('/bookings')}
            className="bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            Make Another Booking
          </button>
        </div>
      </div>
    </Layout>
  );
} 