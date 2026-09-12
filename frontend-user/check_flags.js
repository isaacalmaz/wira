import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yhxhcxgcjadchrjskozt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('feature_flags').select('*');
  console.log(JSON.stringify(data, null, 2));
}
check();
