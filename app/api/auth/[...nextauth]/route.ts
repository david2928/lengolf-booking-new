import NextAuth from 'next-auth';
import { authOptions } from '../options';

// Add logging here
console.log("Loading NextAuth handler...");
console.log("NEXTAUTH_SECRET available?", !!process.env.NEXTAUTH_SECRET);
// console.log("Auth Options:", JSON.stringify(authOptions, null, 2)); // Can be very verbose

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };