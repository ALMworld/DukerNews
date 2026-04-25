/**
 * gen-sol-enums.ts — Generate Solidity enum files from proto definitions.
 *
 * Proto is the SINGLE SOURCE OF TRUTH for enum values.
 * This script parses .proto files line-by-line, extracts enum blocks,
 * and writes Solidity enum declarations into the contract interface files.
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
        solFile: 'packages/contract_duki_alm_world/contracts/libraries/IDukerRegistryEnums.sol',
        stripPrefix: 'DUKER_EVENT_TYPE_',
    },
    {
        protoEnum: 'DukigenEventType',
        protoFile: 'dukigen_registry.proto',
        solFile: 'packages/contract_duki_alm_world/contracts/libraries/IDukigenRegistryEnums.sol',
        stripPrefix: 'DUKIGEN_EVENT_TYPE_',
    },
    {
        protoEnum: 'ProductType',
        protoFile: 'dukigen_types.proto',
        solFile: 'packages/contract_duki_alm_world/contracts/libraries/IDukigenRegistryEnums.sol',
        stripPrefix: 'PRODUCT_TYPE_',
    },
    {
        protoEnum: 'DukiType',
        protoFile: 'dukigen_types.proto',
        solFile: 'packages/contract_duki_alm_world/contracts/libraries/IDukigenRegistryEnums.sol',
        stripPrefix: 'DUKI_TYPE_',
    },
]

// ── Proto parser (line-by-line) ──────────────────────────────────────────

interface ProtoEnumValue {
    name: string
    number: number
}

function parseProtoEnum(protoContent: string, enumName: string): ProtoEnumValue[] {
    const lines = protoContent.split('\n')
    const values: ProtoEnumValue[] = []
    let inside = false

    for (const line of lines) {
        const trimmed = line.trim()

        // Detect start: "enum FooBar {"
        if (!inside && trimmed.startsWith('enum') && trimmed.includes(enumName) && trimmed.includes('{')) {
            inside = true
            continue
        }

        // Detect end: "}"
        if (inside && trimmed === '}') break

        // Parse value: "VALUE_NAME = 123;"
        if (inside) {
            const m = trimmed.match(/^(\w+)\s*=\s*(\d+)\s*;/)
            if (m) {
                values.push({ name: m[1], number: parseInt(m[2], 10) })
            }
        }
    }

    if (values.length === 0) {
        throw new Error(`Enum "${enumName}" not found or empty in proto content`)
    }

    values.sort((a, b) => a.number - b.number)
    return values
}

// ── Solidity generator ───────────────────────────────────────────────────

function generateSolEnumLines(enumName: string, values: ProtoEnumValue[], stripPrefix: string): string[] {
    const result: string[] = [
        '    // GENERATED FROM proto — DO NOT EDIT MANUALLY',
        '    // Re-generate with: pnpm --filter @repo/dukiregistry-apidefs gen:sol-enums',
        `    enum ${enumName} {`,
    ]

    for (let i = 0; i < values.length; i++) {
        let name = values[i].name
        if (stripPrefix && name.startsWith(stripPrefix)) {
            name = name.slice(stripPrefix.length)
        }
        const comma = i < values.length - 1 ? ',' : ''
        const pad = ' '.repeat(Math.max(1, 40 - name.length - comma.length))
        result.push(`        ${name}${comma}${pad}// ${values[i].number}`)
    }

    result.push('    }')
    return result
}

// ── Solidity file updater (line-by-line splice) ──────────────────────────

function replaceEnumInSol(content: string, enumName: string, newLines: string[]): { content: string; updated: boolean } {
    const lines = content.split('\n')
    let blockStart = -1
    let blockEnd = -1

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()

        // Find "enum <name> {"
        if (blockStart === -1 && trimmed.startsWith(`enum ${enumName}`) && trimmed.includes('{')) {
            // Include preceding GENERATED comment lines (up to 2 lines above)
            blockStart = i
            if (i >= 1 && lines[i - 1].trim().startsWith('// Re-generate')) blockStart = i - 1
            if (blockStart >= 1 && lines[blockStart - 1].trim().startsWith('// GENERATED FROM proto')) blockStart = blockStart - 1
            continue
        }

        // Find closing "}" for the enum block
        if (blockStart !== -1 && blockEnd === -1 && trimmed === '}') {
            blockEnd = i
            break
        }
    }

    if (blockStart !== -1 && blockEnd !== -1) {
        lines.splice(blockStart, blockEnd - blockStart + 1, ...newLines)
        return { content: lines.join('\n'), updated: true }
    }

    return { content, updated: false }
}

// ── Main ─────────────────────────────────────────────────────────────────

const PROTO_DIR = path.resolve(import.meta.dirname, '..', 'proto')
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

console.log('🔧 gen-sol-enums: Generating Solidity enums from proto definitions\n')

// Group mappings by solFile to batch updates
const byFile = new Map<string, { enumName: string; lines: string[] }[]>()

for (const mapping of MAPPINGS) {
    const protoPath = path.join(PROTO_DIR, mapping.protoFile)
    const protoContent = fs.readFileSync(protoPath, 'utf-8')
    const values = parseProtoEnum(protoContent, mapping.protoEnum)

    console.log(`  ✓ ${mapping.protoEnum}: ${values.length} values from ${mapping.protoFile}`)

    const lines = generateSolEnumLines(mapping.protoEnum, values, mapping.stripPrefix)
    const solPath = path.join(REPO_ROOT, mapping.solFile)

    if (!byFile.has(solPath)) byFile.set(solPath, [])
    byFile.get(solPath)!.push({ enumName: mapping.protoEnum, lines })
}

console.log('')

// Apply to Solidity files
for (const [solPath, enums] of byFile) {
    let content: string

    if (!fs.existsSync(solPath)) {
        const baseName = path.basename(solPath, '.sol')
        content = [
            '// SPDX-License-Identifier: MIT',
            'pragma solidity ^0.8.22;',
            '',
            `interface ${baseName} {`,
            '}',
            '',
        ].join('\n')
        console.log(`  + Created ${path.basename(solPath)}`)
    } else {
        content = fs.readFileSync(solPath, 'utf-8')
    }

    for (const { enumName, lines } of enums) {
        const result = replaceEnumInSol(content, enumName, lines)

        if (result.updated) {
            content = result.content
            console.log(`  ✓ Updated ${enumName} in ${path.basename(solPath)}`)
        } else {
            // Enum not found — insert before the last closing brace
            const fileLines = content.split('\n')
            const lastBraceIdx = fileLines.lastIndexOf('}')
            if (lastBraceIdx !== -1) {
                fileLines.splice(lastBraceIdx, 0, '', ...lines)
                content = fileLines.join('\n')
                console.log(`  + Inserted ${enumName} into ${path.basename(solPath)}`)
            } else {
                console.warn(`  ⚠ Could not find insertion point in ${path.basename(solPath)} — skipping ${enumName}`)
            }
        }
    }

    fs.mkdirSync(path.dirname(solPath), { recursive: true })
    fs.writeFileSync(solPath, content, 'utf-8')
}

console.log('\n✅ Done!\n')
