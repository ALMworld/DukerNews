/**
 * /dukigen — Register a DUKIGEN Agent (Works)
 *
 * One-page form to register an on-chain works identity:
 *   - Agent name (brand name, spaces allowed)
 *   - Agent URI (registration JSON / metadata URL)
 *   - Agent URI content hash / CID
 *   - Website
 *   - Product type (Digital / Physical / Service)
 *   - DUKI type (Revenue / Profit)
 *   - Pledge URL (optional governance page)
 *   - dukiBps configuration
 *
 * Calls DukigenRegistry.register() with full works metadata.
 */
import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import {
    AlertCircle, CheckCircle2, ExternalLink,
    FileDigit, Link as LinkIcon, Loader2,
    Network, Package, PieChart, Plus, TrendingUp,
    UserStar, X as XIcon,
} from 'lucide-react'
import { isAddress } from 'viem'
import { useAuthStore } from '../lib/authStore'
import { ADDRESSES, DEFAULT_CHAIN_ID, SUPPORTED_CHAINS, dukigenRegistryAbi } from '../lib/contracts'
import { notifyDukiRegistry } from '../client/registry-api'
import { DukiBpsSlider } from '../components/DukiBpsSlider'
import { addBookmark } from '../lib/bookmarks'

export const Route = createFileRoute('/dukigen')({
    component: DukigenPage,
})

// ── Design tokens ────────────────────────────────────────────────────────────
const META = 'var(--meta-color)'
const BDR = 'var(--border)'
const FG = 'var(--foreground)'
const P300 = 'var(--duki-300, #c4b5fd)'

// ── Product / Duki type options ─────────────────────────────────────────────
const PRODUCT_OPTIONS = [
    { value: 1, label: 'Digital', icon: FileDigit, desc: 'Apps, SaaS, Software' },
    { value: 2, label: 'Physical', icon: Package, desc: 'Hardware, Goods' },
    { value: 3, label: 'Service', icon: UserStar, desc: 'Consulting, Pro services' },
] as const

const DUKI_OPTIONS = [
    { value: 1, label: 'Revenue Share', icon: TrendingUp, desc: 'Real-time · DUKI minted on each payment' },
    { value: 2, label: 'Profit Share', icon: PieChart, desc: 'Periodically or via contract' },
] as const

// ── Chain dropdown options for the chain-contracts list ─────────────────────
// Built from SUPPORTED_CHAINS so we always reflect the chains the app actually
// targets. The EID — not the chainId — is what the contract stores. A trailing
// "Custom EID…" option lets users point at chains we haven't added yet.
type ChainOption = { eid: number; name: string }
const CHAIN_OPTIONS: Array<ChainOption> = SUPPORTED_CHAINS.map(c => ({
    eid: c.eid,
    name: c.name,
}))
const CUSTOM_EID_SENTINEL = '__custom__'

type Step = 'idle' | 'switching' | 'executing' | 'confirming' | 'done'

function DukigenPage() {
    const pathname = useRouterState({ select: (state) => state.location.pathname })
    const normalizedPath = pathname.replace(/\/+$/, '')

    if (normalizedPath !== '/dukigen') {
        return <Outlet />
    }

    return <DukigenCreatePage />
}

