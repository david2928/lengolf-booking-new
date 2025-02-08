import { CalendarIcon, ClockIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { debug } from '@/lib/debug';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/app/types/supabase';

interface BookingDetailsProps {
  selectedDate: Date;
  selectedTime: string;
  maxDuration: number;
  onSubmit: (formData: {
    duration: number;
    phoneNumber: string;
    email: string;
    numberOfPeople: number;
  }) => void;
}

export default function BookingDetails({
  selectedDate,
  selectedTime,
  maxDuration,
  onSubmit
}: BookingDetailsProps) {
  const router = useRouter();
  const [duration, setDuration] = useState<number>(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [errors, setErrors] = useState({
    duration: '',
    phoneNumber: '',
    email: '',
  });

  // Add a ref to track session restoration
  const isRestoringSession = useRef(false);
  const sessionRestoreComplete = useRef<Promise<boolean> | null>(null);
  const sessionRestoreStartTime = useRef<number>(0);

  // Add a ref to track initialization state
  const isInitializing = useRef(false);
  const initStartTime = useRef<number>(0);

  // Initialize Supabase client
  useEffect(() => {
    let mounted = true;
    let initTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;
    initStartTime.current = Date.now();

    // Helper function to check for exact cookie presence
    const hasExactCookie = (name: string) => {
      return document.cookie
        .split(';')
        .some(c => c.trim().startsWith(`${name}=`));
    };

    const initSupabase = async () => {
      if (!mounted) return;
      
      try {
        isInitializing.current = true;
        debug.log('BookingDetails: Starting initialization process', {
          timestamp: initStartTime.current,
          sequence: 'init_start',
          isRestoring: isRestoringSession.current,
          hasRestorePromise: !!sessionRestoreComplete.current,
          isInitializing: isInitializing.current
        });
        
        // Debug cookie state before client creation
        debug.log('BookingDetails: Pre-client cookies state:', {
          timestamp: Date.now(),
          timeSinceStart: Date.now() - initStartTime.current,
          hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
          hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier'),
          cookieCount: document.cookie.split(';').length,
          cookies: document.cookie.split(';').map(c => ({
            name: c.trim().split('=')[0],
            length: c.split('=')[1]?.length || 0,
            isAuthToken: c.trim().startsWith('sb-bisimqmtxjsptehhqpeg-auth-token='),
            isCodeVerifier: c.trim().startsWith('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier=')
          }))
        });

      const client = await createClient();
        
        if (!mounted) return;
        
        debug.log('BookingDetails: Supabase client created', {
          timestamp: Date.now(),
          timeSinceStart: Date.now() - initStartTime.current,
          sequence: 'client_created'
        });
      setSupabase(client);

        // Check session with retry logic
        const checkSession = async () => {
          if (!mounted) return;

          const checkStartTime = Date.now();
          debug.log('BookingDetails: Starting session check', {
            timestamp: checkStartTime,
            timeSinceInit: checkStartTime - initStartTime.current,
            sequence: 'check_start',
            retryCount,
            isRestoring: isRestoringSession.current,
            isInitializing: isInitializing.current,
            hasRestorePromise: !!sessionRestoreComplete.current
          });

          try {
            const { data: { session }, error } = await client.auth.getSession();
            
            const cookieState = {
              hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
              hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier'),
              cookieCount: document.cookie.split(';').length,
              cookies: document.cookie.split(';').map(c => ({
                name: c.trim().split('=')[0],
                isAuthToken: c.trim().startsWith('sb-bisimqmtxjsptehhqpeg-auth-token='),
                isCodeVerifier: c.trim().startsWith('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier=')
              }))
            };

            // Check localStorage for any previous session data
            const localStorageSession = localStorage.getItem('sb-bisimqmtxjsptehhqpeg-auth-token');
            debug.log('BookingDetails: Local storage session check', {
              timestamp: Date.now(),
              timeSinceCheck: Date.now() - checkStartTime,
              timeSinceInit: Date.now() - initStartTime.current,
              sequence: 'storage_check',
              hasLocalSession: !!localStorageSession,
              localSessionLength: localStorageSession?.length,
              isJSON: localStorageSession?.startsWith('{'),
              cookieState
            });

            // If we have a local storage session but no active session, try to restore
            if (!session && localStorageSession && retryCount === 0) {
              sessionRestoreStartTime.current = Date.now();
              isRestoringSession.current = true;
              debug.log('BookingDetails: Initiating session restoration', {
                timestamp: sessionRestoreStartTime.current,
                timeSinceInit: sessionRestoreStartTime.current - initStartTime.current,
                sequence: 'restore_init',
                isInitializing: isInitializing.current
              });

              sessionRestoreComplete.current = (async () => {
                try {
                  debug.log('BookingDetails: Starting session restore process', {
                    timestamp: Date.now(),
                    timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                    sequence: 'restore_start'
                  });

                  const parsedSession = JSON.parse(localStorageSession);
                  debug.log('BookingDetails: Session parsed from localStorage', {
                    timestamp: Date.now(),
                    timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                    sequence: 'parse_complete',
                    hasAccessToken: !!parsedSession?.access_token,
                    hasRefreshToken: !!parsedSession?.refresh_token,
                    expiresAt: parsedSession?.expires_at
                  });

                  const { data: setData, error: setError } = await client.auth.setSession({
                    access_token: parsedSession.access_token,
                    refresh_token: parsedSession.refresh_token
                  });

                  if (setData.session) {
                    debug.log('BookingDetails: Session successfully restored', {
                      timestamp: Date.now(),
                      timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                      sequence: 'restore_success',
                      cookieState: {
                        hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
                        hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
                      }
                    });

                    // Wait longer for cookies to be set and verify they are set
                    let attempts = 0;
                    const maxAttempts = 5;
                    while (attempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                      const hasAuth = hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token');
                      debug.log('BookingDetails: Checking for auth token', {
                        timestamp: Date.now(),
                        timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                        sequence: 'cookie_check',
                        attempt: attempts + 1,
                        hasAuth
                      });
                      if (hasAuth) break;
                      attempts++;
                    }
                    
                    if (mounted) {
                      setIsLoading(false);
                      if (setData.session.user?.email) {
                        setEmail(setData.session.user.email);
                      }
                    }

                    isRestoringSession.current = false;
                    return true;
                  }

                  debug.warn('BookingDetails: Session restore failed', {
                    timestamp: Date.now(),
                    timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                    sequence: 'restore_failed',
                    error: setError
                  });

                  isRestoringSession.current = false;
                  return false;
                } catch (error) {
                  debug.error('BookingDetails: Error during session restore', {
                    timestamp: Date.now(),
                    timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                    sequence: 'restore_error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                  });
                  isRestoringSession.current = false;
                  return false;
                }
              })();

              const success = await sessionRestoreComplete.current;
              debug.log('BookingDetails: Session restore attempt complete', {
                timestamp: Date.now(),
                timeSinceRestoreStart: Date.now() - sessionRestoreStartTime.current,
                timeSinceInit: Date.now() - initStartTime.current,
                sequence: 'restore_complete',
                success,
                isInitializing: isInitializing.current
              });

              if (success) {
                isInitializing.current = false;
                return true;
              }
            }

            // Only proceed with normal session checks if not restoring
            if (!isRestoringSession.current) {
              if (session) {
                if (mounted) {
                  setIsLoading(false);
                  if (session.user?.email) {
                    setEmail(session.user.email);
                  }
                  const userPhone = session.user?.phone || session.user?.user_metadata?.phone;
                  if (userPhone) {
                    setPhoneNumber(userPhone);
                  }
                }
                return true;
              }

              // If no session but we have code verifier, try to re-authenticate
              if (!session && cookieState.hasCodeVerifier && retryCount === 0) {
                debug.log('BookingDetails: No session but have code verifier, attempting to recover', {
                  cookieState,
                  retryCount,
                  currentUrl: window.location.href
                });
                
                try {
                  // Try to exchange the code verifier for a session
                  const verifierCookie = document.cookie
                    .split(';')
                    .find(c => c.trim().startsWith('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier='));
                  
                  if (verifierCookie) {
                    const verifierValue = verifierCookie.split('=')[1];
                    debug.log('BookingDetails: Found code verifier', {
                      length: verifierValue.length,
                      isBase64: verifierValue.startsWith('base64-')
                    });

                    // Only clear code verifier if we can't recover
                    const { data: exchangeData, error: exchangeError } = await client.auth.exchangeCodeForSession(verifierValue);
                    
                    if (exchangeData.session) {
                      debug.log('BookingDetails: Successfully recovered session from code verifier', {
                        user: {
                          email: exchangeData.session.user.email,
                          id: exchangeData.session.user.id
                        }
                      });
                      return true;
                    }

                    debug.warn('BookingDetails: Failed to exchange code verifier', { 
                      exchangeError,
                      cookieState
                    });
                  }
                } catch (exchangeError) {
                  debug.error('BookingDetails: Error exchanging code verifier', {
                    error: exchangeError instanceof Error ? exchangeError.message : 'Unknown error',
                    cookieState
                  });
                }
                
                // If we get here, we couldn't recover the session
                debug.log('BookingDetails: Session recovery failed, redirecting to login');
                const currentPath = window.location.pathname + window.location.search;
                localStorage.setItem('redirectAfterLogin', currentPath);
                
                // Only clear code verifier after failed recovery attempt
                document.cookie = 'sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                
                router.push('/auth/login?error=session_expired&returnTo=' + encodeURIComponent(currentPath));
                return false;
              }

              if (retryCount < MAX_RETRIES) {
                retryCount++;
                debug.log('BookingDetails: Retrying session check', {
                  retryCount,
                  maxRetries: MAX_RETRIES,
                  delay: RETRY_DELAY,
                  cookieState
                });
                initTimeout = setTimeout(checkSession, RETRY_DELAY);
                return false;
              }

              if (mounted) {
                debug.warn('BookingDetails: No valid session after retries', { cookieState });
                router.push('/auth/login');
              }
            }
            isInitializing.current = false;
            return false;
          } catch (error) {
            debug.error('BookingDetails: Session check error', {
              timestamp: Date.now(),
              timeSinceCheck: Date.now() - checkStartTime,
              sequence: 'check_error',
              error,
              isInitializing: isInitializing.current
            });
            isInitializing.current = false;
            return false;
          }
        };

        await checkSession();
        isInitializing.current = false;

      } catch (error) {
        debug.error('BookingDetails: Initialization error', {
          timestamp: Date.now(),
          timeSinceStart: Date.now() - initStartTime.current,
          sequence: 'init_error',
          error,
          isInitializing: isInitializing.current,
          cookieState: {
            hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
            hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
          }
        });
        isInitializing.current = false;
        if (mounted) {
          router.push('/auth/login');
        }
      }
    };

    initSupabase();

    return () => {
      mounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      isInitializing.current = false;
      debug.log('BookingDetails: Cleanup complete', {
        timestamp: Date.now(),
        timeSinceStart: Date.now() - initStartTime.current,
        sequence: 'cleanup',
        isInitializing: isInitializing.current,
        finalCookieState: {
          hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
          hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
        }
      });
    };
  }, [router]);

  // Modify the auth state change handler
  useEffect(() => {
    if (!supabase) return;

    // Helper function to check for exact cookie presence
    const hasExactCookie = (name: string) => {
      return document.cookie
        .split(';')
        .some(c => c.trim().startsWith(`${name}=`));
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const timestamp = Date.now();
      debug.log('BookingDetails: Auth state changed', {
        timestamp,
        sequence: 'auth_state_change',
        event,
        hasSession: !!session,
        isRestoring: isRestoringSession.current,
        user: session?.user ? {
            email: session.user.email,
            id: session.user.id,
            provider: session.user.app_metadata?.provider
        } : null,
        cookieState: {
          hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
          hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
        }
      });

      // If we're restoring a session, wait for it to complete
      if (isRestoringSession.current && sessionRestoreComplete.current) {
        debug.log('BookingDetails: Waiting for session restore to complete before handling auth change');
        const restored = await sessionRestoreComplete.current;
        debug.log('BookingDetails: Session restore completed', { restored });
        
        if (restored) {
          debug.log('BookingDetails: Session successfully restored, skipping auth change handler');
          return;
        }
      }

      // Handle session expiry and other auth state changes
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || (!session && !isRestoringSession.current)) {
        const currentPath = window.location.pathname + window.location.search;
        debug.warn('BookingDetails: Auth state requires reauth', {
          timestamp: Date.now(),
          sequence: 'auth_state_reauth',
          timeSinceChange: Date.now() - timestamp,
          event,
          hasSession: !!session,
          currentPath,
          isRestoring: isRestoringSession.current,
          cookieState: {
            hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
            hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
          }
        });
        
        // Don't redirect if we're restoring
        if (!isRestoringSession.current) {
          // Store current path for redirect after login
          localStorage.setItem('redirectAfterLogin', currentPath);
          
          // Clear any existing code verifier
          document.cookie = 'sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          
          router.push('/auth/login?error=session_expired&returnTo=' + encodeURIComponent(currentPath));
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      debug.log('BookingDetails: Auth listener cleanup', {
        cookieState: {
          hasAuthToken: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token'),
          hasCodeVerifier: hasExactCookie('sb-bisimqmtxjsptehhqpeg-auth-token-code-verifier')
        }
      });
    };
  }, [supabase, router]);

  // Check session expiry for guest users
  const checkGuestSession = () => {
    debug.log('BookingDetails: Checking guest session')
    const loginMethod = localStorage.getItem('loginMethod');
    const loginTime = localStorage.getItem('loginTime');
    
    if (loginMethod === 'guest' && loginTime) {
      const sessionDuration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
      const sessionExpiry = parseInt(loginTime) + sessionDuration;
      
      if (Date.now() > sessionExpiry) {
        debug.warn('BookingDetails: Guest session expired')
        localStorage.clear();
        router.push('/auth/login');
        return false;
      }
      return true;
    }
    return true;
  };

  // Fetch user email on component mount
  useEffect(() => {
    let mounted = true;
    debug.log('BookingDetails: Component mounted');

    const initializeSession = async () => {
      if (!mounted || !supabase) return;
      debug.log('BookingDetails: Initializing session...');
      setIsLoading(true);
      try {
        // Wait for any ongoing session restoration
        if (isRestoringSession.current && sessionRestoreComplete.current) {
          debug.log('BookingDetails: Waiting for ongoing session restoration...');
          const restored = await sessionRestoreComplete.current;
          debug.log('BookingDetails: Session restoration completed during initialization', { restored });
          if (restored) {
            // If restoration was successful, skip the rest of initialization
            setIsLoading(false);
            return;
          }
        }

        // Log all cookies for debugging
        debug.log('BookingDetails: Current cookies:', document.cookie);

        const loginMethod = localStorage.getItem('loginMethod');
        debug.log('BookingDetails: Login method:', loginMethod || 'social/email auth');

        if (loginMethod === 'guest') {
          debug.log('BookingDetails: Processing guest user data');
          if (!checkGuestSession()) {
            debug.log('BookingDetails: Guest session check failed');
            return;
          }

          const guestEmail = localStorage.getItem('email');
          const guestPhone = localStorage.getItem('phoneNumber');
          if (guestEmail) {
            setEmail(guestEmail);
            debug.log('BookingDetails: Set guest email:', guestEmail);
          }
          if (guestPhone) {
            setPhoneNumber(guestPhone);
            debug.log('BookingDetails: Set guest phone:', guestPhone);
          }
          setIsLoading(false);
          return;
        }

        // For non-guest users, check Supabase session with detailed logging
        debug.log('BookingDetails: Checking Supabase session for social/email auth...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        debug.log('BookingDetails: Session check result:', {
          hasSession: !!session,
          error: sessionError?.message,
          sessionDetails: session ? {
            ...session,
            access_token: session.access_token?.slice(-10) + '...',
            refresh_token: session.refresh_token?.slice(-10) + '...',
            user: {
              email: session.user.email,
              id: session.user.id,
              provider: session.user.app_metadata?.provider
            }
          } : null
        });
        
        if (sessionError) {
          debug.error('BookingDetails: Session error:', sessionError);
          router.push('/auth/login');
          return;
        }

        if (!session) {
          debug.warn('BookingDetails: No session found');
          router.push('/auth/login');
          return;
        }

        // Now get the user details with detailed logging
        debug.log('BookingDetails: Fetching user details...');
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        debug.log('BookingDetails: User details result:', {
          hasUser: !!user,
          error: userError?.message,
          userDetails: user ? {
            email: user.email,
            id: user.id,
            provider: user.app_metadata?.provider
          } : null
        });
        
        if (userError || !user) {
          debug.error('BookingDetails: User error:', userError);
          router.push('/auth/login');
          return;
        }

        if (!mounted) return;

        if (user.email) {
          setEmail(user.email);
          debug.log('BookingDetails: Set user email:', user.email);
        }
        
        const userPhone = user.phone || user.user_metadata?.phone;
        if (userPhone) {
          setPhoneNumber(userPhone);
          debug.log('BookingDetails: Set user phone:', userPhone);
        }
      } catch (error) {
        debug.error('BookingDetails: Error initializing session:', error);
        router.push('/auth/login');
      } finally {
        if (mounted) {
          debug.log('BookingDetails: Finished initialization');
          setIsLoading(false);
        }
      }
    };

    if (supabase) {
      // Set up auth state change listener with detailed logging
      debug.log('BookingDetails: Setting up auth state listener');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        debug.log('BookingDetails: Auth state changed:', {
          event,
          hasSession: !!session,
          sessionDetails: session ? {
            ...session,
            access_token: session.access_token?.slice(-10) + '...',
            refresh_token: session.refresh_token?.slice(-10) + '...',
            user: {
              email: session.user.email,
              id: session.user.id,
              provider: session.user.app_metadata?.provider
            }
          } : null
        });

        if (event === 'SIGNED_OUT') {
          debug.warn('BookingDetails: User signed out, redirecting');
          router.push('/auth/login');
        } else if (event === 'SIGNED_IN' && mounted) {
          debug.log('BookingDetails: User signed in, reinitializing');
          await initializeSession();
        }
      });

      initializeSession();

      return () => {
        debug.log('BookingDetails: Cleaning up component');
        mounted = false;
        subscription.unsubscribe();
      };
    }
  }, [router, supabase]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-lg text-gray-600">Loading your details...</p>
        </div>
      </div>
    );
  }

  const validatePhoneNumber = (phone: string) => {
    // Remove all non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    // Check if it's a Thai number (starts with 0, 10 digits)
    const thaiRegex = /^0\d{9}$/;
    // Check if it's an international number (minimum 10 digits)
    const internationalRegex = /^\d{10,15}$/;
    
    return thaiRegex.test(cleanPhone) || internationalRegex.test(cleanPhone);
  };

  const validateForm = () => {
    const cleanPhone = phoneNumber.replace(/[- ]/g, '');
    const newErrors = {
      duration: duration === 0 ? 'Please select duration' : '',
      phoneNumber: !phoneNumber 
        ? 'Please enter phone number' 
        : !validatePhoneNumber(cleanPhone)
        ? 'Please enter a valid Thai phone number'
        : '',
      email: !email ? 'Please enter email' : '',
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow digits, spaces, dashes, plus sign, and parentheses
    if (/^[0-9+\- ()]*$/.test(value)) {
      setPhoneNumber(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    if (validateForm()) {
      try {
        const cleanPhoneNumber = phoneNumber.replace(/[- ]/g, '');
        const loginMethod = localStorage.getItem('loginMethod');
        
        debug.log('BookingDetails: Starting form submission', {
          loginMethod,
          email,
          hasPhoneNumber: !!cleanPhoneNumber
        });

        if (loginMethod === 'guest') {
          debug.log('BookingDetails: Processing guest booking');
          // For guest users, save to localStorage
          localStorage.setItem('phoneNumber', cleanPhoneNumber);
          localStorage.setItem('email', email);
          
          // Proceed with booking
          onSubmit({
            duration,
            phoneNumber: cleanPhoneNumber,
            email,
            numberOfPeople
          });
          return;
        }

        // For authenticated users, check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        debug.log('BookingDetails: Session check for submission', {
          hasSession: !!session,
          error: sessionError?.message,
          provider: session?.user?.app_metadata?.provider
        });

        if (sessionError) {
          debug.error('BookingDetails: Session error during submission:', sessionError);
          // Continue with booking even if session error
          onSubmit({
            duration,
            phoneNumber: cleanPhoneNumber,
            email,
            numberOfPeople
          });
          return;
        }

        // If we have a valid session, try to update user metadata
        if (session) {
          debug.log('BookingDetails: Updating user metadata');
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          
          if (!userError && user) {
            const currentPhone = user.phone || user.user_metadata?.phone;
            if (currentPhone !== cleanPhoneNumber) {
              debug.log('BookingDetails: Updating phone number in metadata');
              const { error: updateError } = await supabase.auth.updateUser({
                data: { phone: cleanPhoneNumber }
              });

              if (updateError) {
                debug.error('BookingDetails: Error updating phone number:', updateError);
              } else {
                debug.log('BookingDetails: Successfully updated phone number');
              }
            }
          }
        }

        // Always proceed with the booking
        debug.log('BookingDetails: Proceeding with booking submission');
        onSubmit({
          duration,
          phoneNumber: cleanPhoneNumber,
          email,
          numberOfPeople
        });
      } catch (error) {
        debug.error('BookingDetails: Error in form submission:', error);
        // Still try to submit the booking even if there's an error
        onSubmit({
          duration,
          phoneNumber: phoneNumber.replace(/[- ]/g, ''),
          email,
          numberOfPeople
        });
      }
    }
  };

  const formatDate = (date: Date) => {
    const day = date.getDate();
    // Get the ordinal suffix (st, nd, rd, th)
    const getOrdinalSuffix = (n: number) => {
      if (n > 3 && n < 21) return 'th';
      switch (n % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).replace(/\d+/, `${day}${getOrdinalSuffix(day)}`);
  };

  return (
    <div className="space-y-8">
      {/* Selected Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-green-100">
          <div className="flex items-center justify-center gap-3">
            <div className="bg-green-50 p-3 rounded-full">
              <CalendarIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-gray-900 mb-1">Selected Date</h3>
              <p className="text-2xl font-bold text-green-700">
                {formatDate(selectedDate)}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-green-100">
          <div className="flex items-center justify-center gap-3">
            <div className="bg-green-50 p-3 rounded-full">
              <ClockIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-gray-900 mb-1">Selected Time</h3>
              <p className="text-2xl font-bold text-green-700">{selectedTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl shadow-sm p-6">
        {/* Duration Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Duration (hours):
          </label>
          <div className="flex gap-2">
            {Array.from({ length: maxDuration }, (_, i) => i + 1).map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => setDuration(hours)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  duration === hours
                    ? 'border-green-600 bg-green-50 text-green-600'
                    : duration === 0
                    ? 'border-red-100 text-gray-700 hover:border-green-600'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {hours}
              </button>
            ))}
          </div>
          {errors.duration && (
            <p className="mt-1 text-sm text-red-600">{errors.duration}</p>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number:
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phoneNumber}
              onChange={handlePhoneChange}
              className={`w-full h-10 px-3 rounded-lg bg-gray-50 focus:outline-none ${
                !phoneNumber
                  ? 'border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                  : validatePhoneNumber(phoneNumber.replace(/\D/g, ''))
                  ? 'border border-green-500 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                  : 'border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500'
              }`}
              placeholder="Enter your phone number"
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Format: 0812345678 or +XX-XXX-XXXX (min. 10 digits)
          </p>
          {errors.phoneNumber && (
            <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address:
          </label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg bg-gray-50 focus:outline-none ${
                !email
                  ? 'border border-red-100 focus:border-green-500 focus:ring-1 focus:ring-green-500'
                  : 'border border-green-500 focus:border-green-500 focus:ring-1 focus:ring-green-500'
              }`}
              placeholder="Enter your email"
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            We'll use this email to send your booking confirmation and any updates about your reservation.
          </p>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        {/* Number of People */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of People:
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setNumberOfPeople(num)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  numberOfPeople === num
                    ? 'border-green-600 bg-green-50 text-green-600'
                    : 'border-gray-300 text-gray-700 hover:border-green-600'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
            duration && phoneNumber && validatePhoneNumber(phoneNumber.replace(/\D/g, '')) && email
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          disabled={!duration || !phoneNumber || !validatePhoneNumber(phoneNumber.replace(/\D/g, '')) || !email}
        >
          Confirm Booking
        </button>
      </form>
    </div>
  );
} 