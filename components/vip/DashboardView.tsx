'use client'; // Required as it will be used by a client component page and has conditional rendering

import React from 'react';
import Link from 'next/link';
import { Calendar, Package, User, Award, ExternalLink, CalendarIcon as CalendarLucideIcon, Megaphone, Edit, Link as LinkIconLucide, Clock } from 'lucide-react';
// TODO: Resolve Booking type import when vipService is migrated (VIP-FE-001)
// import { Booking } from '@/services/vipService'; 
import { Button } from '@/components/ui/button';
import LinkAccountPrompt from './LinkAccountPrompt'; // Assuming LinkAccountPrompt is in the same directory
import { Session } from "next-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, CalendarDays, Package as PackageLucideIcon, UserCircle } from "lucide-react";

// Temporary local Booking type
interface Booking {
  id: string;
  date: string; // Raw date string e.g., "YYYY-MM-DD"
  time: string; // Raw time string e.g., "HH:mm"
  duration?: number;
}

// Placeholder for a more detailed active package structure
interface ActivePackage {
  id: string;
  name: string;
  tier?: string; // e.g., "Gold"
  hoursRemaining?: string | number;
  expires?: string; // e.g., "Dec 31, 2025"
  // any other relevant fields
}

interface DashboardViewProps {
  isMatched: boolean;
  userName: string;
  nextBooking?: Booking;
  primaryActivePackage?: ActivePackage; // For detailed display of one package
  vipTier?: string;
  // Props for LinkAccountPrompt if needed, or it fetches its own data
}

