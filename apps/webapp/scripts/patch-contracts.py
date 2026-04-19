#!/usr/bin/env python3
"""
Patch contracts.ts LOCAL_CHAIN_ID addresses from deploy JSON outputs.

Usage: python3 scripts/patch-contracts.py <alm_json> <dao_json> <contracts_ts>
"""
import json, re, sys

if len(sys.argv) != 4:
    print(f"Usage: {sys.argv[0]} <alm_json> <dao_json> <contracts_ts>")
    sys.exit(1)

alm_path, dao_path, ts_path = sys.argv[1], sys.argv[2], sys.argv[3]

alm = json.load(open(alm_path))
dao = json.load(open(dao_path))

with open(ts_path, 'r') as f:
    content = f.read()

# Addresses to patch in the LOCAL_CHAIN_ID block
replacements = {
    'DukerNews': dao['DukerNews'],
    'DukigenRegistry': alm['dukigenRegistry'],
    'DukerRegistry': alm['dukerRegistry'],
    'DUKIToken': alm['dukiToken'],
    'ALMToken': alm['almToken'],
    'AlmWorldDukiMinter': alm['almWorldDukiMinter'],
}
stablecoin_addr = alm['mockUsdt']

# Patch the [LOCAL_CHAIN_ID] block
block = re.search(r'(\[LOCAL_CHAIN_ID\]: \{)(.*?)(\},)', content, re.DOTALL)
if block:
    inner = block.group(2)
    for k, v in replacements.items():
        inner = re.sub(k + r": '[^']+'", k + ": '" + v + "'", inner)
    content = content[:block.start()] + block.group(1) + inner + block.group(3) + content[block.end():]

# Patch the stablecoin address in the LOCAL_CHAIN_ID stablecoins section
content = re.sub(
    r"(id: LOCAL_CHAIN_ID,.*?address: ')[^']+('\s*as Address)",
    lambda m: m.group(1) + stablecoin_addr + m.group(2),
    content, flags=re.DOTALL
)

with open(ts_path, 'w') as f:
    f.write(content)

print('  ✓ Updated LOCAL_CHAIN_ID addresses in contracts.ts')
for k, v in replacements.items():
    print(f'    {k:22s} {v}')
print(f'    {"MockUSDT":22s} {stablecoin_addr}')
