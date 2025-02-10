'use client';

import { format } from 'date-fns';
import { CheckCircleIcon, CalendarIcon, ClockIcon, UserGroupIcon, UserIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { PageTransition } from '@/components/shared/PageTransition';
import { useRouter } from 'next/navigation';
import { Booking } from '@/types';

interface ConfirmationContentProps {
  booking: Booking;
}

export function ConfirmationContent({ booking }: ConfirmationContentProps) {
  const router = useRouter();

  const handleMakeAnotherBooking = () => {
    router.push('/bookings');
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
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
                  {format(new Date(booking.date), 'MMM d, yyyy')}
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
              <div>
                <h3 className="text-sm font-medium text-gray-600">Time Period</h3>
                <p className="text-lg sm:text-xl font-bold text-green-700">
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
              <p className="text-gray-600 mb-2">Contact us through any of these channels:</p>
              <ul className="list-none space-y-2 text-gray-600">
                <li className="flex items-center">
                  <EnvelopeIcon className="h-5 w-5 text-green-600 mr-2" />
                  <a href="mailto:info@len.golf" className="text-green-600 hover:text-green-700">info@len.golf</a>
                </li>
                <li className="flex items-center">
                  <i className="fab fa-line text-xl text-green-600 mr-2"></i>
                  <span>LINE: <a href="https://lin.ee/uxQpIXn" className="text-green-600 hover:text-green-700">@lengolf</a></span>
                </li>
                <li className="flex items-center">
                  <PhoneIcon className="h-5 w-5 text-green-600 mr-2" />
                  <a href="tel:+66966682335" className="text-green-600 hover:text-green-700">+66 96-668-2335</a>
                </li>
              </ul>
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