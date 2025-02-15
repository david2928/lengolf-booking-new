import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Script from 'next/script';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "LENGOLF Booking System",
  description: "Book your golf bay at LENGOLF - The Mercury Ville @ BTS Chidlom",
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title: "Book Your Bay at LENGOLF - Bangkok's Premier Golf Simulator",
    description: "Experience Bangkok's top-rated indoor golf simulator in the heart of the city! Located at Mercury Ville @ BTS Chidlom, LENGOLF offers state-of-the-art Korean simulators in a fun, relaxed environment. Perfect for all skill levels with great food & drinks. Book your bay now! 🏌️‍♂️✨",
    url: 'https://booking.len.golf',
    siteName: 'LENGOLF Booking',
    images: [
      {
        url: 'https://booking.len.golf/images/lengolf.jpg',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} font-sans`}>
      <head>
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-MKCHVJKW');
          `}
        </Script>
        {/* Prevent GA from modifying URLs */}
        <Script id="ga-disable-url-modification" strategy="afterInteractive">
          {`
            window.gtag('set', 'linker', {
              'domains': ['len.golf'],
              'decorate_forms': false
            });
          `}
        </Script>
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" 
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MKCHVJKW"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
