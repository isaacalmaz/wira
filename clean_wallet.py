import sys

with open('frontend-user/src/pages/WalletPage.jsx', 'r') as f:
    lines = f.readlines()

out = []
in_step_2 = False

for i, line in enumerate(lines):
    # Fix the onClick for Lanjutkan button
    if "onClick={() => setTopUpStep(2)}" in line:
        line = line.replace("onClick={() => setTopUpStep(2)}", "onClick={() => { setFinalAmount(baseAmount); handleTopUpConfirm(); }}")
    
    # Remove step 2 block entirely
    if "{topUpStep === 1 ? (" in line:
        # Just skip this wrapper line
        continue
    
    if ") : (" in line and "topUpStep === 1" not in line:
        # This is the else part of the ternary (Step 2)
        # We need to ensure it's the right one by checking next lines
        if "BCA" in "".join(lines[i:i+30]):
            in_step_2 = True
            continue

    if in_step_2:
        if ")}</>" in line.replace(" ", "") or (line.strip() == ")}" and "</div>" in lines[i+1]):
            in_step_2 = False
            continue
        continue

    # Remove viewpending button
    if "viewingPendingId ?" in line or "Batalkan Permintaan" in line:
        # We'll just filter out the cancel button block manually later if needed
        pass

    out.append(line)

with open('frontend-user/src/pages/WalletPage.jsx', 'w') as f:
    f.writelines(out)
