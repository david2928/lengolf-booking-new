# LENGOLF Marketing Guide

## Google Ads Keyword Campaigns

### Primary Campaign Structure

#### 1. **Golf Simulator Campaign**
**Campaign Type:** Search Network
**Budget:** ฿500-800/day
**Target Location:** Bangkok, Pathum Wan, Ploenchit, Phrom Phong (5km radius)

**Ad Groups:**
- **Golf Simulator Bangkok**
  - Keywords: `golf simulator bangkok`, `indoor golf bangkok`, `golf simulator near me`
  - Match Types: Exact, Phrase, Broad Match Modified
  - Bid Strategy: Target CPA ฿150-250

- **Golf Practice Bangkok**
  - Keywords: `golf practice bangkok`, `golf driving range indoor`, `golf training bangkok`
  - Match Types: Exact, Phrase
  - Bid Strategy: Target CPA ฿200-300

#### 2. **Premium Club Rental Campaign**
**Campaign Type:** Search Network
**Budget:** ฿300-500/day
**Target Location:** Bangkok Metro Area

**Ad Groups:**
- **Golf Club Rental**
  - Keywords: `golf club rental bangkok`, `rent golf clubs bangkok`, `golf equipment rental`
  - Match Types: Exact, Phrase
  - Bid Strategy: Manual CPC ฿15-25

- **Tourist Golf Equipment**
  - Keywords: `golf clubs for tourists bangkok`, `golf rental for visitors`, `travel golf equipment`
  - Match Types: Phrase, Broad Match Modified
  - Bid Strategy: Manual CPC ฿20-35

#### 3. **Corporate & Events Campaign**
**Campaign Type:** Search Network
**Budget:** ฿400-600/day
**Target Location:** Bangkok Business Districts

**Ad Groups:**
- **Corporate Golf Events**
  - Keywords: `corporate golf events bangkok`, `team building golf`, `company golf activity`
  - Match Types: Exact, Phrase
  - Bid Strategy: Target CPA ฿300-500

- **Group Bookings**
  - Keywords: `golf group booking bangkok`, `golf party bangkok`, `birthday golf celebration`
  - Match Types: Phrase, Broad Match Modified
  - Bid Strategy: Target CPA ฿250-400

### Negative Keywords (Add to all campaigns)
```
- cheap golf
- free golf
- outdoor golf course
- golf course membership
- golf course design
- golf lessons online
- mini golf
- crazy golf
- golf cart
- golf bags only
- used golf equipment
```

### Ad Copy Templates

#### Golf Simulator Ads
```
Headline 1: Premium Golf Simulators Bangkok
Headline 2: Book Your Bay at LENGOLF Today
Headline 3: BTS Chidlom | Open Daily 10AM-11PM
Description 1: Experience professional Korean golf simulators at Mercury Ville. Premium clubs included, up to 5 players per bay.
Description 2: Book online instantly. Food & drinks available. Perfect for beginners to pros.
```

#### Club Rental Ads
```
Headline 1: Rent Premium Golf Clubs Bangkok
Headline 2: Callaway & Majesty Sets Available
Headline 3: Hourly Rental | Use Anywhere
Description 1: Professional golf club rental from ฿150/hour. Take them to any course or use at LENGOLF simulators.
Description 2: Perfect for tourists. Men's and ladies' sets available. Book online now.
```

### Tracking & Conversion Setup

#### Conversion Actions to Track:
1. **Online Booking Completion** (Primary)
2. **Phone Call from Ads** (Secondary)
3. **Contact Form Submission** (Secondary)
4. **Menu Download** (Micro-conversion)

#### Google Analytics 4 Events:
```javascript
// Booking completion
gtag('event', 'purchase', {
  'transaction_id': booking.id,
  'value': booking.estimated_value,
  'currency': 'THB',
  'items': [{
    'item_id': 'golf_simulator',
    'item_name': 'Golf Simulator Booking',
    'category': 'Booking',
    'quantity': booking.duration,
    'price': booking.hourly_rate
  }]
});

// Lead generation (form submission)
gtag('event', 'generate_lead', {
  'currency': 'THB',
  'value': 200
});
```

---

## SEO Optimization Strategy

### Technical SEO

#### 1. **Site Structure Improvements**
```
lengolf-booking-new/
├── app/
│   ├── page.tsx (Homepage optimization)
│   ├── golf-simulator-bangkok/ (New landing page)
│   ├── corporate-golf-events/ (New landing page)
│   ├── golf-club-rental/ (Already exists ✓)
│   ├── play-and-food/ (Already exists ✓)
│   └── sitemap.xml (Generate dynamic sitemap)
```

#### 2. **Meta Tags Optimization**

**Homepage (`app/page.tsx`):**
```typescript
export const metadata: Metadata = {
  title: 'LENGOLF Bangkok | Premium Indoor Golf Simulators at BTS Chidlom',
  description: 'Experience professional Korean golf simulators in Bangkok. Premium club rental, group bookings, food & drinks. Located at Mercury Ville BTS Chidlom. Book online now.',
  keywords: 'golf simulator bangkok, indoor golf, golf practice bangkok, premium golf clubs rental, corporate golf events, golf training bangkok',
  openGraph: {
    title: 'LENGOLF Bangkok - Premium Indoor Golf Experience',
    description: 'Professional golf simulators, premium club rental, and group events in the heart of Bangkok.',
    images: ['/images/lengolf-facility.jpg'],
    type: 'website',
    locale: 'en_US',
  },
  alternates: {
    canonical: 'https://booking.len.golf'
  }
}
```

#### 3. **New Landing Pages to Create**