const DashboardView: React.FC<DashboardViewProps> = ({
  isMatched,
  userName,
  nextBooking,
  primaryActivePackage,
  vipTier
}) => {
  // Helper function to format date and time
  const formatBookingDateTime = (dateStr: string, timeStr: string) => {
    const dateObj = new Date(`${dateStr}T${timeStr}`);
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
    const day = dateObj.getDate();
    const time = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return (
      <span>
        <span className="text-green-700 font-semibold">{weekday}, {month} {day}</span>
        <span className="text-gray-700"> at </span>
        <span className="text-green-700 font-semibold">{time}</span>
      </span>
    );
  };

  if (!isMatched) {
    // The LinkAccountPrompt is designed to be a more prominent, full-section prompt.
    // The original DashboardView had a smaller inline prompt.
    // For VIP-FE-003, `LinkAccountPrompt.tsx` will be used prominently.
    // Here, we can show a simplified version or a part of the Profile link.
    return (
      <div className="space-y-6">
        <LinkAccountPrompt username={userName} />
        <div className="bg-white text-card-foreground border rounded-lg shadow-sm p-4">
          <Link 
            href="/vip/profile"
            className="flex items-center gap-3 text-foreground hover:text-primary transition-colors">
            <User size={20} />
            <div>
              <h3 className="font-medium text-gray-900">View/Edit Basic Profile</h3>
              <p className="text-sm text-muted-foreground">Update your name, email, and preferences</p>
            </div>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-8"> {/* Increased spacing for stacked cards */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {userName}!</h1>
        <p className="text-muted-foreground">Ready to manage your bookings?</p>
      </div>
      
      {vipTier && (
        <div className="bg-white text-card-foreground border rounded-lg shadow-sm p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Award className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h3 className="font-medium text-amber-700">{vipTier} Tier</h3>
            <p className="text-sm text-muted-foreground">Enjoy your premium benefits</p>
          </div>
        </div>
      )}
      
      {/* Stacked cards for Upcoming Session and Active Package */}
      <div className="space-y-6">
        {/* Upcoming Session Card */}
        <Card className="shadow-lg border-gray-200"> {/* Applied shadow and subtle border */}
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-800">Upcoming Session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between">
            <div className="flex-grow mb-4 md:mb-0 md:mr-4">
              {nextBooking ? (
                <div className="space-y-2">
                  <div className="flex items-center">
                    <CalendarDays className="mr-3 h-5 w-5 text-primary" />
                    <span className="text-md font-semibold">
                      {formatBookingDateTime(nextBooking.date, nextBooking.time)}
                    </span>
                  </div>
                  {nextBooking.duration !== undefined && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="mr-3 h-4 w-4 text-gray-400" />
                      <span>Duration: {nextBooking.duration} hour{nextBooking.duration > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You have no upcoming bookings.</p>
              )}
            </div>
            <Link href="/vip/bookings" className="w-full md:w-auto md:ml-auto">
              <Button className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
                <Calendar className="mr-2 h-4 w-4" />
                Manage Bookings
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        {/* Active Package Card */}
        <Card className="shadow-lg border-gray-200"> {/* Applied shadow and subtle border */}
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-800">Active Package</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between">
            <div className="flex-grow mb-4 md:mb-0 md:mr-4">
              {primaryActivePackage ? (
                <div className="space-y-2">
                  <div className="flex items-center">
                    <PackageLucideIcon className="mr-3 h-5 w-5 text-primary" />
                    <span className="text-md font-semibold text-green-700">
                      {primaryActivePackage.name}
                    </span>
                  </div>
                  {primaryActivePackage.hoursRemaining !== undefined && 
                    <div className="flex items-center text-sm text-muted-foreground">
                       <Clock className="mr-3 h-4 w-4 text-gray-400" />
                      <span>
                        {primaryActivePackage.hoursRemaining} hour{Number(primaryActivePackage.hoursRemaining) !== 1 ? 's' : ''} remaining
                      </span>
                    </div>
                  }
                  {primaryActivePackage.expires && 
                    <div className="flex items-center text-sm text-muted-foreground">
                      <CalendarDays className="mr-3 h-4 w-4 text-gray-400" />
                      <span>Expires: {primaryActivePackage.expires}</span>
                    </div>
                  }
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active package found.</p>
              )}
            </div>
            {primaryActivePackage && (
              <Link href={`/vip/packages`} className="w-full md:w-auto md:ml-auto">
                <Button variant="outline" className="w-full md:w-auto border-primary text-primary hover:bg-primary/10">
                  <PackageLucideIcon className="mr-2 h-4 w-4" />
                  View Package Details
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Quick Access */}
      <Card className="shadow-lg border-gray-200"> {/* Applied shadow and subtle border */}
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-gray-800">Quick Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: "/bookings", icon: Calendar, label: "Make New Booking" },
              { href: "/vip/bookings", icon: Edit, label: "Manage My Bookings" },
              // { href: "#", icon: CalendarLucideIcon, label: "View Bay Rates", onClick: () => alert('Bay Rates: To be implemented') },
              // { href: "#", icon: Megaphone, label: "Show Promotions", onClick: () => alert('Promotions: To be implemented') },
              { href: "/vip/profile", icon: UserCircle, label: "My VIP Profile" },
              { href: "/vip/packages", icon: PackageLucideIcon, label: "My Packages" },
              { href: "https://www.len.golf", icon: ExternalLink, label: "LENGOLF Main Site", external: true },
            ].map((item) => {
              const Icon = item.icon;
              // Use subtle border for quick access buttons, consistent padding
              const buttonClasses = "w-full h-auto py-3 px-3 flex items-center justify-start border-gray-300 hover:bg-gray-50 text-gray-700 hover:text-primary";
              const buttonContent = (
                <>
                  <Icon className="mr-3 h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </>
              );
              if (item.external) {
                return (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" key={item.label} className="block">
                    <Button variant="outline" className={buttonClasses}>
                      {buttonContent}
                    </Button>
                  </a>
                );
              }
              return (
                <Link href={item.href} key={item.label} className="block">
                  <Button variant="outline" className={buttonClasses}>
                    {buttonContent}
                  </Button>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardView; 