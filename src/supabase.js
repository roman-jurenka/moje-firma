import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rbnqulgmywtvuryabzjc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGci0iJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibnF1bGdteXd0dnVyeWFiempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzMzk5ODUsImV4cCI6MjA2MTkxNTk4NX0.NI-CLAqRLQQNPSfauzBC0CyJ61Yd7JBrEuldeK6Sudg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)