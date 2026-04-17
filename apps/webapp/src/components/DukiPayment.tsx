/**
 * DukiPayment — Reusable payment panel for any DUKI payment flow.
 *
 * Combines:
 *  1. Amount selection (preset chips + custom input)
 *  2. Stablecoin selector (when multiple stablecoins available per chain)
 *  3. Read-only distribution table (DukerNews vs DUKI Treasury with addresses)
 *  4. Execution toggle (🔗 On-chain / ⚡ Gasless) — configurable
 *  5. Children slot for action buttons, tx status, etc.
 *
 * The dukiBps is ALWAYS passed in from outside (set once at mint).
 *
 * Used in: welcome (mint), submit (post), and anywhere payments are needed.
 * Themed with DukerNews CSS variables (--duki-*, --border, --muted, etc.)
 */
import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Wallet, Zap, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react'
import { useAccount, useChainId, useSwitchChain, useReadContract, useBalance } from 'wagmi'
import {
    ADDRESSES, LOCAL_CHAIN_ID, DEFAULT_CHAIN_ID, SUPPORTED_CHAINS,
    ERC20_ABI, getDefaultStablecoin, getStablecoins,
    type ChainMeta, type StablecoinMeta,
} from '@/lib/contracts'

// ── Types ───────────────────────────────────────────────────────────────────

export type SubmitMethod = 'direct' | 'x402'

export interface DukiPaymentValue {
    amount: number
    dukiBps: number
    method: SubmitMethod
    chainId: number
    dukerNewsAmount: number
    dukiTreasuryAmount: number
    amountMicro: bigint
    insufficientBalance: boolean
    /** Selected stablecoin address */
    stablecoinAddress: string
    /** Selected stablecoin symbol (e.g. 'USDT0', 'USDC') */
    stablecoinSymbol: string
    /** Selected stablecoin decimals (e.g. 6 for USDT, 18 for DAI) */
    stablecoinDecimals: number
}

export interface DukiPaymentProps {
    /** dukiBps value (0–10000, basis points to DUKI Treasury), always readonly */
    dukiBps: number
    /** Preset amount chips */
    amounts?: number[]
    /** Default selected amount */
    defaultAmount?: number
    /** Currency label */
    currency?: string
    /** Show x402 gasless option */
    showX402?: boolean
    /** Default execution mode */
    defaultMethod?: SubmitMethod
    /** Whether the whole panel is disabled */
    disabled?: boolean
    /** Called on any value change */
    onChange?: (value: DukiPaymentValue) => void
    /** Top label for the amount section */
    amountLabel?: string
    /** Sublabel / tagline for the amount section */
    amountSubLabel?: string
    /** Children rendered after everything (e.g. custom submit button) */
    children?: React.ReactNode
    /** Optional wallet address (fallback when useAccount is disconnected) */
    walletAddress?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    n === 0 ? '0' : n < 1 ? n.toFixed(2).replace(/\.?0+$/, '') : (+n.toFixed(3)).toString()

// Chain metadata is now sourced from SUPPORTED_CHAINS in contracts.ts
const chainMetaMap = new Map(SUPPORTED_CHAINS.map(c => [c.id, c]))
const getChainMeta = (id: number): ChainMeta | undefined => chainMetaMap.get(id)

function computeValue(
    amount: number, dukiBps: number, method: SubmitMethod, chainId: number,
    stablecoin: StablecoinMeta,
    insufficientBalance: boolean = false,
): DukiPaymentValue {
    const dukerNewsAmount = +(amount * (10000 - dukiBps) / 10000).toFixed(4)
    const dukiTreasuryAmount = +(amount * dukiBps / 10000).toFixed(4)
    const amountMicro = BigInt(Math.round(amount * 10 ** stablecoin.decimals))
    return {
        amount, dukiBps, method, chainId, dukerNewsAmount, dukiTreasuryAmount, amountMicro,
        insufficientBalance,
        stablecoinAddress: stablecoin.address,
        stablecoinSymbol: stablecoin.symbol,
        stablecoinDecimals: stablecoin.decimals,
    }
}

const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

function AddrLink({ addr, explorerBase, color }: {
    addr: string; explorerBase: string; color: string;
}) {
    const [copied, setCopied] = useState(false)
    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.writeText(addr).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }
    return (
        <span className="font-mono inline-flex items-center gap-1" style={{ color, fontSize: 10 }}>
            {shortAddr(addr)}
            <button type="button" onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy address'}
                className="inline-flex items-center gap-0.5 transition-all cursor-pointer"
                style={{ background: 'none', border: 'none', padding: 0, color: copied ? '#22c55e' : 'inherit', opacity: copied ? 1 : 0.5 }}>
                {copied ? <Check size={8} /> : <Copy size={8} />}
                {copied && <span style={{ fontSize: 9, color: '#22c55e' }}>Copied!</span>}
            </button>
            {explorerBase ? (
                <a href={`${explorerBase}${addr}`} target="_blank" rel="noopener noreferrer"
                    className="opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: 'inherit' }}>
                    <ExternalLink size={8} />
                </a>
            ) : (
                <span className="opacity-20" title="No explorer for local chain">
                    <ExternalLink size={8} />
                </span>
            )}
        </span>
    )
}

