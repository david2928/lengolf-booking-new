ALTER TABLE public.prize_inventory
ADD COLUMN image_url TEXT;

COMMENT ON COLUMN public.prize_inventory.image_url IS 'URL to the image of the prize';
