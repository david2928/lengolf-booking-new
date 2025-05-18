'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getVipBookings } from '../../lib/vipService';
import { VipBooking, VipBookingsResponse, VipApiError } from '../../types/vip';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Needs install
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Needs install
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'; // Needs install
import { Loader2, Edit, XCircle, Info, AlertTriangle, CalendarOff, CalendarDays, Clock, MapPin, InfoIcon } from 'lucide-react';
import { useVipContext } from '../../app/(features)/vip/contexts/VipContext';
import Link from 'next/link';
import EmptyState from './EmptyState'; // Import EmptyState
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added Card imports

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

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-CA'); // YYYY-MM-DD for consistency
  };

  if (isLoadingVipStatus) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Loading account status...</span></div>;
  }
  
  if (vipStatus && vipStatus.status !== 'linked_matched') {
    return (
        <EmptyState
            Icon={Info}
            title="Account Linking Required"
            message={<>
                Please link your CRM account to view your bookings and packages. <br />
                Your current status is: <strong>{vipStatus.status}</strong>.
            </>}
            action={{
                text: "Link Account Now",
                href: "/vip/link-account"
            }}
            className="mt-4"
        />
    );
  }

  if (isLoading && bookings.length === 0) { 
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2 text-muted-foreground">Loading bookings...</span></div>;
  }

  if (error) {
    return (
      <EmptyState
        Icon={AlertTriangle}
        title="Error Loading Bookings"
        message={error}
        action={{ text: "Try Again", onClick: () => fetchUserBookings(currentPage, currentFilter) }}
        className="mt-4"
      />
    );
  }
  
  if (bookings.length === 0 && !isLoading && vipStatus?.status === 'linked_matched') {
    return (
        <EmptyState 
            Icon={CalendarOff}
            title="No Bookings Found"
            message={`You currently have no ${currentFilter !== 'all' ? currentFilter : ''} bookings recorded.`}
            action={currentFilter !== 'past' ? { text: "Make a New Booking", href: "/bookings" } : undefined}
            className="mt-4"
        />
    );
  }

  if (bookings.length === 0 && !isLoading && !vipStatus) {
      // Fallback if vipStatus is somehow null after initial loading checks
      return <div className="text-center py-10 text-muted-foreground">Could not determine account status to load bookings.</div>;
  }


  return (
    <div className="space-y-6">
      <Tabs value={currentFilter} onValueChange={handleFilterChange}>
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex bg-muted p-1 rounded-lg">
          <TabsTrigger value="future" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Future</TabsTrigger>
          <TabsTrigger value="past" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Past</TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && bookings.length > 0 && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      
      {/* Mobile Card View */}
      {bookings.length > 0 && (
        <div className="space-y-4 sm:hidden">
          {bookings.map((booking) => (
            <Card key={booking.id} className="shadow-lg border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800">
                  {formatDate(booking.date)}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Time: {booking.startTime}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <div className="flex items-center text-sm">
                  <MapPin className="mr-2 h-4 w-4 text-gray-500" /> Bay: {booking.bay || 'N/A'}
                </div>
                <div className="flex items-center text-sm">
                  <InfoIcon className="mr-2 h-4 w-4 text-gray-500" /> Status: {' '}
                  <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full 
                      ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                        booking.status === 'completed' ? 'bg-blue-100 text-blue-700' : 
                        booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 
                        'bg-gray-100 text-gray-700'}`}>
                    {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                  </span>
                </div>
              </CardContent>
              {booking.status === 'confirmed' && new Date(booking.date + 'T00:00:00') >= new Date(new Date().toDateString()) && (
                <CardFooter className="flex gap-2 pt-0 pb-4 px-4">
                  <Button variant="outline" onClick={() => onModifyBooking(booking.id)} className="flex-1 py-1 px-2 h-auto text-xs">
                    <Edit className="mr-1 h-3 w-3" /> Modify
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => onCancelBooking(booking.id)} 
                    className="flex-1 py-1 px-2 h-auto text-xs text-red-600 border-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <XCircle className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                </CardFooter>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Desktop Table View */}
      {bookings.length > 0 && (
        <>
            <div className="hidden sm:block border rounded-lg overflow-x-auto bg-card shadow-sm">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="whitespace-nowrap">Time</TableHead>
                    <TableHead>Bay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                        <TableCell className="font-medium whitespace-nowrap">{formatDate(booking.date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{booking.startTime}</TableCell>
                        <TableCell>{booking.bay || 'N/A'}</TableCell>
                        <TableCell>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full 
                                ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                                  booking.status === 'completed' ? 'bg-blue-100 text-blue-700' : 
                                  booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 
                                  'bg-gray-100 text-gray-700'}
                            `}>
                                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                            </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                        {booking.status === 'confirmed' && new Date(booking.date + 'T00:00:00') >= new Date(new Date().toDateString()) && (
                            <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => onModifyBooking(booking.id)} className="py-1 px-3 h-auto text-xs sm:text-sm">
                                <Edit className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" /> Modify
                            </Button>
                            <Button 
                                variant="outline"
                                onClick={() => onCancelBooking(booking.id)} 
                                className="py-1 px-3 h-auto text-xs sm:text-sm text-red-600 border-red-500 hover:bg-red-50 hover:text-red-700"
                            >
                                <XCircle className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" /> Cancel
                            </Button>
                            </div>
                        )}
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>

            {paginationData && paginationData.totalPages > 1 && (
                <Pagination>
                <PaginationContent>
                    <PaginationItem>
                    <PaginationPrevious 
                        onClick={() => handlePageChange(currentPage - 1)} 
                        aria-disabled={currentPage === 1}
                        className={currentPage === 1 ? "pointer-events-none opacity-60" : "cursor-pointer"}
                    />
                    </PaginationItem>
                    {[...Array(paginationData.totalPages)].map((_, i) => (
                    <PaginationItem key={i}>
                        <PaginationLink 
                            onClick={() => handlePageChange(i + 1)}
                            isActive={currentPage === i + 1}
                            className="cursor-pointer"
                        >
                        {i + 1}
                        </PaginationLink>
                    </PaginationItem>
                    ))}
                    <PaginationItem>
                    <PaginationNext 
                        onClick={() => handlePageChange(currentPage + 1)} 
                        aria-disabled={currentPage === paginationData.totalPages}
                        className={currentPage === paginationData.totalPages ? "pointer-events-none opacity-60" : "cursor-pointer"}
                    />
                    </PaginationItem>
                </PaginationContent>
                </Pagination>
            )}
        </>
      )}
    </div>
  );
};

export default BookingsList; 