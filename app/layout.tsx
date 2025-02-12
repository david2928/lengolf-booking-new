import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

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
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" 
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
