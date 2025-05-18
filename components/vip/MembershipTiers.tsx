import React from 'react';
import { Flag, Trophy, Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// TODO: Fetch actual VIP tier data and user's current tier from API in later tasks.
const mockVipTiers = [
  {
    name: "Bogey",
    icon: <Flag className="h-10 w-10 text-green-600" />,
    description: "Entry level membership with basic benefits",
    features: [
      "Access to booking portal",
      "Access to package management",
      "Access to profile management"
    ],
    color: "bg-green-600",
    isCurrentUserTier: false // This should be determined dynamically
  },
  {
    name: "Eagle",
    icon: <Trophy className="h-10 w-10 text-blue-500" />,
    description: "Mid-tier membership with enhanced perks",
    features: [
      "Access to Special Events",
      "5% Drinks Discount",
      "5% Bay Rate Discount"
    ],
    color: "bg-blue-500",
    isCurrentUserTier: false // This should be determined dynamically
  },
  {
    name: "Masters",
    icon: <Award className="h-10 w-10 text-amber-400" />,
    description: "Premium membership with exclusive benefits",
    features: [
      "10% Drinks Discount",
      "10% Bay Rate Discount",
      "Free 30 minute lesson"
    ],
    color: "bg-amber-400",
    isCurrentUserTier: true // Example: User is in Masters tier
  },
];

interface MembershipTiersProps {
  // Props to pass actual tier data and user's current tier can be added later
  // For now, it uses mock data.
}

const MembershipTiers: React.FC<MembershipTiersProps> = () => {
  const vipTiers = mockVipTiers; // Using mock data for now

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2 text-foreground">
        <Award className="h-5 w-5 text-primary" />
        Membership Tiers
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {vipTiers.map((tier) => (
          <Card 
            key={tier.name} 
            className={`border-2 ${tier.isCurrentUserTier ? 'border-primary shadow-lg' : 'border-border'}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">{tier.name} Tier</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
              </div>
              {tier.icon}
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <span className={`mr-2.5 mt-1.5 h-1.5 w-1.5 rounded-full ${tier.color} flex-shrink-0`}></span>
                    {feature}
                  </li>
                ))}
              </ul>
              
              {tier.isCurrentUserTier && (
                <div className="w-full text-center mt-6">
                  <span className="text-xs text-primary font-semibold uppercase bg-primary/10 px-3 py-1.5 rounded-full">
                    Your Current Tier
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MembershipTiers; 