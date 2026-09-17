import re

with open('frontend-user/src/pages/WalletPage.jsx', 'r') as f:
    content = f.read()

# 1. Remove step 2 check
content = content.replace('{topUpStep === 1 ? (', '')

# 2. Change Lanjutkan button to handleTopUpConfirm
content = content.replace('onClick={() => setTopUpStep(2)}', 'onClick={handleTopUpConfirm}')

# 3. Remove all code after the Lanjutkan button until the closing tags of step 1
# This is tricky with regex, let's write a targeted script to slice the file
