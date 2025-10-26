'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Layout } from '@/app/(features)/bookings/components/booking/Layout';
import { GOLF_CLUB_PRICING } from '@/types/golf-club-rental';
import { CheckIcon } from '@heroicons/react/24/outline';

export default function GolfClubRentalPage() {
  const [isImageEnlarged, setIsImageEnlarged] = useState(false);

  return (
    <Layout>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-green-700">Golf Club Rental</span>
            <span className="text-gray-900"> in Bangkok</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Rent premium golf clubs at LENGOLF. Perfect for tourists and locals who want to play with quality equipment.
            Use them at LENGOLF or take them to play at any golf course!
          </p>
        </div>

        {/* Main Image */}
        <div className="mb-8">
          <div 
            className="relative h-80 sm:h-96 lg:h-[28rem] rounded-xl overflow-hidden shadow-lg cursor-pointer hover:shadow-xl transition-shadow duration-300"
            onClick={() => setIsImageEnlarged(true)}
          >
            <Image
              src="/images/premium_club_rental.jpg"
              alt="LENGOLF Premium Golf Club Rental - Callaway Warbird and Majesty Shuttle Sets"
              fill
              className="object-contain bg-gray-50 hover:scale-105 transition-transform duration-300"
              sizes="100vw"
              priority
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 bg-black/20">
              <div className="bg-white/90 px-4 py-2 rounded-lg text-sm font-medium text-gray-800">
                Click to enlarge
              </div>
            </div>
          </div>
        </div>

        {/* Image Modal */}
        {isImageEnlarged && (
          <div 
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setIsImageEnlarged(false)}
          >
            <div className="relative max-w-6xl max-h-[90vh] w-full h-full">
              <Image
                src="/images/premium_club_rental.jpg"
                alt="LENGOLF Premium Golf Club Rental Details"
                fill
                className="object-contain"
                sizes="100vw"
              />
              <button
                onClick={() => setIsImageEnlarged(false)}
                className="absolute top-4 right-4 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 transition-colors duration-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Pricing Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Premium Club Rental Pricing
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {GOLF_CLUB_PRICING.map((pricing) => (
              <div 
                key={pricing.duration}
                className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-4 text-center hover:border-green-500 transition-colors"
              >
                <div className="text-lg font-semibold text-gray-900">{pricing.displayText}</div>
                <div className="text-2xl font-bold text-green-600 mt-2">฿{pricing.price}</div>
                <div className="text-sm text-gray-500 mt-1">Premium clubs</div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600 mt-4">
            *Standard clubs are provided free with any booking
          </p>
        </div>

        {/* Available Golf Club Sets */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Available Golf Club Sets
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Standard Clubs - Left Side */}
            <div className="bg-gray-50 rounded-xl shadow-sm border-2 border-gray-300 p-6 opacity-75 flex flex-col">
              <h3 className="text-xl font-bold text-gray-600 mb-2">
                Standard Set
              </h3>
              <p className="text-lg font-semibold text-gray-500 mb-2">
                Regular Rental Clubs
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Quality rental clubs suitable for all skill levels
              </p>
              
              <div className="mb-6 flex-1">
                <p className="font-semibold text-gray-600 mb-2">Includes:</p>
                <ul className="space-y-1">
                  <li className="flex items-start text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Full set of clubs</span>
                  </li>
                  <li className="flex items-start text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Golf bag included</span>
                  </li>
                  <li className="flex items-start text-sm text-gray-500">
                    <CheckIcon className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Suitable for beginners to intermediate</span>
                  </li>
                </ul>
              </div>

              <div className="text-center py-3 px-4 rounded-lg bg-gray-200 text-gray-500 font-semibold mt-auto">
                Free with Booking
              </div>
            </div>

            {/* Premium Clubs - Right Side */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-green-500 p-6 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Premium Choice
              </div>
              
              <h3 className="text-xl font-bold text-green-800 mb-2">
                Premium Sets
              </h3>
              <p className="text-lg font-semibold text-gray-700 mb-4">
                Callaway & Majesty Professional Clubs
              </p>
              
              <div className="space-y-4 mb-6 flex-1">
                {/* Men's Set */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-800">Men&apos;s Set - Callaway Warbird</h4>
                  <p className="text-sm text-gray-600 mb-2">Full set with Uniflex shafts</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Driver, 5-wood, Irons 5-9, PW, SW</span>
                    </li>
                    <li className="flex items-start text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Premium Callaway golf bag</span>
                    </li>
                  </ul>
                </div>

                {/* Women's Set */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-800">Women&apos;s Set - Majesty Shuttle</h4>
                  <p className="text-sm text-gray-600 mb-2">Ladies flex with premium design</p>
                  <ul className="space-y-1">
                    <li className="flex items-start text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>12.5° Driver, Irons 7-9, PW, 56° SW</span>
                    </li>
                    <li className="flex items-start text-sm text-gray-600">
                      <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span>Premium ladies golf bag</span>
                    </li>
                  </ul>
                </div>
              </div>

              <Link 
                href="/bookings"
                className="w-full block text-center py-3 px-4 rounded-lg font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white mt-auto"
              >
                Book with Golf Clubs
              </Link>
            </div>
          </div>
        </div>

        {/* Second-Hand Golf Club Purchase Section */}
        <div className="mb-12 max-w-5xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border-2 border-blue-500 p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Buy Quality Second-Hand Golf Clubs
              </h2>
              <p className="text-lg text-gray-700">
                Ready to own your own equipment? We offer quality second-hand golf sets and individual clubs
                at competitive prices to help you start your golf journey.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Beginner Sets */}
              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <div className="text-blue-600 font-semibold text-sm uppercase tracking-wide mb-2">
                  Beginner Sets
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  From ฿4,500
                </div>
                <p className="text-sm text-gray-600">
                  Complete sets perfect for those starting their golf journey
                </p>
              </div>

              {/* Bay Sets */}
              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <div className="text-blue-600 font-semibold text-sm uppercase tracking-wide mb-2">
                  Bay Sets Available
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  Quality Used
                </div>
                <p className="text-sm text-gray-600">
                  Same clubs we use at LENGOLF - proven quality and performance
                </p>
              </div>

              {/* Premium Sets */}
              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <div className="text-blue-600 font-semibold text-sm uppercase tracking-wide mb-2">
                  Premium Clubs
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  On Request
                </div>
                <p className="text-sm text-gray-600">
                  Higher-end models available - contact us for competitive pricing
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3 text-center">What We Offer:</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Full Sets & Individual Clubs</p>
                    <p className="text-sm text-gray-600">Buy a complete set or just the clubs you need</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Competitive Pricing</p>
                    <p className="text-sm text-gray-600">Affordable options to start your golf journey</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Quality Equipment</p>
                    <p className="text-sm text-gray-600">Well-maintained clubs from trusted brands</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckIcon className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Expert Advice</p>
                    <p className="text-sm text-gray-600">Our team helps you choose the right equipment</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Try for Free Highlight */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 mb-6 text-white text-center">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="text-xl font-bold">Try Before You Buy - FREE!</h4>
              </div>
              <p className="text-blue-50">
                Visit our store and test any club for free at our simulator. Make sure it's the perfect fit before purchasing!
              </p>
            </div>

            <div className="text-center">
              <p className="text-gray-700 mb-4 font-medium">
                Interested in purchasing? Contact us via LINE or visit our store to see available clubs and try them for free!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://lin.ee/uxQpIXn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors inline-flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  Contact via LINE
                </a>
                <Link
                  href="/bookings"
                  className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                >
                  Visit Our Store
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Why Choose LENGOLF Section */}
        <div className="bg-green-50 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-green-800 mb-4">
            Why Choose LENGOLF Golf Club Rental?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Premium Quality Equipment</h3>
              <p className="text-gray-700">
                Our rental clubs are high-quality models from top brands like Callaway and Majesty. 
                All clubs are professionally maintained and cleaned after each use.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Use Anywhere</h3>
              <p className="text-gray-700">
                Rent our clubs for LENGOLF sessions or take them to play at any golf course in Bangkok! 
                Perfect for tourists who don&apos;t want to travel with clubs.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Flexible Rental Duration</h3>
              <p className="text-gray-700">
                From quick 1-hour sessions to full-day rentals, choose the duration that fits your schedule. 
                Perfect for indoor simulator sessions or outdoor course play.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Easy Online Booking</h3>
              <p className="text-gray-700">
                Book your golf clubs along with your simulator bay in one easy process. 
                No deposits required, just show up and play!
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Can tourists rent golf clubs at LENGOLF?</h3>
              <p className="text-gray-700">
                Yes! Our golf club rental service is perfect for tourists visiting Bangkok. 
                No membership required - just book online and enjoy premium clubs during your visit.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-2">What brands of golf clubs are available for rent?</h3>
              <p className="text-gray-700">
                We offer premium Callaway Warbird sets for men and Majesty Shuttle sets for ladies. 
                Standard rental clubs are also available at reduced rates.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Can I use the rental clubs outside of LENGOLF?</h3>
              <p className="text-gray-700">
                Yes! You can take our rental clubs to play at any golf course in Bangkok or Thailand. 
                Perfect for tourists or locals who want to play without owning clubs.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Do you offer hourly golf club rental?</h3>
              <p className="text-gray-700">
                Yes, we offer flexible rental periods starting from just 1 hour (฿150) up to full day rentals (฿1,200).
                Choose the duration that matches your needs.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-blue-500">
              <h3 className="font-semibold text-gray-900 mb-2">Can I try clubs before buying them?</h3>
              <p className="text-gray-700">
                Absolutely! We encourage you to try any club for FREE at our simulator before purchasing.
                Visit our store, test the clubs, and make sure they're the perfect fit for your game before making a decision.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Ready to Play with Premium Clubs?
          </h3>
          <p className="text-gray-600 mb-4">
            Book your session with premium club rental at LENGOLF Bangkok. 
            Use them here or take them to any golf course!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/bookings"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Book with Golf Clubs
            </Link>
            <a 
              href="https://lin.ee/uxQpIXn" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Questions? Contact Us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}