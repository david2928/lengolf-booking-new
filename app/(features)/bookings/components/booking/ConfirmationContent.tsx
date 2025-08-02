'use client';

import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Booking } from '@/types';
import { 
  CheckCircleIcon, 
  CalendarIcon, 
  ClockIcon, 
  UserGroupIcon, 
  UserIcon, 
  PhoneIcon, 
  EnvelopeIcon 
} from '@heroicons/react/24/outline';
import { GOLF_CLUB_OPTIONS } from '@/types/golf-club-rental';

// Dynamically import PageTransition with loading fallback
const PageTransition = dynamic(
  () => import('@/components/shared/PageTransition').then(mod => mod.PageTransition),
  {
    loading: () => (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto"></div>
      </div>
    ),
    ssr: false
  }
);

interface ConfirmationContentProps {
  booking: Booking;
}

export function ConfirmationContent({ booking }: ConfirmationContentProps) {
  const router = useRouter();

  const handleMakeAnotherBooking = () => {
    router.push('/bookings');
  };

  // Extract club rental info from customer_notes
  const getClubRentalInfo = () => {
    if (!booking.customer_notes) return null;
    
    const clubRentalMatch = booking.customer_notes.match(/Golf Club Rental: ([^\n]+)/);
    if (clubRentalMatch) {
      const [, setName] = clubRentalMatch;
      const clubOption = GOLF_CLUB_OPTIONS.find(club => 
        club.name === setName.trim()
      );
      return clubOption || { name: setName };
    }
    return null;
  };

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto">
        {/* Confirmation Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-green-100 rounded-full p-3">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-center text-gray-600">Here are your booking details:</p>
        </div>

        {/* Booking Details Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Date Card */}
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="bg-green-50 p-2 sm:p-3 rounded-full">
                <CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Date</h3>
                <p className="text-lg sm:text-xl font-bold text-green-700">
                  {format(new Date(booking.date), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          {/* Time Card */}
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="bg-green-50 p-2 sm:p-3 rounded-full">
                <ClockIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-600">Time Period</h3>
                <p className="text-lg sm:text-xl font-bold text-green-700 whitespace-nowrap">
                  {booking.start_time} - {format(
                    new Date(`2000-01-01T${booking.start_time}`).getTime() + booking.duration * 60 * 60 * 1000,
                    'HH:mm'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* People Card */}
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="bg-green-50 p-2 sm:p-3 rounded-full">
                <UserGroupIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Number of People</h3>
                <p className="text-lg sm:text-xl font-bold text-green-700">
                  {booking.number_of_people}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-50 p-2 rounded-full">
                <UserIcon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-semibold text-gray-900">{booking.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-green-50 p-2 rounded-full">
                <PhoneIcon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-semibold text-gray-900">{booking.phone_number}</p>
              </div>
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <div className="bg-green-50 p-2 rounded-full">
                <EnvelopeIcon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold text-gray-900">{booking.email}</p>
              </div>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-gray-600 mb-1">Booking ID</p>
              <p className="font-mono text-sm bg-gray-50 p-2 rounded">{booking.id}</p>
            </div>
          </div>
        </div>

        {/* Club Rental Information */}
        {getClubRentalInfo() && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Golf Club Rental</h3>
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-3 rounded-full">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">Selected Clubs</p>
                <p className="font-semibold text-gray-900">
                  {getClubRentalInfo()?.name}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Club rental charges will be added based on your {booking.duration} hour{booking.duration > 1 ? 's' : ''} booking duration
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Important Information */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Information</h3>
          
          {/* Email Confirmation Notice */}
          <div className="mb-4 p-3 bg-green-50 rounded-lg">
            <p className="text-green-800">
              A booking confirmation has been sent to your email address: <span className="font-medium">{booking.email}</span>
            </p>
          </div>

          {/* What to Know Section */}
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Before Your Visit</h4>
              <ul className="list-disc pl-5 space-y-2 text-gray-600">
                <li>Please arrive 5-10 minutes early to ensure a smooth check-in process and receive a brief introduction to our facilities.</li>
                <li>Golf clubs are provided free of charge for your convenience.</li>
                <li>Up to 5 players can play on a single bay.</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Need to Modify or Cancel?</h4>
              <p className="text-gray-600 mb-3">You can now manage your bookings online through your account:</p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center">
                  <div className="bg-green-100 p-2 rounded-full mr-3">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-green-800 font-medium">Manage Your Bookings Online</p>
                    <p className="text-green-700 text-sm">Visit your <a href="/vip/bookings" className="underline font-medium">My Bookings</a> page to modify or cancel reservations.</p>
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-sm mt-3">You can also contact us directly if you need assistance.</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center">
          <button
            onClick={handleMakeAnotherBooking}
            className="bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            Make Another Booking
          </button>
        </div>
      </div>
    </PageTransition>
  );
} 