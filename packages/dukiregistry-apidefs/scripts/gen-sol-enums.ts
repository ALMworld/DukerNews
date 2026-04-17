/**
 * gen-sol-enums.ts — Generate Solidity enum files from proto definitions.
 *
 * Proto is the SINGLE SOURCE OF TRUTH for enum values.
 * This script parses .proto files, extracts enum blocks, and generates
 * Solidity enum declarations that can be copy-pasted or directly written
 * into the contract interface files.
 *
 * Usage:  pnpm gen:sol-enums
 *         tsx scripts/gen-sol-enums.ts
 */

import fs from 'node:fs'
import path from 'node:path'

// ── Config: which proto enums map to which Solidity files ────────────────

interface EnumMapping {
    /** Proto enum name to extract */
    protoEnum: string
    /** Proto file to read from (relative to proto/) */
    protoFile: string
    /** Solidity output file path (relative to repo root) */
    solFile: string
    /** Prefix to strip from proto value names (e.g. "DUKER_EVENT_TYPE_" → bare "UNSPECIFIED") */
    stripPrefix: string
}

const MAPPINGS: EnumMapping[] = [
    {
        protoEnum: 'DukerEventType',
        protoFile: 'duker_registry.proto',
        solFile: 'packages/contract_duki_registry/contracts/interfaces/IDukerRegistryEnums.sol',
        stripPrefix: 'DUKER_EVENT_TYPE_',
    },
    {
        protoEnum: 'RejectReason',
        protoFile: 'duker_registry.proto',
        solFile: 'packages/contract_duki_registry/contracts/interfaces/IDukerRegistryEnums.sol',
        stripPrefix: 'REJECT_REASON_',
    },
    {
        protoEnum: 'DukigenEventType',
        protoFile: 'dukigen_registry.proto',
        solFile: 'packages/contract_duki_registry/contracts/interfaces/IDukigenRegistryEvents.sol',
        stripPrefix: 'DUKIGEN_EVENT_TYPE_',
    },
]

// ── Proto parser ─────────────────────────────────────────────────────────

interface ProtoEnumValue {
    name: string
    number: number
}

function parseProtoEnum(protoContent: string, enumName: string): ProtoEnumValue[] {
    // Match: enum EnumName { ... }
    const enumRegex = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]+)\\}`, 's')
    const match = protoContent.match(enumRegex)
    if (!match) {
        throw new Error(`Enum "${enumName}" not found in proto content`)
    }

    const body = match[1]
    const values: ProtoEnumValue[] = []

    // Match: VALUE_NAME = 123;
    const valueRegex = /(\w+)\s*=\s*(\d+)\s*;/g
    let m: RegExpExecArray | null
    while ((m = valueRegex.exec(body)) !== null) {
        values.push({ name: m[1], number: parseInt(m[2], 10) })
    }

    // Sort by number to ensure correct order
    values.sort((a, b) => a.number - b.number)
    return values
}

// ── Solidity generator ───────────────────────────────────────────────────

function generateSolEnum(enumName: string, values: ProtoEnumValue[], stripPrefix: string): string {
    const lines = values.map((v, i) => {
        let name = v.name
        // Strip the proto prefix (e.g. DUKER_EVENT_TYPE_UNSPECIFIED → UNSPECIFIED)
        if (stripPrefix && name.startsWith(stripPrefix)) {
            name = name.slice(stripPrefix.length)
        }
        const comma = i < values.length - 1 ? ',' : ''
        const pad = ' '.repeat(Math.max(1, 40 - name.length - comma.length))
        return `        ${name}${comma}${pad}// ${v.number}`
    })

    return [
        `    // GENERATED FROM proto — DO NOT EDIT MANUALLY`,
        `    // Re-generate with: pnpm --filter @repo/dukiregistry-apidefs gen:sol-enums`,
        `    enum ${enumName} {`,
        ...lines,
        `    }`,
    ].join('\n')
}

// ── Main ─────────────────────────────────────────────────────────────────

const PROTO_DIR = path.resolve(import.meta.dirname, '..', 'proto')
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

console.log('🔧 gen-sol-enums: Generating Solidity enums from proto definitions\n')

// Group mappings by solFile to batch updates
const byFile = new Map<string, { enumName: string; generated: string }[]>()

for (const mapping of MAPPINGS) {
    const protoPath = path.join(PROTO_DIR, mapping.protoFile)
    const protoContent = fs.readFileSync(protoPath, 'utf-8')
    const values = parseProtoEnum(protoContent, mapping.protoEnum)

    console.log(`  ✓ ${mapping.protoEnum}: ${values.length} values from ${mapping.protoFile}`)

    const generated = generateSolEnum(mapping.protoEnum, values, mapping.stripPrefix)
    const solPath = path.join(REPO_ROOT, mapping.solFile)

    if (!byFile.has(solPath)) byFile.set(solPath, [])
    byFile.get(solPath)!.push({ enumName: mapping.protoEnum, generated })
}

console.log('')

// Apply to Solidity files
for (const [solPath, enums] of byFile) {
    if (!fs.existsSync(solPath)) {
        console.warn(`  ⚠ Skipping ${path.basename(solPath)} — file not found`)
        continue
    }

    let content = fs.readFileSync(solPath, 'utf-8')

    for (const { enumName, generated } of enums) {
        // Replace existing enum block (including any preceding comment lines with GENERATED)
        const enumRegex = new RegExp(
            `(    // GENERATED FROM proto[^\\n]*\\n    // Re-generate[^\\n]*\\n)?    enum ${enumName}\\s*\\{[^}]+\\}`,
            's'
        )

        if (enumRegex.test(content)) {
            content = content.replace(enumRegex, generated)
            console.log(`  ✓ Updated ${enumName} in ${path.basename(solPath)}`)
        } else {
            console.warn(`  ⚠ Could not find enum ${enumName} in ${path.basename(solPath)} — skipping`)
        }
    }

    fs.writeFileSync(solPath, content, 'utf-8')
}

console.log('\n✅ Done!\n')