// ── Component ───────────────────────────────────────────────────────────────

export function DukiPayment({
    dukiBps,
    amounts = [1, 2, 8, 16, 64],
    defaultAmount = 1,
    showX402 = true,
    defaultMethod = 'direct',
    disabled = false,
    onChange,
    amountLabel,
    amountSubLabel,
    children,
    walletAddress,
}: DukiPaymentProps) {
    const { address: wagmiAddress } = useAccount()
    // Use wagmi address if available, otherwise fall back to prop
    const address = (wagmiAddress ?? walletAddress) as `0x${string}` | undefined

    // ── Chain state — sourced from wagmi (single source of truth) ──
    const selectedChainId = useChainId() ?? DEFAULT_CHAIN_ID
    const { switchChainAsync } = useSwitchChain()
    const selectedMeta = getChainMeta(selectedChainId)
    const isHomeChain = selectedMeta?.isHome ?? false

    // ── Stablecoin selector state ──
    const chainStablecoins = getStablecoins(selectedChainId)
    const [selectedStablecoinIdx, setSelectedStablecoinIdx] = useState(0)
    const selectedStablecoin = chainStablecoins[selectedStablecoinIdx] ?? getDefaultStablecoin(selectedChainId)

    const [preset, setPreset] = useState<number | 'other'>(
        amounts.includes(defaultAmount) ? defaultAmount : 'other'
    )
    const [custom, setCustom] = useState('')
    // Non-DukerNews chains: force x402 (user can't pay gas on a chain they don't have gas for)
    const [method, setMethod] = useState<SubmitMethod>(isHomeChain ? defaultMethod : 'x402')

    const currentAmount = preset === 'other' ? (parseFloat(custom) || 0) : preset
    const chainName = selectedMeta?.name ?? `Chain ${selectedChainId}`
    const stablecoinName = selectedStablecoin.symbol
    const addrs = ADDRESSES[selectedChainId] ?? ADDRESSES[LOCAL_CHAIN_ID]
    const explorerBase = selectedMeta?.explorerUrl ? selectedMeta.explorerUrl + '/address/' : ''
    const gasSymbol = selectedMeta?.nativeCurrency?.symbol ?? 'ETH'

    // Read stablecoin balance for connected wallet — always query selectedChainId's RPC
    const { data: rawBalance, isError: balanceError, isFetched: balanceFetched } = useReadContract({
        address: selectedStablecoin.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: selectedChainId,
        query: { enabled: !!address && !!selectedStablecoin.address && selectedStablecoin.address !== '0x0000000000000000000000000000000000000000' },
    })
    const tokenBalance = rawBalance != null ? Number(rawBalance as bigint) / (10 ** selectedStablecoin.decimals) : null
    const effectiveBalance = tokenBalance ?? (balanceFetched && !!selectedStablecoin.address ? 0 : null)
    const insufficientBalance = effectiveBalance !== null && currentAmount > 0 && currentAmount > effectiveBalance

    // Read native gas token balance
    const { data: nativeBalData } = useBalance({
        address: address,
        chainId: selectedChainId,
        query: { enabled: !!address },
    })
    const gasBalance = nativeBalData ? Number(nativeBalData.value) / (10 ** (nativeBalData.decimals ?? 18)) : null

    const emitChange = useCallback((amt: number, m: SubmitMethod, cid?: number, sc?: StablecoinMeta) => {
        const coin = sc ?? selectedStablecoin
        const insuf = effectiveBalance !== null && amt > 0 && amt > effectiveBalance
        onChange?.(computeValue(amt, dukiBps, m, cid ?? selectedChainId, coin, insuf))
    }, [onChange, dukiBps, selectedChainId, effectiveBalance, selectedStablecoin])

    // Emit on mount + whenever balance/amount/method changes so parent always has correct state
    useEffect(() => {
        emitChange(currentAmount, method)
    }, [effectiveBalance, currentAmount, method])

    // ── Chain switch handler — calls wagmi switchChainAsync (global state) ──
    const handleChainSwitch = async (cid: number) => {
        if (disabled || cid === selectedChainId) return
        try {
            await switchChainAsync({ chainId: cid })
        } catch {
            return // user rejected or switch failed
        }
        const meta = getChainMeta(cid)
        // Non-DukerNews chains: force x402
        const m = (meta?.isHome ?? false) ? method : 'x402'
        if (!meta?.isHome && method !== 'x402') setMethod('x402')
        // Reset stablecoin selection to first for new chain
        setSelectedStablecoinIdx(0)
        const newStablecoins = getStablecoins(cid)
        const sc = newStablecoins[0] ?? getDefaultStablecoin(cid)
        emitChange(currentAmount, m, cid, sc)
    }

    // ── Stablecoin switch handler ──
    const handleStablecoinSwitch = (idx: number) => {
        if (disabled) return
        setSelectedStablecoinIdx(idx)
        const sc = chainStablecoins[idx] ?? selectedStablecoin
        emitChange(currentAmount, method, undefined, sc)
    }

    const handlePreset = (v: number) => {
        if (disabled) return
        setPreset(v)
        const m = v === 0 ? 'x402' as SubmitMethod : method
        if (v === 0 && method !== 'x402') setMethod('x402')
        emitChange(v, m)
    }
    const handleCustomToggle = () => {
        if (disabled) return
        setPreset('other')
        emitChange(parseFloat(custom) || 0, method)
    }
    const handleCustomChange = (value: string) => {
        if (disabled) return
        setCustom(value)
        emitChange(parseFloat(value) || 0, method)
    }
    const handleMethod = (m: SubmitMethod) => {
        if (disabled) return
        setMethod(m)
        emitChange(currentAmount, m)
    }

    const dukerNewsAmt = +(currentAmount * (10000 - dukiBps) / 10000).toFixed(4)
    const treasuryAmt = +(currentAmount * dukiBps / 10000).toFixed(4)

    return (
        <div className="space-y-3">
            {/* ── Chain selector ── */}
            {SUPPORTED_CHAINS.length > 1 && (
                <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>
                        Chain
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                        {SUPPORTED_CHAINS.map(c => {
                            const on = selectedChainId === c.id
                            return (
                                <button key={c.id} type="button"
                                    onClick={() => handleChainSwitch(c.id)}
                                    disabled={disabled}
                                    className={cn(
                                        'rounded border px-3 py-1 text-xs font-medium transition-all duration-200',
                                        on ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10'
                                            : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                                        disabled && 'opacity-50 cursor-not-allowed'
                                    )}
                                    style={{ color: on ? 'var(--foreground)' : 'var(--meta-color)' }}
                                >
                                    {c.name}
                                    {c.isHome && <span className="ml-1 opacity-50 text-[9px]">●</span>}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Stablecoin selector (only when multiple available) ── */}
            {chainStablecoins.length > 1 && (
                <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>
                        Stablecoin
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                        {chainStablecoins.map((sc, idx) => {
                            const on = selectedStablecoinIdx === idx
                            return (
                                <button key={sc.address} type="button"
                                    onClick={() => handleStablecoinSwitch(idx)}
                                    disabled={disabled}
                                    className={cn(
                                        'rounded border px-3 py-1 text-xs font-medium transition-all duration-200',
                                        on ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10'
                                            : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                                        disabled && 'opacity-50 cursor-not-allowed'
                                    )}
                                    style={{ color: on ? 'var(--foreground)' : 'var(--meta-color)' }}
                                >
                                    {sc.symbol}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Amount chips ── */}
            <div>
                <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: 'var(--meta-color)' }}
                >
                    {amountLabel ?? `Amount (${stablecoinName})`}
                    {amountSubLabel && (
                        <span className="ml-1 text-[10px] opacity-60">
                            — {amountSubLabel}
                        </span>
                    )}
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {amounts.map((v) => {
                        const on = preset === v
                        return (
                            <button key={v} type="button" onClick={() => handlePreset(v)} disabled={disabled}
                                className={cn(
                                    'rounded border px-2.5 py-1 text-xs font-medium transition-all duration-200',
                                    on ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10 shadow-sm'
                                        : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                                    disabled && 'opacity-50 cursor-not-allowed'
                                )}
                                style={{
                                    color: on ? 'var(--foreground)' : 'var(--meta-color)',
                                    ...(on ? { boxShadow: '0 0 8px var(--duki-500-alpha, rgba(168,85,247,.15))' } : {}),
                                }}>
                                {v === 0 ? 'Free' : `$${v}`}
                            </button>
                        )
                    })}
                    <button type="button" onClick={handleCustomToggle} disabled={disabled}
                        className={cn(
                            'rounded border px-2.5 py-1 text-xs font-medium transition-all duration-200',
                            preset === 'other'
                                ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10 shadow-sm'
                                : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                            disabled && 'opacity-50 cursor-not-allowed'
                        )}
                        style={{
                            color: preset === 'other' ? 'var(--foreground)' : 'var(--meta-color)',
                            ...(preset === 'other' ? { boxShadow: '0 0 8px var(--duki-500-alpha, rgba(168,85,247,.15))' } : {}),
                        }}>
                        Other
                    </button>
                    {preset === 'other' && (
                        <input type="number" value={custom}
                            onChange={(e) => handleCustomChange(e.target.value)}
                            min={0} step={0.5} disabled={disabled} placeholder="0.0" autoFocus
                            className="rounded border border-[color:var(--border)] text-sm px-2 py-1 outline-none transition-colors focus:border-[color:var(--duki-500)] w-24"
                            style={{ background: 'var(--input)', color: 'var(--foreground)' }}
                        />
                    )}
                </div>
            </div>

            {/* ── Distribution + Addresses (receipt-style table) ── */}
            {currentAmount > 0 && (
                <div
                    className="rounded-lg border overflow-hidden"
                    style={{
                        borderColor: 'var(--border)',
                        background: 'var(--muted)',
                    }}
                >
                    {/* Header row: chain + coin + balance */}
                    <div
                        className="px-3 py-1.5 flex items-center justify-between text-[10px]"
                        style={{
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--meta-color)',
                        }}
                    >
                        <span className="flex items-center gap-1 flex-wrap">
                            <span style={{ fontWeight: 600, color: 'var(--duki-300)' }}>{stablecoinName}</span>
                            {' on '}
                            <span style={{ fontWeight: 600, color: 'var(--duki-400)' }}>{chainName}</span>
                            <span className="ml-1" style={{
                                fontVariantNumeric: 'tabular-nums',
                                color: insufficientBalance ? '#ef4444' : 'var(--meta-color)',
                                fontWeight: insufficientBalance ? 600 : 400,
                            }}>
                                · {stablecoinName}: {effectiveBalance !== null ? fmt(effectiveBalance) : '—'}
                            </span>
                            <span style={{
                                fontVariantNumeric: 'tabular-nums',
                                color: 'var(--meta-color)',
                                opacity: 0.75,
                            }}>
                                · {gasSymbol}: {gasBalance !== null ? fmt(gasBalance) : '—'}
                            </span>
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--duki-400)' }}>
                            {fmt(currentAmount)} {stablecoinName}
                        </span>
                    </div>

                    {/* Insufficient balance warning */}
                    {insufficientBalance && (
                        <div
                            className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-medium"
                            style={{
                                background: 'rgba(239,68,68,0.08)',
                                borderBottom: '1px solid rgba(239,68,68,0.2)',
                                color: '#ef4444',
                            }}
                        >
                            <AlertTriangle size={11} />
                            Insufficient {stablecoinName} balance — need {fmt(currentAmount)}, have {fmt(effectiveBalance ?? 0)}
                        </div>
                    )}

                    {/* DukerNews row */}
                    <div
                        className="px-3 py-2.5 flex items-center justify-between"
                        style={{ borderBottom: '1px solid var(--border)' }}
                    >
                        <div>
                            <div className="text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--duki-500)' }}>
                                Duker News Treasury · {(10000 - dukiBps) / 100}%
                            </div>
                            <div className="text-[9px] flex items-center gap-1" style={{ color: 'var(--meta-color)', opacity: 0.7 }}>
                                {addrs && (
                                    <><AddrLink addr={addrs.DukerNews} explorerBase={explorerBase} color="var(--duki-400)" /> · </>
                                )}
                                Platform operations & survivorship
                            </div>
                        </div>
                        <div className="text-right">
                            <div
                                className="text-base font-bold"
                                style={{ color: 'var(--duki-500)', fontVariantNumeric: 'tabular-nums' }}
                            >
                                {fmt(dukerNewsAmt)}
                                <span className="text-[9px] font-normal ml-1 opacity-60">{stablecoinName}</span>
                            </div>
                        </div>
                    </div>

                    {/* DUKI Treasury row */}
                    <div className="px-3 py-2.5 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--duki-coin, #c5a236)' }}>
                                ALM.WORLD DUKI Treasury · {dukiBps / 100}%
                            </div>
                            <div className="text-[9px] flex items-center gap-1" style={{ color: 'var(--meta-color)', opacity: 0.7 }}>
                                {addrs && (
                                    <><AddrLink addr={addrs.Treasury} explorerBase={explorerBase} color="rgba(129,140,248,0.5)" /> · </>
                                )}
                                Mints DUKI tokens distributed to everyone
                            </div>
                        </div>
                        <div className="text-right">
                            <div
                                className="text-base font-bold"
                                style={{ color: 'var(--duki-coin, #c5a236)', fontVariantNumeric: 'tabular-nums' }}
                            >
                                {fmt(treasuryAmt)}
                                <span className="text-[9px] font-normal ml-1 opacity-60">{stablecoinName}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Execution toggle ── */}
            {showX402 && (
                <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>
                        Execution
                        {!isHomeChain && (
                            <span className="ml-2 font-normal opacity-60">
                                (x402 only on {chainName})
                            </span>
                        )}
                    </label>
                    <div className="flex gap-1.5">
                        {([
                            ['direct', 'Direct On-chain', Wallet],
                            ['x402', 'Sponsored Gasless', Zap],
                        ] as const).map(([m, label, Icon]) => {
                            const on = method === m
                            const isDirectDisabled = m === 'direct' && (!isHomeChain || currentAmount === 0)
                            return (
                                <button key={m} type="button"
                                    onClick={() => handleMethod(m as SubmitMethod)}
                                    disabled={disabled || isDirectDisabled}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                                        on ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10'
                                            : 'border-[color:var(--border)] bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80',
                                        (disabled || isDirectDisabled) && 'opacity-50 cursor-not-allowed'
                                    )}
                                    style={{ color: on ? 'var(--foreground)' : 'var(--meta-color)' }}>
                                    <Icon size={12} /> {label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Disclaimer ── */}
            <div
                className="rounded border px-3 py-2 text-[10px] leading-relaxed"
                style={{
                    borderColor: 'var(--border)',
                    background: 'var(--muted)',
                    color: 'var(--meta-color)',
                }}
            >
                <div className="font-bold mb-0.5" style={{ color: '#eab308' }}>
                    🚧 Beta Phase
                </div>
                Duker News is under active development. Your payment will be processed on-chain,
                but processing may be incomplete or delayed. The ALM.WORLD DUKI Treasury is designed
                to distribute DUKI to the world through World ID — however, this is not yet fully tested
                and funds may get lost along the way.
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    {' '}Make a deal if you do not care. Or come back later, we are actively working on this.
                </span>
            </div>

            {/* ── Children ── */}
            {children}
        </div>
    )
}
