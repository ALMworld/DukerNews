import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../lib/authStore'
import { useState, useEffect } from 'react'
import * as m from '../paraglide/messages.js'
import { DukiIcon } from '../components/icons'
import FlowDiagram from '../components/FlowDiagram'
import { useChainId, useSwitchChain, useBalance, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { DEFAULT_CHAIN_ID } from '../lib/contracts'
import { queryKeys } from '../client'
import { useChainHandle } from '../client/useChainHandle'
import { create } from '@bufbuild/protobuf'
import { AggType, EventType, DukerTxReqSchema, EventDataSchema, UserMintedPayloadSchema } from '@repo/apidefs'
import { DukiPayment, type DukiPaymentValue } from '../components/DukiPayment'
import { DukiBpsSlider } from '../components/DukiBpsSlider'
import { DukerNftPreview } from '../components/DukerNftPreview'
import { validateName } from '../lib/validateName'


export const Route = createFileRoute('/welcome')({
    component: WelcomePage,
})

// ── design tokens ──────────────────────────────────────────────────────────────
const P300 = 'var(--duki-300, #c4b5fd)'
const P700 = 'var(--duki-700, #4c1d95)'
const FG = 'var(--foreground)'
const META = 'var(--meta-color)'
const BDR = 'var(--border)'
const INP = 'var(--input)'

// Minimum ETH needed for approve+mint (generous estimate)
const MIN_GAS_WEI = BigInt(0.0001e18) // 0.0001 ETH

// ─────────────────────────────────────────────────────────────────────────────
//  MintPanel
// ─────────────────────────────────────────────────────────────────────────────
function MintPanel({ address }: { address: string }) {
    const navigate = useNavigate()
    const { me, setMe } = useAuthStore()
    const queryClient = useQueryClient()
    const chainId = useChainId()
    const { switchChainAsync } = useSwitchChain()

    const alreadyMinted = !!me?.username
    const [username, setUsername] = useState(me?.username || '')
    const [dukiBps, setDukiBps] = useState(9500)

    // Payment value from DukiPayment (amount + method)
    const [payment, setPayment] = useState<DukiPaymentValue>({
        amount: 1, dukiBps: 9500, method: 'direct', chainId: 0,
        dukerNewsAmount: 0.05, dukiTreasuryAmount: 0.95, amountMicro: 1_000_000n,
        insufficientBalance: false,
        stablecoinAddress: '', stablecoinSymbol: 'USDT', stablecoinDecimals: 6,
    })

    // Check native balance to determine path
    const { data: ethBalance } = useBalance({ address: address as `0x${string}` })
    const hasGas = ethBalance ? ethBalance.value >= MIN_GAS_WEI : false

    const fmt = (n: number) =>
        n === 0 ? '0' : n < 1 ? n.toFixed(2).replace(/\.?0+$/, '') : (+n.toFixed(3)).toString()

    // ── on-chain command dispatcher ──────────────────────────────────────────
    const { dispatch, step, txHash: mintTxHash, error, reset } = useChainHandle()

    const handleMint = async () => {
        const name = username.trim()
        reset()

        // Client-side validation (mirrors contract _validateMint)
        const nameErr = validateName(name)
        if (nameErr) return
        if (dukiBps < 5000 || dukiBps > 9900) return
        if (payment.amount < 0.01) return

        if (chainId !== DEFAULT_CHAIN_ID) {
            try {
                await switchChainAsync({ chainId: DEFAULT_CHAIN_ID })
            } catch {
                return
            }
        }

        try {
            const txData = create(DukerTxReqSchema, {
                address,
                aggType: AggType.USER,
                aggId: BigInt(0),
                evtType: EventType.USER_MINTED,
                paymentChain: String(payment.chainId),
                paymentStablecoinAddress: payment.stablecoinAddress,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'userMinted',
                        value: create(UserMintedPayloadSchema, {
                            address,
                            username: name,
                            mintAmount: payment.amountMicro,
                            dukiBps,
                        }),
                    },
                }),
            })
            const result = await dispatch(txData, payment.method === 'x402')

            // Update auth state
            if (result.authResult?.data) {
                setMe(result.authResult.data)
                queryClient.setQueryData(queryKeys.authMe(), result.authResult.data)
            } else if (me) {
                const updated = { ...me, username: name }
                setMe(updated)
                queryClient.setQueryData(queryKeys.authMe(), updated)
            }
        } catch {
            // error is already set inside dispatch
        }
    }

    const saving = step !== 'idle' && step !== 'done'
    const stepLabel = step === 'approving' ? 'Approving USDT…'
        : step === 'executing' ? (payment.method === 'x402' ? '⚡ Gasless minting…' : 'Minting on-chain…')
            : step === 'confirming' ? 'Confirming…'
                : null

    const done = alreadyMinted || step === 'done'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── NFT Preview ── */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <DukerNftPreview
                    name={username.trim()}
                    tokenId={alreadyMinted ? undefined : undefined}
                    dukiBps={dukiBps}
                    style={{ maxWidth: 260, opacity: username.trim().length >= 1 ? 1 : 0.4, transition: 'opacity 0.2s' }}
                />
            </div>

            {/* ── Username + DUKI Distribution (grouped) ── */}
            <div>
                <div className="flex items-center gap-2 py-2">
                    <span className="text-xs text-muted-foreground"> Setting</span> <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>

                {/* Username */}
                <div>
                    <label style={{
                        display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 6,
                        color: META, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                        Username
                    </label>
                    <input
                        type="text" value={username} autoFocus={!alreadyMinted}
                        readOnly={alreadyMinted}
                        onChange={e => {
                            if (alreadyMinted) return
                            const v = e.target.value
                            setUsername(v)
                        }}
                        onKeyDown={e => { if (!alreadyMinted && e.key === 'Enter') handleMint() }}
                        placeholder={m.welcome_input_placeholder()}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '11px 16px', borderRadius: 10, fontSize: 15,
                            background: alreadyMinted ? 'rgba(124,58,237,0.08)' : INP,
                            color: alreadyMinted ? P300 : FG,
                            fontFamily: 'inherit', fontWeight: alreadyMinted ? 700 : 400,
                            border: `1.5px solid ${error ? '#ef4444' : alreadyMinted ? 'rgba(124,58,237,0.4)' : BDR}`,
                            outline: 'none',
                            cursor: alreadyMinted ? 'default' : 'text',
                            transition: 'border-color 0.15s',
                        }}
                    />
                    {error && (
                        <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{error}</p>
                    )}
                </div>


                {/* DUKI Distribution */}
                <div>
                    <label style={{
                        display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, marginTop: 16,
                        color: META, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                        DUKI Distribution
                    </label>
                    {!done && (
                        <p style={{ fontSize: 11, color: META, margin: '0 0 8px', opacity: 0.7 }}>
                            Set how much of each payment goes to platform operations vs. the DUKI treasury (minted for everyone).
                        </p>
                    )}
                    <DukiBpsSlider
                        value={dukiBps}
                        onChange={setDukiBps}
                        disabled={saving || alreadyMinted}
                    />
                </div>
            </div>

            {/* ── After minted: summary + go home ── */}
            {done ? (
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--duki-400, #a78bfa)',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                    }}>
                        ✦ Minted
                    </div>
                    <div style={{ fontSize: 13, color: META, marginBottom: 16 }}>
                        Username <b style={{ color: P300 }}>@{username.trim()}</b> is now registered on-chain.
                        {mintTxHash && (
                            <div style={{ fontSize: 11, color: META, marginTop: 6, opacity: 0.7 }}>
                                TxHash: <code style={{ fontSize: 10 }}>{mintTxHash.slice(0, 10)}…{mintTxHash.slice(-8)}</code>
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={() => navigate({ to: '/' })}
                        style={{
                            padding: '12px 40px', borderRadius: 10, fontSize: 15,
                            fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                            color: '#fff',
                        }}>
                        Go Home →
                    </button>
                </div>
            ) : (
                /* ── Before minted: payment section ── */
                <>
                    {/* ── Payment section divider ── */}
                    <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">Payment</span> <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    </div>

                    <DukiPayment
                        dukiBps={dukiBps}
                        amounts={[1, 2, 8, 16, 64]}
                        defaultAmount={1}
                        showX402={true}
                        disabled={saving}
                        amountLabel="Amount (USDT)"
                        onChange={setPayment}
                        walletAddress={address}
                    >
                        {/* Gas status */}
                        <div style={{
                            textAlign: 'center', fontSize: 11, color: META,
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 6,
                        }}>
                            <span style={{
                                display: 'inline-block', width: 8, height: 8,
                                borderRadius: '50%', background: hasGas ? '#22c55e' : '#f59e0b',
                            }} />
                            {payment.method === 'x402'
                                ? '⚡ Gasless — server pays gas via x402 protocol'
                                : '🔗 Direct — you sign & pay gas from your wallet'}
                        </div>

                        <button type="button" onClick={handleMint}
                            disabled={saving || username.trim().length < 2 || payment.amount <= 0 || payment.insufficientBalance}
                            style={{
                                width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 15,
                                fontWeight: 700, cursor: saving ? 'wait' : payment.insufficientBalance ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s', letterSpacing: '0.02em',
                                ...(payment.insufficientBalance ? {
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    color: 'rgba(239,68,68,0.5)',
                                    opacity: 0.7,
                                } : {
                                    border: 'none',
                                    background: payment.amount > 0 && username.trim().length >= 2
                                        ? payment.method === 'x402'
                                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                            : 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                                        : 'rgba(109,40,217,0.3)',
                                    color: payment.amount > 0 && username.trim().length >= 2 ? '#fff' : META,
                                }),
                            }}>
                            {saving
                                ? (stepLabel ?? m.welcome_minting())
                                : payment.insufficientBalance
                                    ? `Insufficient balance — need ${fmt(payment.amount)} USDT`
                                    : payment.method === 'x402'
                                        ? `⚡ Gasless Mint · ${fmt(payment.amount)} USDT`
                                        : `Mint · ${fmt(payment.amount)} USDT`}
                        </button>

                        <div style={{ textAlign: 'center' }}>
                            <button type="button" onClick={() => navigate({ to: '/' })}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, color: META
                                }}>
                                {m.welcome_skip()}
                            </button>
                        </div>
                    </DukiPayment>
                </>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
//  WelcomePage
// ─────────────────────────────────────────────────────────────────────────────
function WelcomePage() {
    const { me, setConnectModalOpen } = useAuthStore()
    const { isConnected, status: accountStatus } = useAccount()
    const address = me?.ego ?? ''

    // Auto-open ConnectModal when authenticated but wallet truly disconnected
    // (wait for wagmi to finish reconnecting before deciding — avoids modal flash)
    useEffect(() => {
        if (address && accountStatus === 'disconnected') {
            setConnectModalOpen(true)
        }
    }, [address, accountStatus, setConnectModalOpen])

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <DukiIcon size={28} />
                <span style={{ fontSize: 20, fontWeight: 700, color: P300 }}>Duker News</span>
                <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 10px',
                    borderRadius: 99, background: P700, color: P300
                }}>DUKI</span>
            </div>

            {/* Flow explanation */}
            <FlowDiagram />

            <div style={{ borderTop: `1px solid ${BDR}`, margin: '28px 0' }} />

            {/* Mint */}
            <h1 style={{ fontSize: 22, fontWeight: 800, color: FG, marginBottom: 6 }}>
                {m.welcome_title()}
            </h1>
            <p style={{ fontSize: 14, color: META, marginBottom: 16 }}>
                {m.welcome_subtitle()}
            </p>

            {/* First-transaction callout */}
            <div style={{
                borderRadius: 10, border: '1px solid rgba(99,102,241,0.35)',
                background: 'rgba(49,46,129,0.3)', padding: '12px 16px', marginBottom: 20,
            }}>
                <div style={{
                    fontSize: 12, fontWeight: 700, color: '#818cf8',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4
                }}>
                    ✦ Your First DUKI Transaction
                </div>
                <p style={{ fontSize: 13, color: META, lineHeight: 1.6, margin: 0 }}>
                    Minting your username is your first handshake with the DUKI economy.
                    The USDT you send flows directly into the
                    🏛 <strong style={{ color: '#818cf8' }}>DUKI Treasury</strong>, where
                    the protocol mints DUKI tokens and distributes them to 🌏 <strong style={{ color: P300 }}>everyone</strong>.
                    You can also choose to direct a portion to 🏢 Duker News as platform support.
                </p>
            </div>

            <MintPanel address={address} />
        </div>
    )
}
