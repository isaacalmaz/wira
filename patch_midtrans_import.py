with open('backend/routes/midtrans.js', 'r') as f:
    content = f.read()

# Fix the import path and destructuring
content = content.replace("const { supabaseAdmin } = require('../database/supabase');", "const supabaseAdmin = require('../config/supabase');")

with open('backend/routes/midtrans.js', 'w') as f:
    f.write(content)
