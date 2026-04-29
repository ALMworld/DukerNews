#!/usr/bin/env tsx
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8788'
const CHAIN_EID = Number(process.env.CHAIN_EID || '31337')

const RESET_SCHEMA = process.argv.includes('--reset-schema')

async function runWranglerCommand(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`Command exited with code ${code}`))
        })
        child.on('error', reject)
    })
}

async function main() {
    if (RESET_SCHEMA) {
        console.log('1. Wiping local D1 state...')
        await rm(join(process.cwd(), '.wrangler/state/v3/d1'), { recursive: true, force: true })

        console.log('\n2. Applying schema (001_initial.sql)...')
        await runWranglerCommand('pnpm', [
            'exec', 'wrangler', 'd1', 'execute', 'duki_registry',
            '--local', '--file', './schemas/001_initial.sql',
        ])
    } else {
        console.log('1. Truncating existing tables...')
        const tables = [
            'duker_users',
            'duker_preferences',
            'duker_registry_events',
            'dukigen_agents',
            'dukigen_registry_events',
            'dukigen_agent_metrics',
            'deal_duki_minted_events',
            'sync_state'
        ]
        const deleteCommands = tables.map(t => `DELETE FROM ${t};`).join(' ')
        await runWranglerCommand('pnpm', [
            'exec', 'wrangler', 'd1', 'execute', 'duki_registry',
            '--local', '--command', deleteCommands,
        ])
    }

    console.log('\nWaiting for wrangler dev server to reload D1...')
    await new Promise(r => setTimeout(r, 2000))

    console.log('\n3. Triggering SyncEvents for all contracts...')
    
    const contracts = ['DUKER_REGISTRY', 'DUKIGEN_REGISTRY', 'ALM_WORLD_MINTER']
    
    for (const contract of contracts) {
        process.stdout.write(`  -> Syncing ${contract}... `)
        
        try {
            const res = await fetch(`${WORKER_URL}/dukiregistry.BlockchainSyncService/SyncEvents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1'
                },
                body: JSON.stringify({
                    contract,
                    chainEid: CHAIN_EID,
                    contractHead: '0'
                })
            })
            
            const data = await res.text()
            console.log(data)
        } catch (e) {
            console.log(`Error: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

    console.log('\nDatabase reset and sync complete!')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
