import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user agent
  const userAgent = req.headers['user-agent'] || '';
  
  // Check if it's a Google AdsBot
  const isGoogleAdsBot = 
    /googlebot/i.test(userAgent) ||
    /google-adsbot/i.test(userAgent) ||
    /adsbot-google/i.test(userAgent) ||
    /mediapartners-google/i.test(userAgent);
  
  // Log the access
  console.log(`[${new Date().toISOString()}] AdsBot Test Access:`, {
    userAgent,
    isGoogleAdsBot,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    path: req.url
  });
  
  // Return a simple response
  res.status(200).json({
    success: true,
    message: 'Access logged',
    isGoogleAdsBot,
    userAgent
  });
} 