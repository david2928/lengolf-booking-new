'use client'

import { supabase } from '../lib/supabase'

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: false,
        },
      })

      if (error) {
        console.error('Error:', error.message)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  return (
    <button
      onClick={handleLogin}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
    >
      Sign in with Google
    </button>
  )
} 