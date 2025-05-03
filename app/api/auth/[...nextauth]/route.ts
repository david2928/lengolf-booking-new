import NextAuth from 'next-auth';
import { authOptions } from '../options';

// console.log("Loading NextAuth handler...");
// console.log("NEXTAUTH_SECRET available?", !!process.env.NEXTAUTH_SECRET);

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };