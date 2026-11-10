import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xyzcompany.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';    

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);