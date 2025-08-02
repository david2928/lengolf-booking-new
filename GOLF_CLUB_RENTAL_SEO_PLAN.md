# Golf Club Rental Feature - SEO-Optimized Planning Document

## Overview
Create a new SEO-optimized landing page for golf club rental services at LENGOLF, targeting keywords related to golf club rental in Bangkok and Thailand.

## SEO Strategy

### Target Keywords
**Primary Keywords:**
- "golf club rental Bangkok"
- "rent golf clubs Bangkok"
- "premium golf club rental Thailand"
- "Callaway golf club rental"

**Secondary Keywords:**
- "golf equipment rental Bangkok"
- "golf club hire Bangkok"
- "rent golf clubs Thailand"
- "golf simulator club rental"
- "indoor golf club rental"
- "ladies golf club rental Bangkok"
- "men's golf club rental Bangkok"

**Long-tail Keywords:**
- "rent Callaway golf clubs Bangkok"
- "premium golf club rental near me"
- "hourly golf club rental Bangkok"
- "full day golf club rental Thailand"
- "2024 golf clubs for rent Bangkok"

### URL Structure
- **Route**: `/golf-club-rental` (SEO-friendly URL)
- **Full URL**: `https://lengolf.com/golf-club-rental`

## Feature Requirements

### 1. Landing Page Structure
- **Route**: `/golf-club-rental`
- **Layout**: Similar to `/play-and-food` with SEO-optimized content structure
- **Mobile Responsive**: Full mobile optimization for better Core Web Vitals

### 2. Club Rental Options

#### Premium Golf Clubs (Latest 2024 Models)
**Men's Premium Set**
- 2024 Callaway Warbird full set (Stiff flex)
- Driver, 5-wood, Irons 5-9, PW, SW
- Premium Callaway-branded golf bag included

**Women's Premium Set**
- 2023 Majesty Shuttle (Ladies flex)
- 12.5° Driver, Irons 7-9, PW, 56° Puppy's Paw SW
- Premium ladies golf bag included

#### Standard Golf Clubs
- Quality rental clubs for casual players
- Well-maintained equipment
- Suitable for beginners and intermediate players

### 3. Pricing Structure
**Flexible Rental Options:**
- 1 hour: ฿150
- 2 hours: ฿250
- 4 hours: ฿400
- Full day (24 hours): ฿1,200

## SEO Implementation Details

### Page Structure for SEO
```
/app/golf-club-rental/
  ├── page.tsx          # Main landing page with structured data
  ├── layout.tsx        # SEO metadata and schema markup
  └── opengraph-image.jpg  # OG image for social sharing
```

### Metadata Requirements
```typescript
export const metadata: Metadata = {
  title: 'Golf Club Rental Bangkok | Premium Callaway Clubs | LENGOLF',
  description: 'Rent premium golf clubs in Bangkok. 2024 Callaway Warbird & Majesty Shuttle sets available. Hourly & daily rates from ฿150. Book online at LENGOLF indoor golf simulator.',
  keywords: [
    'golf club rental Bangkok',
    'rent golf clubs Bangkok',
    'premium golf club rental Thailand',
    'Callaway golf club rental',
    'golf equipment rental Bangkok',
    'indoor golf club rental',
    'golf simulator Bangkok',
    'LENGOLF club rental'
  ],
  openGraph: {
    title: 'Premium Golf Club Rental in Bangkok | LENGOLF',
    description: 'Rent 2024 Callaway Warbird & premium golf clubs at LENGOLF Bangkok. Flexible hourly & daily rates. Perfect for tourists & locals. Book online now!',
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'th_TH',
    siteName: 'LENGOLF Bangkok',
    images: [
      {
        url: '/images/premium_club_rental.jpg',
        width: 1200,
        height: 630,
        alt: 'LENGOLF Premium Golf Club Rental - Callaway Warbird & Majesty Shuttle Sets',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Golf Club Rental Bangkok | LENGOLF',
    description: 'Rent premium 2024 golf clubs at LENGOLF. Callaway Warbird & Majesty Shuttle available. Book online!',
    images: ['/images/premium_club_rental.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://lengolf.com/golf-club-rental',
    languages: {
      'en-US': 'https://lengolf.com/golf-club-rental',
      'th-TH': 'https://lengolf.com/th/golf-club-rental',
    },
  },
};
```

