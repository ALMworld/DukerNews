import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../lib/authStore'
import { useState, useEffect, useRef } from 'react'
import * as m from '../paraglide/messages.js'
import { DukiIcon } from '../components/icons'
import FlowDiagram from '../components/FlowDiagram'
import { useChainId, useSwitchChain, useAccount } from 'wagmi'
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

    // Sync username state when me loads asynchronously
    useEffect(() => {
        if (me?.username && !username) {
            setUsername(me.username)
        }
    }, [me?.username])

    // Payment value from DukiPayment (amount + method)
    const [payment, setPayment] = useState<DukiPaymentValue>({
        amount: 1, dukiBps: 9500, method: 'direct', chainId: 0,
        dukerNewsAmount: 0.05, dukiTreasuryAmount: 0.95, amountMicro: 1_000_000n,
        insufficientBalance: false,
        stablecoinAddress: '', stablecoinSymbol: 'USDT', stablecoinDecimals: 6,
    })


    // ── Debounced username availability check (3s after typing stops) ────
    const [nameTaken, setNameTaken] = useState(false)
    const [nameChecking, setNameChecking] = useState(false)
    const checkTimer = useRef<ReturnType<typeof setTimeout>>(null)

    useEffect(() => {
        const name = username.trim()
        setNameTaken(false)

        if (!name || alreadyMinted || validateName(name)) {
            setNameChecking(false)
            return
        }

        setNameChecking(true)
        if (checkTimer.current) clearTimeout(checkTimer.current)
        checkTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/users/check-name?name=${encodeURIComponent(name)}`)
                const data = await res.json() as { available: boolean }
                // Only update if name hasn't changed during the request
                if (username.trim() === name) {
                    setNameTaken(!data.available)
                }
            } catch { /* ignore */ }
            setNameChecking(false)
        }, 3000)

        return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
    }, [username, alreadyMinted])

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

        const targetChainId = payment.chainId || DEFAULT_CHAIN_ID
        if (chainId !== targetChainId) {
            try {
                await switchChainAsync({ chainId: targetChainId })
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

    // Compute disabled reason for the mint button
    const nameError = username.trim().length > 0 ? validateName(username.trim()) : ''
    const disabledReason = saving ? null
        : !username.trim() ? 'Enter a username'
            : nameError ? nameError
                : nameTaken ? `@${username.trim()} is already taken`
                    : payment.amount <= 0.01 ? 'Amount must be > 0.01 USDT'
                        : payment.insufficientBalance ? `Insufficient balance — need ${fmt(payment.amount)} USDT`
                            : null

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
                            border: `1.5px solid ${(nameError || nameTaken) ? '#ef4444' : alreadyMinted ? 'rgba(124,58,237,0.4)' : BDR}`,
                            outline: 'none',
                            cursor: alreadyMinted ? 'default' : 'text',
                            transition: 'border-color 0.15s',
                        }}
                    />
                    {nameError && (
                        <p className="text-xs text-destructive mt-1.5">{nameError}</p>
                    )}
                    {!nameError && nameTaken && (
                        <p className="text-xs text-destructive mt-1.5">@{username.trim()} is already taken</p>
                    )}
                    {!nameError && !nameTaken && nameChecking && (
                        <p className="text-xs text-muted-foreground mt-1.5">Checking availability…</p>
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
                        <p className="text-[10px] text-center text-muted-foreground">
                            {payment.method === 'x402'
                                ? 'Gasless — server pays gas via x402 protocol'
                                : 'Direct — you sign & pay gas from your wallet'}
                        </p>

                        {/* ── Mint button + Skip (same row) ── */}
                        <div className="flex gap-2 items-stretch">
                            <button type="button" onClick={handleMint}
                                disabled={saving || !!disabledReason}
                                className={`flex-1 py-3 rounded-[10px] text-[15px] font-bold tracking-wide transition-all
                                    ${disabledReason
                                        ? 'bg-muted border border-border text-muted-foreground opacity-60 cursor-not-allowed'
                                        : 'border-none text-white cursor-pointer'
                                    } ${saving ? 'cursor-wait' : ''}`}
                                style={!disabledReason ? {
                                    background: payment.method === 'x402'
                                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                        : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                } : undefined}>
                                {saving
                                    ? (stepLabel ?? m.welcome_minting())
                                    : payment.method === 'x402'
                                        ? `⚡ Gasless Mint · ${fmt(payment.amount)} USDT`
                                        : `Mint · ${fmt(payment.amount)} USDT`}
                            </button>

                            <button type="button" onClick={() => navigate({ to: '/' })}
                                className="px-3.5 rounded-[10px] text-[11px] font-medium whitespace-nowrap
                                    bg-muted/50 border border-border text-muted-foreground
                                    cursor-pointer transition-all hover:bg-muted hover:text-foreground">
                                Mint later
                            </button>
                        </div>

                        {/* ── Status/Error message area ── */}
                        {(disabledReason || error) && (
                            <p className={`text-xs text-center py-1 ${error ? 'text-destructive' : 'text-yellow-400'}`}>
                                ⚠ {error || disabledReason}
                            </p>
                        )}
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
    const { status: accountStatus } = useAccount()
    const navigate = useNavigate()
    const address = me?.ego ?? ''

    // Already has username → redirect to home
    useEffect(() => {
        if (me?.username) {
            navigate({ to: '/' })
        }
    }, [me?.username, navigate])

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