function DukigenCreatePage() {
    const { authStatus, me, setConnectModalOpen } = useAuthStore()
    const { address } = useAccount()
    const chainId = useChainId()
    const { switchChainAsync } = useSwitchChain()
    const publicClient = usePublicClient()
    const { writeContractAsync } = useWriteContract()

    const isLoggedIn = authStatus === 'authenticated' && !!me
    const hasUsername = isLoggedIn && !!me.username

    // ── Form state ──────────────────────────────────────────────
    const [agentName, setAgentName] = useState('')
    const [website, setWebsite] = useState('')
    const [agentURI, setAgentURI] = useState('')
    const [agentURIHash, setAgentURIHash] = useState('')
    const [productType, setProductType] = useState(1) // Digital
    const [dukiType, setDukiType] = useState(1) // Revenue
    const [pledgeUrl, setPledgeUrl] = useState('')
    const [dukiBps, setDukiBps] = useState(5000)

    // Per-chain deployed contracts. Each row carries its own `id` so React keys
    // stay stable across edits — never reuse the array index because deletes
    // shuffle remaining rows. `isCustom` flips the EID input from a select into
    // a free-form numeric input so users can target chains we haven't added.
    type ChainRow = {
        id: number
        chainEid: string
        contractAddr: string
        isCustom: boolean
    }
    const [chainRows, setChainRows] = useState<Array<ChainRow>>([])
    const addChainRow = () =>
        setChainRows((rows) => [
            ...rows,
            { id: Date.now() + Math.random(), chainEid: '', contractAddr: '', isCustom: false },
        ])
    const updateChainRow = (id: number, patch: Partial<ChainRow>) =>
        setChainRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const removeChainRow = (id: number) =>
        setChainRows((rows) => rows.filter((r) => r.id !== id))

    // ── Transaction state ───────────────────────────────────────
    const [step, setStep] = useState<Step>('idle')
    const [txHash, setTxHash] = useState('')
    const [error, setError] = useState('')
    const [registeredId, setRegisteredId] = useState<bigint | null>(null)

    // ── Auth gate ───────────────────────────────────────────────
    useEffect(() => {
        if (!isLoggedIn || !hasUsername) {
            setConnectModalOpen(true)
        }
    }, [isLoggedIn, hasUsername])

    if (!isLoggedIn || !hasUsername) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: META, marginBottom: 16 }}>
                        {!isLoggedIn ? 'Connect your wallet to register a DUKIGEN Agent.' : 'You need a username first.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => setConnectModalOpen(true)}
                        style={{
                            padding: '8px 20px', borderRadius: 8, fontSize: 13,
                            fontWeight: 500, cursor: 'pointer',
                            background: 'var(--muted)', color: FG,
                            border: `1px solid ${BDR}`,
                        }}
                    >
                        {!isLoggedIn ? 'Connect Wallet' : 'Mint Username'}
                    </button>
                </div>
            </div>
        )
    }

    // ── Registration handler ────────────────────────────────────
    const handleRegister = async () => {
        const name = agentName.trim()
        if (!name) return
        if (!address) return

        setError('')
        setTxHash('')
        setRegisteredId(null)

        try {
            const addrs = ADDRESSES[chainId] ?? ADDRESSES[DEFAULT_CHAIN_ID]

            // Validate + normalize chain contract rows. Empty rows are dropped
            // silently; partial rows (one field filled) are surfaced as errors
            // so the user knows we'd otherwise mint with bad data.
            const chainContracts: Array<{ chainEid: number; contractAddr: `0x${string}` }> = []
            for (const row of chainRows) {
                const eidStr = row.chainEid.trim()
                const addrStr = row.contractAddr.trim()
                if (!eidStr && !addrStr) continue
                if (!eidStr || !addrStr) {
                    throw new Error('Each chain contract row needs both a chain EID and an address.')
                }
                const eid = Number(eidStr)
                if (!Number.isInteger(eid) || eid <= 0 || eid > 0xffffff) {
                    throw new Error(`Invalid chain EID "${eidStr}" — must be a positive integer ≤ 16777215.`)
                }
                if (!isAddress(addrStr)) {
                    throw new Error(`Invalid contract address "${addrStr}".`)
                }
                chainContracts.push({ chainEid: eid, contractAddr: addrStr })
            }

            setStep('executing')
            const hash = await writeContractAsync({
                address: addrs.DukigenRegistry,
                abi: dukigenRegistryAbi,
                functionName: 'register',
                args: [
                    name,
                    agentURI.trim(),
                    agentURIHash.trim(),
                    website.trim(),
                    dukiBps,
                    productType,
                    dukiType,
                    pledgeUrl.trim(),
                    chainContracts,
                ],
            })
            setTxHash(hash)

            setStep('confirming')
            const receipt = await publicClient!.waitForTransactionReceipt({ hash })
            if (receipt.status === 'reverted') throw new Error('Transaction reverted')

            // Parse agentId from Transfer event (ERC721 mint: from=0x0)
            const transferLog = receipt.logs.find(
                (log) => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                    && log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
            )
            if (transferLog?.topics[3]) {
                const mintedId = BigInt(transferLog.topics[3])
                setRegisteredId(mintedId)
                addBookmark(mintedId)
            }

            setStep('done')

            // Notify the registry worker so it indexes the new agent
            notifyDukiRegistry(hash, chainId)  // fire-and-forget
        } catch (e: any) {
            // Try to decode revert reason
            let msg = e?.shortMessage || e?.message?.split('\n')[0] || 'Transaction failed'
            if (e?.walk) {
                const revertErr = e.walk((err: any) => err?.name === 'ContractFunctionRevertedError')
                if (revertErr?.data?.errorName) {
                    const args = revertErr.data.args?.length ? `: ${revertErr.data.args.join(', ')}` : ''
                    msg = `${revertErr.data.errorName}${args}`
                }
            }
            setError(msg)
            setStep('idle')
        }
    }

    const saving = step !== 'idle' && step !== 'done'
    const nameValid = agentName.trim().length >= 1

    const stepLabel = step === 'switching' ? 'Switching chain…'
        : step === 'executing' ? 'Confirm in wallet…'
            : step === 'confirming' ? 'Confirming on-chain…'
                : null

    return (
        <div style={{ maxWidth: 580, margin: '0 auto', padding: '24px 16px' }}>
            {/* ── Header ── */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: FG }}>
                    Register DUKIGEN Agent
                </h1>
                <p style={{ fontSize: 13, color: META, lineHeight: 1.5 }}>
                    Create an on-chain identity for your works. This mints an NFT representing your agent
                    and stores all metadata on-chain.
                </p>
            </div>

            {/* ── Form ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── Chain selector ── */}
                {SUPPORTED_CHAINS.length > 1 && (
                    <div>
                        <label style={{
                            display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 6,
                            color: META, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                        }}>
                            <LinkIcon size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Registration Network
                        </label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {SUPPORTED_CHAINS.map(c => {
                                const on = chainId === c.id
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={async () => {
                                            if (saving || c.id === chainId) return
                                            try { await switchChainAsync({ chainId: c.id }) } catch { /* user rejected */ }
                                        }}
                                        disabled={saving || step === 'done'}
                                        style={{
                                            padding: '6px 14px', borderRadius: 8, fontSize: 12,
                                            fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
                                            border: on ? '2px solid #8b5cf6' : `1px solid ${BDR}`,
                                            background: on ? 'rgba(139,92,246,0.08)' : 'transparent',
                                            color: on ? '#8b5cf6' : FG,
                                            opacity: saving ? 0.5 : 1,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {c.name}
                                        {c.isHome && <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 9 }}>●</span>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Agent Name */}
                <FieldGroup label="Agent Name" required hint="Brand name for your works (spaces allowed)">
                    <input
                        type="text"
                        value={agentName}
                        onChange={e => setAgentName(e.target.value)}
                        placeholder="Duker News"
                        disabled={saving || step === 'done'}
                        style={inputStyle}
                    />
                </FieldGroup>

                {/* ── Deployed Contracts ── */}
                {/* List of (chainEid, contractAddr) entries declaring where this   */}
                {/* agent's product/dApp contracts are deployed across chains.      */}
                {/* Distinct from the "Registration Network" above, which is the    */}
                {/* single chain where the agent NFT itself is being minted.       */}
                <FieldGroup
                    label="Deployed Contracts"
                    hint="Optional. Where this agent's contracts are deployed on each chain. You can add more later via setChainContract."
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {chainRows.map((row) => {
                            // The select's value is either a known EID (as string) or the
                            // custom sentinel. When the user picks Custom, we flip to a
                            // numeric input that owns `chainEid` directly.
                            const matchedKnown = !row.isCustom && CHAIN_OPTIONS.some(o => String(o.eid) === row.chainEid)
                            const selectValue = row.isCustom
                                ? CUSTOM_EID_SENTINEL
                                : (matchedKnown ? row.chainEid : '')
                            return (
                                <div key={row.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {row.isCustom ? (
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={row.chainEid}
                                            onChange={e => updateChainRow(row.id, { chainEid: e.target.value })}
                                            onBlur={() => {
                                                // If the user typed an EID that matches a known chain,
                                                // collapse back to the dropdown so the row reads cleanly.
                                                if (CHAIN_OPTIONS.some(o => String(o.eid) === row.chainEid)) {
                                                    updateChainRow(row.id, { isCustom: false })
                                                }
                                            }}
                                            placeholder="EID"
                                            disabled={saving || step === 'done'}
                                            style={{ ...inputStyle, width: 140 }}
                                        />
                                    ) : (
                                        <select
                                            value={selectValue}
                                            onChange={e => {
                                                const v = e.target.value
                                                if (v === CUSTOM_EID_SENTINEL) {
                                                    updateChainRow(row.id, { isCustom: true, chainEid: '' })
                                                } else {
                                                    updateChainRow(row.id, { isCustom: false, chainEid: v })
                                                }
                                            }}
                                            disabled={saving || step === 'done'}
                                            style={{ ...inputStyle, width: 140 }}
                                        >
                                            <option value="" disabled>Chain…</option>
                                            {CHAIN_OPTIONS.map(opt => (
                                                <option key={opt.eid} value={String(opt.eid)}>
                                                    {opt.name} ({opt.eid})
                                                </option>
                                            ))}
                                            <option value={CUSTOM_EID_SENTINEL}>Custom EID…</option>
                                        </select>
                                    )}
                                    <input
                                        type="text"
                                        value={row.contractAddr}
                                        onChange={e => updateChainRow(row.id, { contractAddr: e.target.value })}
                                        placeholder="0x…"
                                        disabled={saving || step === 'done'}
                                        style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeChainRow(row.id)}
                                        disabled={saving || step === 'done'}
                                        aria-label="Remove deployed contract"
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            width: 32, height: 32, borderRadius: 8,
                                            border: `1px solid ${BDR}`, background: 'transparent',
                                            color: META, cursor: 'pointer', flexShrink: 0,
                                        }}
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </div>
                            )
                        })}
                        <button
                            type="button"
                            onClick={addChainRow}
                            disabled={saving || step === 'done'}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 12px', borderRadius: 8, fontSize: 12,
                                border: `1px dashed ${BDR}`, background: 'transparent',
                                color: META, cursor: 'pointer',
                            }}
                        >
                            <Network size={12} />
                            <span>Add deployment</span>
                        </button>
                    </div>
                </FieldGroup>

                {/* Website */}
                <FieldGroup label="Website" hint="Public homepage for the agent or product">
                    <input
                        type="url"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                        placeholder="https://yourproject.com"
                        disabled={saving || step === 'done'}
                        style={inputStyle}
                    />
                </FieldGroup>

                {/* Agent URI */}
                <FieldGroup label="Agent URI" hint="Registration JSON or metadata URL, such as ipfs://...">
                    <input
                        type="text"
                        value={agentURI}
                        onChange={e => setAgentURI(e.target.value)}
                        placeholder="ipfs://bafy.../agent.json"
                        disabled={saving || step === 'done'}
                        style={inputStyle}
                    />
                </FieldGroup>

                {/* Agent URI Hash */}
                <FieldGroup label="Agent URI Hash" hint="Content hash, CID, or digest used to detect metadata changes">
                    <input
                        type="text"
                        value={agentURIHash}
                        onChange={e => setAgentURIHash(e.target.value)}
                        placeholder="bafy... or sha256:..."
                        disabled={saving || step === 'done'}
                        style={inputStyle}
                    />
                </FieldGroup>

                {/* ── Product Type ── */}
                <FieldGroup label="Product Type" required>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {PRODUCT_OPTIONS.map(opt => (
                            <TypeCard
                                key={opt.value}
                                selected={productType === opt.value}
                                onClick={() => !saving && setProductType(opt.value)}
                                icon={<opt.icon size={18} />}
                                label={opt.label}
                                desc={opt.desc}
                                disabled={saving || step === 'done'}
                            />
                        ))}
                    </div>
                </FieldGroup>

                {/* ── DUKI Type ── */}
                <FieldGroup label="DUKI Type" required hint="How you pledge to DUKI ecosystem">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {DUKI_OPTIONS.map(opt => (
                            <TypeCard
                                key={opt.value}
                                selected={dukiType === opt.value}
                                onClick={() => !saving && setDukiType(opt.value)}
                                icon={<opt.icon size={18} />}
                                label={opt.label}
                                desc={opt.desc}
                                disabled={saving || step === 'done'}
                            />
                        ))}
                    </div>
                </FieldGroup>

                {/* ── DUKI Distribution ── */}
                <FieldGroup label="DUKI Distribution" hint="Default % allocated to DUKI ecosystem on each payment">
                    <DukiBpsSlider
                        value={dukiBps}
                        onChange={setDukiBps}
                        disabled={saving || step === 'done'}
                    />
                </FieldGroup>

                {/* ── Pledge URL ── */}
                <FieldGroup label="Pledge URL" hint="DUKI pledge or governance page (optional)">
                    <input
                        type="url"
                        value={pledgeUrl}
                        onChange={e => setPledgeUrl(e.target.value)}
                        placeholder="https://yourproject.com/duki-pledge"
                        disabled={saving || step === 'done'}
                        style={inputStyle}
                    />
                </FieldGroup>

                {/* ── Separator ── */}
                <div style={{ height: 1, background: BDR }} />

                {/* ── Error ── */}
                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                        borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        fontSize: 13, color: '#ef4444',
                    }}>
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Success ── */}
                {step === 'done' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                        borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                        fontSize: 13, color: '#22c55e',
                    }}>
                        <CheckCircle2 size={16} />
                        <div>
                            <strong>Agent registered!</strong>
                            {registeredId && <span style={{ marginLeft: 8, opacity: 0.8 }}>ID: #{registeredId.toString()}</span>}
                            <Link
                                to="/market"
                                search={{ sort: 'created_desc', q: registeredId?.toString() ?? agentName.trim() }}
                                style={{ marginLeft: 8, color: '#22c55e', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            >
                                View in market <ExternalLink size={12} />
                            </Link>
                            {txHash && (
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ marginLeft: 8, color: '#22c55e', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                    View tx <ExternalLink size={12} />
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Submit button ── */}
                <button
                    type="button"
                    onClick={handleRegister}
                    disabled={saving || step === 'done' || !nameValid}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                        cursor: saving || step === 'done' || !nameValid ? 'not-allowed' : 'pointer',
                        border: 'none',
                        background: step === 'done'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : !nameValid
                                ? 'var(--muted)'
                                : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        color: !nameValid ? META : '#fff',
                        opacity: saving ? 0.7 : 1,
                        transition: 'all 0.2s',
                    }}
                >
                    {saving && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                    {step === 'done' ? (
                        <><CheckCircle2 size={16} /> Registered</>
                    ) : stepLabel ? (
                        stepLabel
                    ) : (
                        <><Plus size={16} /> Register Agent</>
                    )}
                </button>
            </div>

            {/* spin animation */}
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
    border: `1px solid var(--border)`, background: 'var(--input)',
    color: 'var(--foreground)', outline: 'none',
    transition: 'border-color 0.15s',
}

// ── FieldGroup ────────────────────────────────────────────────────────────────

function FieldGroup({ label, hint, required, children }: {
    label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
    return (
        <div>
            <label style={{
                display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 6,
                color: META, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
                {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
            </label>
            {children}
            {hint && (
                <p style={{ fontSize: 11, color: META, marginTop: 4, opacity: 0.7 }}>{hint}</p>
            )}
        </div>
    )
}

// ── TypeCard ──────────────────────────────────────────────────────────────────

function TypeCard({ selected, onClick, icon, label, desc, disabled }: {
    selected: boolean; onClick: () => void; icon: React.ReactNode
    label: string; desc: string; disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '12px 8px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
                border: selected ? '2px solid #8b5cf6' : `1px solid var(--border)`,
                background: selected ? 'rgba(139,92,246,0.08)' : 'transparent',
                color: selected ? '#8b5cf6' : 'var(--foreground)',
                transition: 'all 0.15s',
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {icon}
            <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 10, color: META, lineHeight: 1.2, textAlign: 'center' }}>{desc}</span>
        </button>
    )
}