### Structured Data (JSON-LD)
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Premium Golf Club Rental",
  "description": "Rent premium 2024 Callaway Warbird and Majesty Shuttle golf clubs at LENGOLF Bangkok",
  "brand": {
    "@type": "Brand",
    "@id": "https://lengolf.com/#organization",
    "name": "LENGOLF"
  },
  "offers": [
    {
      "@type": "Offer",
      "name": "1 Hour Golf Club Rental",
      "price": "150",
      "priceCurrency": "THB",
      "availability": "https://schema.org/InStock"
    },
    {
      "@type": "Offer",
      "name": "Full Day Golf Club Rental",
      "price": "1200",
      "priceCurrency": "THB",
      "availability": "https://schema.org/InStock"
    }
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127"
  }
}
```

### Content Structure for SEO

#### H1 Tag
"Premium Golf Club Rental in Bangkok - LENGOLF"

#### H2 Tags
- "Rent Premium 2024 Golf Clubs"
- "Flexible Rental Options & Pricing"
- "Why Choose LENGOLF Golf Club Rental?"
- "Available Golf Club Sets"
- "Book Your Golf Club Rental Online"

#### H3 Tags
- "Men's Premium Golf Set - Callaway Warbird"
- "Women's Premium Golf Set - Majesty Shuttle"
- "Hourly & Daily Rental Rates"
- "Perfect for Tourists & Locals"

### SEO-Optimized Content Sections

1. **Hero Section**
   - Clear value proposition
   - Primary keywords in heading
   - Call-to-action buttons

2. **Club Details Section**
   - Detailed specifications
   - Brand names for SEO
   - High-quality images with alt text

3. **Pricing Section**
   - Clear pricing table
   - Schema markup for prices
   - Comparison with competitors

4. **Benefits Section**
   - Location advantages
   - Quality assurance
   - Customer testimonials

5. **FAQ Section** (Schema markup)
   - "Can tourists rent golf clubs at LENGOLF?"
   - "What brands of golf clubs are available for rent?"
   - "Do you offer hourly golf club rental?"
   - "Are left-handed golf clubs available?"

### Internal Linking Strategy
- Link from main booking page
- Link from navigation menu
- Link from footer "Services" section
- Cross-link with play-and-food packages

### Image Optimization
- Main hero image: `premium_club_rental.jpg` (already provided)
- Club detail images: `callaway-warbird-set.jpg`, `majesty-shuttle-set.jpg`
- Alt text examples:
  - "Premium Callaway Warbird golf club set for rent at LENGOLF Bangkok"
  - "Ladies Majesty Shuttle golf clubs available for hourly rental"

## Integration with Booking Flow

### URL Parameters
- `/bookings?club=premium-mens` - Pre-select men's premium set
- `/bookings?club=premium-ladies` - Pre-select women's premium set
- `/bookings?club=standard` - Pre-select standard clubs

### Booking Integration
1. Add `ClubRentalSelection` component to `BookingDetails.tsx`
2. Radio button group with three options:
   - Premium Men's Set (Callaway Warbird)
   - Premium Women's Set (Majesty Shuttle)
   - Standard Clubs
   - No Club Rental (default)

### Database Storage
- Store in `customer_notes` field with format:
  - "Golf Club Rental: Premium Men's Set (Callaway Warbird)"
  - "Golf Club Rental: Premium Women's Set (Majesty Shuttle)"
  - "Golf Club Rental: Standard"

## Technical Implementation

### Types Definition
```typescript
// types/golf-club-rental.ts
export interface GolfClubOption {
  id: 'premium-mens' | 'premium-ladies' | 'standard' | 'none';
  name: string;
  description: string;
  brand?: string;
  specifications?: string[];
  pricePerHour: number;
  image?: string;
}

export interface GolfClubPricing {
  duration: number;
  unit: 'hour' | 'hours' | 'day';
  price: number;
}
```

### Component Structure
```typescript
// components/golf-club-rental/ClubRentalCard.tsx
// components/golf-club-rental/PricingTable.tsx
// components/golf-club-rental/ClubSelector.tsx
// components/booking/ClubRentalSelection.tsx
```

## Performance Optimization
- Lazy load images below the fold
- Optimize hero image for LCP
- Preload critical fonts
- Minimize JavaScript bundle

## Monitoring & Analytics
- Track page views and conversions
- Monitor organic search traffic
- A/B test different headlines
- Track club rental selection rates

## Future SEO Enhancements
1. Create location-specific pages (e.g., `/golf-club-rental/sukhumvit`)
2. Add video content for better engagement
3. Implement review schema from Google Business
4. Create blog content around golf club selection tips
5. Multi-language support (Thai version)