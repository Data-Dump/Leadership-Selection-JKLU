import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dblnbfbkqvcvhlaskbpb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibG5iZmJrcXZjdmhsYXNrYnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODA3NzMsImV4cCI6MjEwMzc1Njc3M30.6tuRxUFZBy9uE4SEIWshht9hlKQxybaUUkqECYJpTIA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
