'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Layout } from '@/app/(features)/bookings/components/booking/Layout';
import { PLAY_FOOD_PACKAGES } from '@/types/play-food-packages';

export default function PlayAndFoodPage() {
  const [isImageEnlarged, setIsImageEnlarged] = useState(false);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="text-green-700">PLAY</span>
            <span className="text-green-700"> & </span>
            <span className="text-green-700">FOOD</span>
            <span className="text-gray-900"> Package</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Golf entertainment + delicious food. Perfect for groups of 5 people.
          </p>
        </div>

        {/* Package Overview Image */}
        <div className="mb-8">
          <div 
            className="relative h-80 sm:h-96 lg:h-[28rem] rounded-xl overflow-hidden shadow-lg cursor-pointer hover:shadow-xl transition-shadow duration-300"
            onClick={() => setIsImageEnlarged(true)}
          >
            <Image
              src="/images/Play and food_2.jpg"
              alt="Play & Food Package Sets Overview"
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
                src="/images/Play and food_2.jpg"
                alt="Play & Food Package Sets Overview"
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

        {/* Package Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {PLAY_FOOD_PACKAGES.map((pkg) => (
            <div 
              key={pkg.id}
              className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-lg transition-all duration-300 flex flex-col ${
                pkg.isPopular ? 'border-green-500 relative' : 'border-gray-200'
              }`}
            >
              {pkg.isPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </div>
              )}
              
              <div className="p-6 flex-1 flex flex-col">
                {/* Header */}
                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold text-green-800">{pkg.name}</h3>
                  <p className="text-gray-600">{pkg.displayName}</p>
                </div>

                {/* Price */}
                <div className="text-center mb-6">
                  <div className="text-2xl font-bold text-green-700">
                    ฿{pkg.price.toLocaleString()} <span className="text-sm font-normal text-gray-600">NET</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    ฿{pkg.pricePerPerson} per person (group of 5)
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-3 mb-6 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-semibold">{pkg.duration} hour{pkg.duration > 1 ? 's' : ''}</span>
                  </div>
                  
                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Includes:</p>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>• Golf simulator usage ({pkg.duration} hour{pkg.duration > 1 ? 's' : ''})</div>
                      {pkg.foodItems.map((food, index) => (
                        <div key={index}>• {food.name}</div>
                      ))}
                      {pkg.drinks.map((drink, index) => (
                        <div key={index}>
                          • {drink.type === 'unlimited' ? 'Unlimited' : `${drink.quantity}x`} {drink.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="mt-auto">
                  <Link 
                    href={`/bookings?package=${pkg.id}`}
                    className={`w-full block text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                      pkg.isPopular 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    Select {pkg.name}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* About the Promotion */}
        <div className="bg-green-50 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-green-800 mb-4">About Our Play & Food Packages</h2>
          <div className="text-gray-700 space-y-3">
            <p>
              Experience the ultimate golf entertainment with our all-in-one packages that combine 
              golf simulation with delicious food and drinks!
            </p>
            <p>
              Each package is designed for groups of up to 5 people and includes everything you need for 
              a perfect outing: golf simulator time, fresh food prepared in our kitchen, and beverages. 
              You can enjoy these packages with fewer people too! No hidden costs, no surprises - just pure entertainment value.
            </p>
            <p className="font-semibold text-green-800">
              Perfect for friend groups, family outings, celebrations, or team building events. 
              No golf experience required - our friendly staff will help you get started!
            </p>
          </div>
        </div>

        {/* Simple Info */}
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Perfect for Groups</h3>
          <p className="text-gray-600 mb-4">
            All packages include golf simulation, food, and drinks for 5 people. 
            No golf experience needed - our staff will help you get started!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/bookings"
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Regular Booking
            </Link>
            <a 
              href="https://lin.ee/uxQpIXn" 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Questions? Contact us
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}