**Golf Simulator Bangkok (`app/golf-simulator-bangkok/page.tsx`):**
- Target: "golf simulator bangkok", "indoor golf bangkok"
- Content: Detailed facility info, pricing, technology specs
- CTA: Book simulator session

**Corporate Golf Events (`app/corporate-golf-events/page.tsx`):**
- Target: "corporate golf events bangkok", "team building golf"
- Content: Package deals, group pricing, catering options
- CTA: Contact for group booking

### Content SEO

#### 1. **Keyword-Rich Content Sections**

**Primary Keywords to Target:**
- Golf simulator Bangkok (1,200 monthly searches)
- Indoor golf Bangkok (800 monthly searches)
- Golf club rental Bangkok (300 monthly searches)
- Corporate golf events Bangkok (200 monthly searches)
- Golf training Bangkok (600 monthly searches)

#### 2. **Blog Content Strategy** (Optional - if blog is added)

**Monthly Content Calendar:**
1. "Best Golf Simulators in Bangkok: A Complete Guide"
2. "Golf Club Rental for Tourists: Everything You Need to Know"
3. "Corporate Team Building: Why Golf Simulators Are Perfect"
4. "Beginner's Guide to Golf Simulators"
5. "Premium Golf Equipment: Callaway vs Majesty Comparison"

#### 3. **Local SEO Optimization**

**Google Business Profile Optimization:**
- Complete all business information
- Add high-quality photos (facility, equipment, food)
- Encourage customer reviews
- Post regular updates about promotions
- Add golf simulator-specific attributes

**Local Citations:**
- TripAdvisor (Golf category)
- Bangkok.com entertainment listings
- Foursquare/Swarm
- Thailand entertainment directories
- BTS Chidlom area business directories

### Schema Markup Implementation

#### 1. **LocalBusiness Schema** (Add to layout.tsx)
```json
{
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  "name": "LENGOLF Bangkok",
  "description": "Premier indoor golf simulator facility with professional Korean simulators, premium club rental, and dining options.",
  "url": "https://booking.len.golf",
  "telephone": "+66966682335",
  "priceRange": "฿฿",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "The Mercury Ville @ BTS Chidlom, Floor 4",
    "addressLocality": "Bangkok",
    "addressRegion": "Bangkok",
    "postalCode": "10330",
    "addressCountry": "TH"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "13.7441",
    "longitude": "100.5456"
  },
  "openingHours": "Mo-Su 10:00-23:00",
  "paymentAccepted": "Credit Card, Cash",
  "amenityFeature": [
    {
      "@type": "LocationFeatureSpecification",
      "name": "Golf Simulators",
      "value": "Professional Korean Golf Simulators"
    },
    {
      "@type": "LocationFeatureSpecification", 
      "name": "Equipment Rental",
      "value": "Premium Golf Club Rental"
    }
  ]
}
```

#### 2. **Product Schema for Golf Club Rental**
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Premium Golf Club Rental",
  "description": "Professional Callaway and Majesty golf club sets available for rental",
  "offers": {
    "@type": "Offer",
    "price": "150",
    "priceCurrency": "THB",
    "availability": "https://schema.org/InStock",
    "validFrom": "2024-01-01"
  },
  "brand": [
    {
      "@type": "Brand",
      "name": "Callaway"
    },
    {
      "@type": "Brand", 
      "name": "Majesty"
    }
  ]
}
```

### Performance Optimization

#### 1. **Core Web Vitals Improvements**
- Optimize images (use Next.js Image component everywhere)
- Implement lazy loading for below-fold content
- Minimize JavaScript bundle size
- Use proper caching headers

#### 2. **Mobile-First Optimization**
- Ensure all pages load within 3 seconds on 3G
- Optimize touch targets (minimum 44px)
- Implement proper viewport meta tags
- Test on various device sizes

### Monitoring & Analytics

#### 1. **SEO Tracking Setup**
```javascript
// Google Tag Manager - SEO Events
// Track scroll depth
gtag('event', 'scroll', {
  'event_category': 'engagement',
  'event_label': 'page_scroll_75'
});

// Track booking funnel
gtag('event', 'begin_checkout', {
  'event_category': 'booking',
  'event_label': 'date_selected'
});
```

#### 2. **Monthly SEO Reporting**
- Organic traffic growth
- Keyword ranking improvements
- Page speed metrics
- Mobile usability scores
- Local search visibility

### Implementation Timeline

**Week 1-2:**
- Set up Google Ads campaigns
- Implement conversion tracking
- Optimize existing page meta tags

**Week 3-4:**
- Create new landing pages
- Implement schema markup
- Set up Google Business Profile

**Week 5-6:**
- Content optimization
- Internal linking strategy
- Performance optimizations

**Week 7-8:**
- Local citation building
- Review generation campaign
- Analytics setup and baseline measurement

### Budget Recommendations

**Google Ads:**
- Total Monthly Budget: ฿30,000-45,000
- Golf Simulator Campaign: ฿15,000-20,000
- Club Rental Campaign: ฿8,000-12,000  
- Corporate Events Campaign: ฿7,000-13,000

**SEO Tools & Services:**
- SEMrush/Ahrefs: ฿3,000/month
- Local citation services: ฿5,000 one-time
- Content creation: ฿10,000/month (if outsourced)

### Success Metrics

**Google Ads KPIs:**
- Cost per booking: < ฿250
- Click-through rate: > 3%
- Conversion rate: > 5%
- Quality Score: > 7/10

**SEO KPIs:**
- Organic traffic growth: +25% month-over-month
- Keyword rankings: Top 3 for primary keywords
- Local search visibility: Top 3 in map pack
- Page speed: < 3 seconds load time