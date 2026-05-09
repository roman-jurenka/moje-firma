import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rbnqulgmywtvuryabzjc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibnF1bGdteXd0dnVyeWFiempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3ODI3MTgsImV4cCI6MjA5MzM1ODcxOH0.Nl-CLAqRLQQNPSfauzBC0CyJ61Yd7JBrEuIdeK6Sudg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)