export interface Promotion {
  id: string;
  image: string;
  title: { en: string; th: string };
  description: { en: string; th: string };
  validUntil?: Date;           // For countdown timer (optional - ongoing promos don't have this)
  ctaType: 'book' | 'contact' | 'link';
  ctaUrl?: string;
  badge?: { en: string; th: string };  // "NEW", "LIMITED TIME", "POPULAR", etc.
  terms?: { en: string; th: string };
}

interface PromotionRow {
  id: string;
  title_en: string;
  title_th: string;
  description_en: string;
  description_th: string;
  image_url: string | null;
  valid_until: string | null;
  cta_type: 'book' | 'contact' | 'link';
  cta_url: string | null;
  badge_en: string | null;
  badge_th: string | null;
  terms_en: string | null;
  terms_th: string | null;
}

function mapRowToPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    image: row.image_url || '/images/promotion.jpg',
    title: { en: row.title_en, th: row.title_th },
    description: { en: row.description_en, th: row.description_th },
    validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
    ctaType: row.cta_type,
    ctaUrl: row.cta_url || undefined,
    badge: row.badge_en ? { en: row.badge_en, th: row.badge_th || row.badge_en } : undefined,
    terms: row.terms_en ? { en: row.terms_en, th: row.terms_th || row.terms_en } : undefined,
  };
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const res = await fetch('/api/liff/promotions');
  if (!res.ok) {
    console.error('Failed to fetch promotions:', res.status);
    return [];
  }
  const { promotions } = await res.json();
  return (promotions || []).map(mapRowToPromotion);
}
