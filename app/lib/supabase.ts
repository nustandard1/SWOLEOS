import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://dthkeorghyytrnzbbczt.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aGtlb3JnaHl5dHJuemJiY3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNjQ2ODgsImV4cCI6MjA5NTg0MDY4OH0.Py0dPjQyHZW6-LrhIMeqnnETs2Ol6YqAB1-XLyO1gRo';

// Persist the session in AsyncStorage so the user stays logged in between launches.
// (Was disabled for Expo Go, which crashed on AsyncStorage — we're on a real build now,
// and AsyncStorage is already bundled, so this is safe.)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
