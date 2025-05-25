'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getVipBookings } from '../../lib/vipService';
import { VipBooking, VipBookingsResponse, VipApiError } from '../../types/vip';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Needs install
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Needs install
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'; // Needs install
import { Loader2, Edit, XCircle, Info, AlertTriangle, CalendarOff, CalendarDays, Clock, MapPin, InfoIcon, Users, PlusCircle } from 'lucide-react';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext';
import Link from 'next/link';
import EmptyState from './EmptyState'; // Import EmptyState
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added Card imports
import BookingCancelModal from './BookingCancelModal';
import BookingModifyModal from './BookingModifyModal';
import { utcToZonedTime, format } from 'date-fns-tz'; // Import from date-fns-tz

interface BookingsListProps {
  onModifyBooking: (bookingId: string) => void; 
  onCancelBooking: (bookingId: string) => void;  
  refreshNonce?: number;
}

type FilterType = "future" | "past" | "all";

const BookingsList: React.FC<BookingsListProps> = ({ onModifyBooking, onCancelBooking, refreshNonce }) => {
  const { vipStatus, isLoadingVipStatus, refetchVipStatus } = useVipContext();
  const [bookings, setBookings] = useState<VipBooking[]>([]);
  const [paginationData, setPaginationData] = useState<VipBookingsResponse['pagination'] | null>(null);
  const [currentFilter, setCurrentFilter] = useState<FilterType>('future');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsPerPage = 5; 

  const fetchUserBookings = useCallback(async (page: number, filter: FilterType) => {
    if (!vipStatus || vipStatus.status !== 'linked_matched') {
        setBookings([]);
        setPaginationData(null);
        setIsLoading(false); 
        return; 
    }
    setIsLoading(true);
    setError(null);
    try {
      const data: VipBookingsResponse = await getVipBookings({
        page,
        limit: itemsPerPage,
        filter,
      });
      // Bookings are already sorted by the server API (confirmed first for future bookings)
      setBookings(data.bookings);
      setPaginationData(data.pagination);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
      let errorMessage = 'Could not load bookings.';
      if (err instanceof VipApiError) {
        errorMessage = err.payload?.message || err.message || errorMessage;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      setBookings([]);
      setPaginationData(null);
    } finally {
      setIsLoading(false);
    }
  }, [vipStatus]);

  useEffect(() => {
    if (vipStatus?.status === 'linked_matched') {
      fetchUserBookings(currentPage, currentFilter);
    } else if (!isLoadingVipStatus && vipStatus) { 
        setBookings([]);
        setPaginationData(null);
        setIsLoading(false);
    }
  }, [vipStatus, currentPage, currentFilter, fetchUserBookings, isLoadingVipStatus, refreshNonce]);

  const handleFilterChange = (newFilter: string) => {
    setCurrentFilter(newFilter as FilterType);
    setCurrentPage(1); 
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && paginationData && newPage <= paginationData.totalPages) {
      setCurrentPage(newPage);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00'); // Ensure correct date parsing
    return date.toLocaleDateString("en-US", {
      weekday: "short", // "Mon"
      month: "short",   // "Aug"
      day: "numeric",   // "26"
    });
  };

  const formatTime = (booking: VipBooking): string => {
    if (!booking.startTime) return 'N/A';

    const serverTimeZone = 'Asia/Bangkok'; // As per bookings/create/route.ts
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateTimeString = `${booking.date}T${booking.startTime}`;

    console.log(`[formatTime] Input: ${dateTimeString}, ServerTZ: ${serverTimeZone}, LocalTZ: ${localTimeZone}`);

    try {
      // Parse the server time string considering its original timezone (Asia/Bangkok)
      // then immediately convert this conceptual UTC instant to the user's local timezone for formatting.
      const zonedDate = utcToZonedTime(dateTimeString, localTimeZone, { timeZone: serverTimeZone });
      console.log(`[formatTime] zonedDate for ${dateTimeString}: ${zonedDate.toISOString()}`);
      
      const startTimeDisplay = format(zonedDate, 'hh:mm a', { timeZone: localTimeZone });
      console.log(`[formatTime] startTimeDisplay for ${dateTimeString}: ${startTimeDisplay}`);

      let endTimeDisplay = '';
      if (booking.duration && typeof booking.duration === 'number' && booking.duration > 0) {
        const endDate = new Date(zonedDate.getTime() + booking.duration * 60 * 60 * 1000);
        // endDate is now conceptually a Date object representing an instant in time.
        // Format this instant in the user's local timezone.
        endTimeDisplay = ` - ${format(endDate, 'hh:mm a', { timeZone: localTimeZone })}`;
      }
      return `${startTimeDisplay}${endTimeDisplay}`;
    } catch (e) {
        console.error("Error formatting time:", e, "Input:", dateTimeString);
        // Fallback for safety, though ideally this shouldn't happen with valid inputs
        const fallbackDate = new Date(dateTimeString);
        return fallbackDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  };

  if (isLoadingVipStatus) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Loading account status...</span></div>;
  }
  
  if (vipStatus && vipStatus.status === 'not_linked') {
    return (
        <EmptyState
            Icon={Info}
            title="Account Linking Required"
            message={<>
                Please link your account to view your bookings and packages.
            </>}
            action={{
                text: "Link Account Now",
                href: "/vip/link-account"
            }}
            className="mt-4"
        />
    );
  }

  // Fallback if vipStatus is somehow null after initial loading checks, 
  // or if not linked_matched (though caught above, this is a safeguard before rendering tabs)
  if (!vipStatus) { 
      return <div className="text-center py-10 text-muted-foreground">Could not determine account status to load bookings.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-start mb-4">
        <Link href="/bookings">
          <Button className="bg-green-700 hover:bg-green-800 text-white">
            <PlusCircle className="mr-2 h-5 w-5" />
            New Booking
          </Button>
        </Link>
      </div>
      <Tabs value={currentFilter} onValueChange={handleFilterChange}>
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex bg-muted p-1 rounded-lg">
          <TabsTrigger value="future" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Future</TabsTrigger>
          <TabsTrigger value="past" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Past</TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Loading bookings...</span></div>}

      {!isLoading && error && (
         <EmptyState
            Icon={AlertTriangle}
            title="Error Loading Bookings"
            message={error}
            action={{ text: "Try Again", onClick: () => fetchUserBookings(currentPage, currentFilter) }}
            className="mt-4"
        />
      )}

      {!isLoading && !error && bookings.length === 0 && (
         <EmptyState 
            Icon={CalendarOff}
            title="No Bookings Found"
            message={`You currently have no ${currentFilter !== 'all' ? currentFilter : ''} bookings recorded.`}
            action={currentFilter !== 'past' ? { text: "Make a New Booking", href: "/bookings" } : undefined}
            className="mt-4"
        />
      )}
      
      {/* Card View for All Screen Sizes */}
      {!isLoading && !error && bookings.length > 0 && (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <Card 
              key={booking.id} 
              className={`shadow-md hover:shadow-lg transition-shadow duration-200 ease-in-out relative overflow-hidden bg-white border border-gray-200 rounded-lg ${booking.status === 'cancelled' ? 'opacity-75 bg-gray-50' : ''}`}
            >
              <CardHeader className="pb-3 pt-4 px-4 bg-gray-50 border-b border-gray-100">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg font-semibold text-gray-800">{formatDate(booking.date)}</CardTitle>
                        <CardDescription className="text-sm text-gray-500">Booking ID: {booking.id}</CardDescription>
                    </div>
                    <span
                        className={`absolute top-2 right-2 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap
                            ${booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                            booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            booking.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'}`}
                    >
                        {booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : 'Unknown'}
                    </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-sm">
                <div className="flex items-center">
                  <Clock size={16} className="mr-2 text-primary flex-shrink-0" />
                  <span className="font-medium text-gray-700">{formatTime(booking)}</span>
                </div>
                <div className="flex items-center">
                  <Users size={16} className="mr-2 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-600">Pax: {booking.numberOfPeople || 'N/A'}</span>
                </div>
                {booking.notes && (
                  <div className="flex items-start text-gray-600">
                      <InfoIcon size={16} className="mr-2 text-gray-500 flex-shrink-0 mt-0.5" />
                      <p className="break-words">Note: {booking.notes}</p>
                  </div>
                )}
              </CardContent>
              {(() => {
                // Logic to determine if Edit/Cancel buttons should be shown
                const isModifiableStatus = booking.status === 'confirmed';
                if (!isModifiableStatus) return null;

                const serverTimeZone = 'Asia/Bangkok'; 
                const nowInBangkok = new Date();
                const todayDateInBangkok = format(utcToZonedTime(nowInBangkok, serverTimeZone), 'yyyy-MM-dd', { timeZone: serverTimeZone });
                const currentTimeInBangkok = format(utcToZonedTime(nowInBangkok, serverTimeZone), 'HH:mm', { timeZone: serverTimeZone });
                
                const bookingDate = booking.date; // Assuming YYYY-MM-DD format
                const bookingStartTime = booking.startTime; // Assuming HH:mm format

                let isFutureBooking = false;
                if (bookingDate > todayDateInBangkok) {
                  isFutureBooking = true;
                } else if (bookingDate === todayDateInBangkok) {
                  if (bookingStartTime && bookingStartTime >= currentTimeInBangkok) {
                    isFutureBooking = true;
                  }
                }

                if (!isFutureBooking) return null;

                return (
                  <CardFooter className="flex gap-2 pt-0 pb-4 px-4">
                    <Button variant="outline" onClick={() => onModifyBooking(booking.id)} className="flex-1 py-1 px-2 h-auto text-xs">
                      <Edit className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => onCancelBooking(booking.id)} 
                      className="flex-1 py-1 px-2 h-auto text-xs text-red-600 border-red-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <XCircle className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  </CardFooter>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      {/* Pagination controls - Moved from the commented out desktop view */}
      {bookings.length > 0 && paginationData && paginationData.totalPages > 1 && (
        <div className="mt-6 flex justify-center"> {/* Added a div for centering and margin */}
            <Pagination>
            <PaginationContent className="flex flex-wrap justify-center gap-1">
                <PaginationItem>
                <PaginationPrevious 
                    onClick={() => handlePageChange(currentPage - 1)} 
                    aria-disabled={currentPage === 1}
                    className={currentPage === 1 ? "pointer-events-none opacity-60" : "cursor-pointer"}
                />
                </PaginationItem>
                
                {/* Desktop/Tablet View - Show standard pagination with multiple page numbers */}
                <div className="hidden sm:flex sm:items-center">
                  {generatePageNumbers(currentPage, paginationData.totalPages).map((pageNumber, i) => (
                      pageNumber === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${i}`}>
                              <PaginationEllipsis />
                          </PaginationItem>
                      ) : (
                          <PaginationItem key={pageNumber}>
                              <PaginationLink 
                                  onClick={() => handlePageChange(pageNumber as number)}
                                  isActive={currentPage === pageNumber}
                                  className="cursor-pointer"
                              >
                              {pageNumber}
                              </PaginationLink>
                          </PaginationItem>
                      )
                  ))}
                </div>
                
                {/* Mobile View - Simplified pagination showing only current page indicator */}
                <div className="flex items-center sm:hidden">
                  <PaginationItem>
                    <span className="text-sm">
                      Page {currentPage} of {paginationData.totalPages}
                    </span>
                  </PaginationItem>
                </div>
                
                <PaginationItem>
                <PaginationNext 
                    onClick={() => handlePageChange(currentPage + 1)} 
                    aria-disabled={currentPage === paginationData.totalPages}
                    className={currentPage === paginationData.totalPages ? "pointer-events-none opacity-60" : "cursor-pointer"}
                />
                </PaginationItem>
            </PaginationContent>
            </Pagination>
        </div>
      )}
    </div>
  );
};

// Helper function to generate page numbers with ellipsis
// (This function should be defined within the component or imported if it's more complex)
const generatePageNumbers = (currentPage: number, totalPages: number): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxItemsWhenEllipsisPresent = 6; // Target total items: 1 ... c-1 c c+1 N (6 items)
    const pagesToAlwaysShowIfPossible = 4; // e.g. 1,2,3,4 for start, or N-3,N-2,N-1,N for end

    if (totalPages <= maxItemsWhenEllipsisPresent) { // If total pages can be shown without needing complex ellipsis logic for 6 items
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
        return pages;
    }

    // Handle cases based on currentPage position
    if (currentPage <= pagesToAlwaysShowIfPossible -1) { // Near the start: e.g. 1, 2, 3, 4, ..., N (currentPage is 1,2,3)
        for (let i = 1; i <= pagesToAlwaysShowIfPossible; i++) {
            pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
    } else if (currentPage >= totalPages - (pagesToAlwaysShowIfPossible - 2)) { // Near the end: e.g. 1, ..., N-3, N-2, N-1, N (currentPage is N, N-1, N-2)
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - (pagesToAlwaysShowIfPossible-1) ; i <= totalPages; i++) {
            pages.push(i);
        }
    } else { // Middle case: 1, ..., C-1, C, C+1, N
        pages.push(1);
        pages.push('ellipsis');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        // No second ellipsis to keep it to 6 items as per example 1 ... 4 5 6 10
        // Ellipsis might be needed if currentPage+1 is far from totalPages, but example omits it.
        // For strict 6 items: 1, el, c-1, c, c+1, N. This is 6 items.
        // If currentPage+1 === totalPages-1, then it becomes 1, el, c-1, c, N-1, N (which is fine)
        if (currentPage + 1 < totalPages -1 ) { // If there's a true gap before last page after c+1
             // This would add a 7th item. The example 1...456...10 implicitly skips this for 6 items.
             // To match the 6-item example: only add last page if it's not c+1
        }
        pages.push(totalPages);
    }
    
    // Deduplication for safety, though the logic above should try to prevent it.
    const finalPages = pages.filter((value, index, self) => {
        // Keep ellipsis only if it's not redundant (i.e., doesn't replace just one number or is not adjacent to another ellipsis)
        if (value === 'ellipsis') {
            const prev = self[index - 1];
            const next = self[index + 1];
            if (typeof prev === 'number' && typeof next === 'number' && next === prev + 2) return false; // Ellipsis between N and N+2 (e.g. 1 ... 3 should be 1 2 3)
            if (prev === 'ellipsis') return false; // double ellipsis
        }
        return true;
    });
    // Ensure first and last are not ellipsis if array is just [ellipsis, N] or [1, ellipsis]
    if (finalPages.length === 2 && finalPages[0] === 'ellipsis' && typeof finalPages[1] === 'number') return [finalPages[1]];
    if (finalPages.length === 2 && typeof finalPages[0] === 'number' && finalPages[1] === 'ellipsis') return [finalPages[0]];
    if (finalPages.length === 1 && finalPages[0] === 'ellipsis') return []; // Should not happen

    return finalPages;
};


export default BookingsList; 