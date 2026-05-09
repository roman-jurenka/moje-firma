import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rbnqulgmywtvuryabzjc.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_KIhJk4oqQKCguH1rVgC49g_M9P0lZfg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)