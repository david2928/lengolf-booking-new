import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Link as LinkIcon } from 'lucide-react';

interface LinkAccountPromptProps {
  username: string;
  // As per docs, this prompt should link to /app/(features)/vip/link-account/page.tsx
  // The Link component in Next.js uses 'href' not 'to'.
  linkAccountUrl?: string; // Optional, defaults to /vip/link-account
}

const LinkAccountPrompt = ({ username, linkAccountUrl = '/vip/link-account' }: LinkAccountPromptProps) => {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Welcome, {username}!</h1>
      </div>
      
      <div className="bg-card text-card-foreground rounded-xl shadow-lg p-6 md:p-8 mb-8 border">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <LinkIcon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-4">Complete Your VIP Access</h2>
          
          <div className="max-w-md">
            <p className="text-muted-foreground mb-6">
              Link your account to your Lengolf profile to unlock all VIP benefits, including:
            </p>
            
            <ul className="text-muted-foreground text-sm space-y-2 mb-6 text-left">
              <li className="flex items-start">
                <span className="text-primary mr-2 font-bold">✓</span> Manage your bookings online
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2 font-bold">✓</span> View your package usage and credits
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2 font-bold">✓</span> Access exclusive VIP offers and promotions
              </li>
            </ul>
          </div>
          
          <Link href={linkAccountUrl}>
            <Button variant="default" className="font-medium mt-2 px-6 py-3">
              Link My Account Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LinkAccountPrompt; 