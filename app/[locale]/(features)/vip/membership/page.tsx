import React from 'react';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Assuming Button component is available
import Link from 'next/link'; // For optional button

const MembershipComingSoonPage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[calc(100vh-300px)] text-center p-6 bg-background">
      <Construction size={64} className="text-primary mb-6" />
      <h1 className="text-3xl font-bold text-foreground mb-3">
        Membership Features Coming Soon!
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        We&apos;re working hard to bring you exciting new membership benefits and features. Please check back later!
      </p>
      {/* Optional: Add a button to go back to VIP home or another relevant page */}
      <Button asChild variant="outline">
        <Link href="/vip">Back to VIP Dashboard</Link>
      </Button>
    </div>
  );
};

export default MembershipComingSoonPage; 