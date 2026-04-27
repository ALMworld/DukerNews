/**
 * SubmitForm — Main form for the /submit route.
 *
 * Uses TanStack Form composition pattern (useAppForm + AppField)
 * with pre-bound field components for concise field declarations.
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { create } from '@bufbuild/protobuf'
import { PostKind, DukiType, ProductType, type PbPostData, PbPostDataSchema, WorksPostDataSchema } from '@repo/dukernews-apidefs'
import {
    MAX_DISPLAY_TAGS,
    DUKI_ICONS,
    PRODUCT_ICONS,
    PRODUCT_LABELS,
    KIND_ICONS,
    KIND_LABELS,
} from '../../lib/constants'
import { useLocale, LOCALES, type SupportedLocale } from '../../lib/locale-context'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useChainHandle } from '../../client/useChainHandle'
import { AggType, EventType, DukerTxReqSchema, EventDataSchema, PostCreatedPayloadSchema } from '@repo/dukernews-apidefs'
import { DukiPayment, type DukiPaymentValue } from '../DukiPayment'
import { SubmitOnChainButton } from '../SubmitOnChainButton'
import { SectionHeader } from './SectionHeader'
import { useAppForm } from './form-context'
import { useDukigenAgent } from '../../client/useDukigenAgent'
import type { DukigenAgent } from '../../client/registry-api'
import { useChainId } from 'wagmi'
import { CHAIN_ID_TO_EID } from '../../lib/contracts'
import { useBookmarks } from '../../lib/bookmarks'

import {
    HeartHandshake,
    FileText,
    Zap,
    ExternalLink,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Boxes,
    Globe,
    Network,
    Hash,
    HeartPulse,
    Lock,
    Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubmitFormValues {
    kind: PostKind
    title: string
    url: string
    text: string
    locale: SupportedLocale
    productType: ProductType
    // productType is only for works
    dukiType: DukiType
    dukiPercent: string
    daoUrl: string
    daoContract: string
    tags: string

    // voice
}

const LANG_OPTIONS = LOCALES.map((e) => ({
    value: e.locale,
    label: `${e.flag} ${e.native}`,
}))

const KIND_OPTIONS = [
    PostKind.WORKS,
    // PostKind.VOICE,  // commented out for now
] as const

const CATEGORY_OPTIONS = [
    { value: ProductType.DIGITAL, label: <span className="flex items-center gap-1">{PRODUCT_ICONS[ProductType.DIGITAL] && (() => { const I = PRODUCT_ICONS[ProductType.DIGITAL]!; return <I size={12} />; })()}{PRODUCT_LABELS[ProductType.DIGITAL]}</span>, tooltip: 'Software, apps, SaaS, digital goods' },
    { value: ProductType.PHYSICAL, label: <span className="flex items-center gap-1">{PRODUCT_ICONS[ProductType.PHYSICAL] && (() => { const I = PRODUCT_ICONS[ProductType.PHYSICAL]!; return <I size={12} />; })()}{PRODUCT_LABELS[ProductType.PHYSICAL]}</span>, tooltip: 'Hardware, manufactured goods, physical products' },
    { value: ProductType.SERVICE, label: <span className="flex items-center gap-1">{PRODUCT_ICONS[ProductType.SERVICE] && (() => { const I = PRODUCT_ICONS[ProductType.SERVICE]!; return <I size={12} />; })()}{PRODUCT_LABELS[ProductType.SERVICE]}</span>, tooltip: 'Consulting, freelancing, professional services' },
]

const inputCls =
    'rounded border border-[color:var(--border)] text-sm px-2 py-1.5 outline-none transition-colors focus:border-[color:var(--duki-500)]'
const inputStyle: React.CSSProperties = {
    background: 'var(--input)',
    color: 'var(--foreground)',
}

export default function SubmitForm() {
    const { locale: userLocale } = useLocale()
    const { requireAuth, me } = useRequireAuth()
    const [showEn, setShowEn] = useState(false)
    const [titleEn, setTitleEn] = useState('')
    const [textEn, setTextEn] = useState('')
    const userDukiBps = typeof me?.dukiBps === 'number' ? me.dukiBps : 9900
    const [paymentValue, setPaymentValue] = useState<DukiPaymentValue>({
        amount: 0, dukiBps: userDukiBps, method: 'direct', chainId: 0,
        dukerNewsAmount: 0, dukiTreasuryAmount: 0, amountMicro: 0n,
        insufficientBalance: false,
        stablecoinAddress: '', stablecoinSymbol: 'USDT', stablecoinDecimals: 6,
    })
    const { dispatch, step, txHash, error: submitError, reset: _reset } = useChainHandle()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const chainId = useChainId()

    // ── DukiGen Agent lookup ────────────────────────────────
    const {
        agentIdInput, setAgentIdInput, loadAgent,
        agent: agentInfo, isLoading: agentLoading, error: agentError,
    } = useDukigenAgent()
    const hasAgent = !!agentInfo
    const isSubmitting = step !== 'idle' && step !== 'done'
    const isConfirming = step === 'confirming'
    const isIndexing = step === 'indexing'
    const isConfirmed = step === 'done'

    // Auto-navigate to /newest after successful submission
    useEffect(() => {
        if (isConfirmed) {
            const timer = setTimeout(async () => {
                await queryClient.invalidateQueries({
                    queryKey: ['posts'],
                    predicate: (query) => {
                        const input = (query.queryKey as [string, { sort?: string }])[1]
                        return input?.sort === 'newest'
                    },
                })
                navigate({ to: '/newest' })
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [isConfirmed, navigate, queryClient])

    const form = useAppForm({
        defaultValues: {
            kind: PostKind.WORKS,
            title: '',
            url: '',
            text: '',
            locale: userLocale,
            productType: ProductType.DIGITAL as ProductType,
            dukiType: DukiType.REVENUE_SHARE as DukiType,
            dukiPercent: '',
            daoUrl: '',
            daoContract: '',
            tags: '',
        } satisfies SubmitFormValues,
        onSubmit: async ({ value }) => {
            if (!value.title.trim()) return
            if (!requireAuth()) return

            const isWorks = value.kind === PostKind.WORKS
            let postData: PbPostData | undefined = undefined

            if (isWorks) {
                const productTags = value.tags
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean)
                    .slice(0, MAX_DISPLAY_TAGS)
                postData = create(PbPostDataSchema, {
                    payload: {
                        case: 'works',
                        value: create(WorksPostDataSchema, {
                            dukiType: value.dukiType,
                            dukiValues: value.dukiPercent
                                ? [Math.round(parseFloat(value.dukiPercent) * 100)]
                                : [],
                            daoUrl: value.daoUrl.trim(),
                            daoContractAddress: value.daoContract.trim(),
                            productTags,
                            productType: value.productType,
                        }),
                    },
                })
            }

            // Extract domain from URL
            let domain = ''
            try {
                if (value.url.trim()) domain = new URL(value.url.trim()).hostname
            } catch { /* invalid URL, ok */ }

            const amountMicro = BigInt(Math.round((paymentValue.amount ?? 0) * 1_000_000))
            const txData = create(DukerTxReqSchema, {
                aggType: AggType.POST,
                aggId: BigInt(0),
                evtType: EventType.POST_CREATED,
                paymentChain: String(paymentValue.chainId),
                paymentStablecoinAddress: paymentValue.stablecoinAddress,
                data: create(EventDataSchema, {
                    payload: {
                        case: 'postCreated',
                        value: create(PostCreatedPayloadSchema, {
                            title: value.title.trim(),
                            url: value.url.trim() || undefined,
                            text: value.text.trim() || undefined,
                            titleEn: titleEn.trim() || undefined,
                            textEn: textEn.trim() || undefined,
                            kind: value.kind,
                            locale: value.locale,
                            domain,
                            postData,
                            boostAmount: amountMicro,
                        }),
                    },
                }),
            })
            await dispatch(txData, paymentValue.method !== 'direct')
        },
    })

    // ── Inherit fields from the loaded agent ─────────────────────────────
    // When an agent is loaded, the post inherits its productType, dukiType,
    // governance URL, and current-chain deployed contract from the agent —
    // these were the visual duplicates between the agent card and the form
    // below it. The form values still get sent on submit so the post payload
    // remains complete; we just stop asking the user for things the agent
    // already declares.
    useEffect(() => {
        if (!agentInfo) return
        form.setFieldValue('productType', Number(agentInfo.productType) as ProductType)
        form.setFieldValue('dukiType', Number(agentInfo.dukiType) as DukiType)
        if (agentInfo.pledgeUrl) form.setFieldValue('daoUrl', agentInfo.pledgeUrl)
        // Pick the chainContract entry matching the user's current chain. EID
        // is what's stored on-chain, so map chainId → EID with the same table
        // the rest of the app uses.
        const currentEid = CHAIN_ID_TO_EID[chainId] ?? chainId
        const match = agentInfo.chainContracts?.find(c => Number(c.chainEid) === currentEid)
        if (match?.contractAddr) form.setFieldValue('daoContract', match.contractAddr)
    }, [agentInfo, chainId])

    return (
        <div className="py-2 px-2 sm:px-3">
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    form.handleSubmit()
                }}
                className="space-y-2 max-w-2xl"
            >
                {/* Header */}
                <h2 className="text-sm font-bold" style={{ color: 'var(--duki-200)' }}>
                    Submit something DUKERs will find interesting
                </h2>

                <SectionHeader icon={FileText} label="POST · Basic Info" />

                {/* Post type */}
                <form.AppField name="kind">
                    {(field) => (
                        <div>
                            <label className="mb-0.5 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>
                                Post Type
                            </label>
                            <div className="flex gap-1">
                                {KIND_OPTIONS.map((kind) => {
                                    const on = field.state.value === kind
                                    const I = KIND_ICONS[kind]
                                    const label = KIND_LABELS[kind]
                                    return (
                                        <button
                                            key={kind}
                                            type="button"
                                            onClick={() => field.handleChange(kind)}
                                            className={cn(
                                                'flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors',
                                                on
                                                    ? 'border-[color:var(--duki-500)] bg-[color:var(--duki-500)]/10'
                                                    : 'border-transparent bg-[color:var(--muted)] hover:bg-[color:var(--muted)]/80'
                                            )}
                                            style={{ color: on ? 'var(--foreground)' : 'var(--meta-color)' }}
                                        >
                                            {I && <I size={11} />} {label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </form.AppField>

                {/* Origin Language */}
                <form.AppField
                    name="locale"
                    children={(field) => (
                        <field.PillField label="Origin Language" tooltip="The primary language of this post's content" options={LANG_OPTIONS} />
                    )}
                />

                {/* ── Shared fields (all post types) ── */}
                <form.AppField
                    name="title"
                    children={(field) => (
                        <field.TextField label="Title" tooltip="The headline for your post — keep it clear and descriptive" placeholder="What's the story?" required />
                    )}
                />
                <form.AppField
                    name="url"
                    children={(field) => (
                        <field.TextField label="URL" hint="(leave blank for text-only)" tooltip="Link to the project, article, or resource you're sharing" placeholder="https://" type="url" />
                    )}
                />
                <form.AppField
                    name="text"
                    children={(field) => (
                        <field.TextAreaField label="Text" hint="(optional for links)" tooltip="Add context, description, or your thoughts about this submission" placeholder="Additional context…" />
                    )}
                />

                {/* ── Add English translation (non-English locales only) ── */}
                <form.Subscribe selector={(s) => s.values.locale}>
                    {(selectedLocale) =>
                        selectedLocale === 'en' ? null : (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowEn(!showEn)}
                                    className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                                    style={{ color: showEn ? 'var(--duki-400)' : 'var(--meta-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    {showEn ? '− Remove English' : '＋ Add English'}
                                </button>
                                {showEn && (
                                    <div className="mt-1 space-y-2 pl-3" style={{ borderLeft: '2px solid var(--duki-600)' }}>
                                        <div>
                                            <label className="mb-0.5 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>Title (English)</label>
                                            <input
                                                type="text"
                                                value={titleEn}
                                                onChange={(e) => setTitleEn(e.target.value)}
                                                placeholder="English title"
                                                className={inputCls + ' w-full'}
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-0.5 block text-xs font-medium" style={{ color: 'var(--meta-color)' }}>Text (English)</label>
                                            <textarea
                                                value={textEn}
                                                onChange={(e) => setTextEn(e.target.value)}
                                                placeholder="English text (optional)"
                                                rows={3}
                                                className={inputCls + ' w-full'}
                                                style={{ ...inputStyle, resize: 'both' }}
                                            />
                                        </div>
                                        <p className="text-[10px]" style={{ color: 'var(--meta-color)' }}>English translations are stored as separate fields</p>
                                    </div>
                                )}
                            </div>
                        )
                    }
                </form.Subscribe>

                {/* ── Type-specific fields ── */}
                <form.Subscribe selector={(s) => s.values.kind}>
                    {(kind) =>
                        kind !== PostKind.WORKS ? null : (
                            <>
                                <SectionHeader icon={HeartHandshake} label="DUKI · Works Details" />

                                {/* ── DukiGen Agent ID ── */}
                                <div>
                                    <label className="mb-0.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--meta-color)' }}>
                                        <Boxes size={11} />
                                        <span className="font-medium">DukiGen Agent ID</span>
                                        <span className="opacity-60">(optional)</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={agentIdInput}
                                            onChange={(e) => setAgentIdInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadAgent() } }}
                                            placeholder="e.g. 1"
                                            className={inputCls}
                                            style={{ ...inputStyle, width: '120px' }}
                                            disabled={isSubmitting || isConfirmed}
                                        />
                                        <button
                                            type="button"
                                            onClick={loadAgent}
                                            disabled={!agentIdInput.trim() || agentLoading || isSubmitting || isConfirmed}
                                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors"
                                            style={{
                                                borderColor: 'var(--border)',
                                                background: 'var(--muted)',
                                                color: 'var(--foreground)',
                                                cursor: !agentIdInput.trim() || agentLoading ? 'not-allowed' : 'pointer',
                                                opacity: !agentIdInput.trim() || agentLoading ? 0.5 : 1,
                                            }}
                                        >
                                            {agentLoading ? <Loader2 size={12} className="animate-spin" /> : 'Load'}
                                        </button>
                                        {agentInfo && <CheckCircle2 size={14} style={{ color: '#22c55e' }} />}
                                        {agentError && <AlertCircle size={14} style={{ color: '#ef4444' }} />}
                                        <a
                                            href="/market"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
                                            style={{ color: 'var(--duki-400)', marginLeft: 'auto' }}
                                        >
                                            Browse market <ExternalLink size={10} />
                                        </a>
                                    </div>

                                    {/* Agent error */}
                                    {agentError && (
                                        <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{agentError}</p>
                                    )}

                                    {/* Agent preview card (read-only) */}
                                    {agentInfo && <AgentPreviewCard agent={agentInfo} />}
                                </div>


                                {/* Product Category — only when there's no agent.
                                    With an agent loaded, productType is inherited
                                    silently and shown in the agent card above. */}
                                {!hasAgent && (
                                    <form.AppField
                                        name="productType"
                                        children={(field) => (
                                            <field.PillField label="Product Category" tooltip="What type of product or service is this?" options={CATEGORY_OPTIONS} />
                                        )}
                                    />
                                )}

                                {/* DUKI Contribution — always shown.
                                    This is post-specific (the % of *this* post's
                                    payment that goes to DUKI), distinct from the
                                    agent's indicative `approxBps` shown in the card.
                                    With an agent loaded, the Revenue/Profit toggle
                                    is hidden — that's an agent-level choice.       */}
                                <form.Field name="dukiPercent">
                                    {(pctField) => (
                                        <form.Field name="dukiType">
                                            {(typeField) => {
                                                const pct = pctField.state.value
                                                const isRevenue = typeField.state.value === DukiType.REVENUE_SHARE
                                                return (
                                                    <div title="Percentage of revenue or profit pledged to DUKI for this post — distinct from the agent's indicative default.">
                                                        <label className="mb-0.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--meta-color)' }}>
                                                            <span className="font-medium">Your DUKI Contribution</span>
                                                            {pct && (() => {
                                                                const Icon = DUKI_ICONS[typeField.state.value]
                                                                return Icon ? (
                                                                    <span className="flex items-center gap-0.5" style={{ color: 'var(--duki-400)' }}>
                                                                        <Icon size={10} />
                                                                        {pct}%
                                                                    </span>
                                                                ) : null
                                                            })()}
                                                        </label>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                max="100"
                                                                value={pctField.state.value}
                                                                onChange={(e) => pctField.handleChange(e.target.value)}
                                                                onBlur={pctField.handleBlur}
                                                                placeholder="2.5"
                                                                className={inputCls}
                                                                style={{ ...inputStyle, width: '72px' }}
                                                            />
                                                            <span className="text-xs" style={{ color: 'var(--meta-color)' }}>% of</span>
                                                            {hasAgent ? (
                                                                // Locked to agent's choice — show as a static label.
                                                                <span className="text-xs font-medium" style={{ color: 'var(--duki-400)' }}>
                                                                    {isRevenue ? 'Revenue' : 'Profit'}
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => typeField.handleChange(DukiType.REVENUE_SHARE)}
                                                                        className={cn(
                                                                            'text-xs font-medium transition-colors',
                                                                            isRevenue ? '' : 'line-through opacity-40'
                                                                        )}
                                                                        style={{ color: isRevenue ? 'var(--duki-400)' : 'var(--meta-color)' }}
                                                                    >
                                                                        Revenue
                                                                    </button>
                                                                    <span className="text-xs" style={{ color: 'var(--meta-color)' }}>/</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => typeField.handleChange(DukiType.PROFIT_SHARE)}
                                                                        className={cn(
                                                                            'text-xs font-medium transition-colors',
                                                                            !isRevenue ? '' : 'line-through opacity-40'
                                                                        )}
                                                                        style={{ color: !isRevenue ? 'var(--duki-400)' : 'var(--meta-color)' }}
                                                                    >
                                                                        Profit
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            }}
                                        </form.Field>
                                    )}
                                </form.Field>

                                {/* DAO URL + DAO contract — only when no agent.
                                    With an agent loaded these come from
                                    agentInfo.pledgeUrl and the matching entry in
                                    agentInfo.chainContracts (current chain). The
                                    sync effect populates the form values silently,
                                    so the on-chain payload still includes them. */}
                                {!hasAgent && (
                                    <>
                                        <form.AppField
                                            name="daoUrl"
                                            children={(field) => (
                                                <field.TextField label="DAO URL" hint="(project page)" tooltip="Link to the DAO or project governance page" placeholder="https://dao.example.com" type="url" />
                                            )}
                                        />
                                        <form.AppField
                                            name="daoContract"
                                            children={(field) => (
                                                <field.TextField label="DAO contract" hint="(optional)" tooltip="Smart contract address for the DAO or pledge" placeholder="0x…" />
                                            )}
                                        />
                                    </>
                                )}

                                {/* Tags — always asked at post level. Distinct from
                                    the agent record (which no longer carries tags). */}
                                <form.AppField
                                    name="tags"
                                    children={(field) => (
                                        <field.TextField label="Tags" hint={`(max ${MAX_DISPLAY_TAGS})`} tooltip="Comma-separated tags to help categorize this post" placeholder="ai, web3, oss" />
                                    )}
                                />
                            </>
                        )
                    }
                </form.Subscribe>

                {/* ── On-Chain Submit ── */}
                <div className="space-y-3 pt-1">
                    <SectionHeader icon={Zap} label="ON-CHAIN · Payment" />

                    <DukiPayment
                        dukiBps={userDukiBps}
                        amounts={[1, 2, 8, 16, 64]}
                        defaultAmount={1}
                        showX402={true}
                        disabled={isSubmitting || isConfirmed}
                        amountLabel="Marketing Boost (USDT)"
                        amountSubLabel="pay the world to pay attention"
                        onChange={setPaymentValue}
                    >
                        {/* Submit button */}
                        <div className="flex items-center gap-3 pt-1">
                            <SubmitOnChainButton
                                label={
                                    paymentValue.method === 'direct'
                                        ? `Submit On-Chain${paymentValue.amount > 0 ? ` ($${paymentValue.amount})` : ''}`
                                        : `Submit via x402${paymentValue.amount > 0 ? ` ($${paymentValue.amount})` : ''}`
                                }
                                step={step}
                                successMessage="Post submitted on-chain!"
                                type="submit"
                                disabled={isConfirmed}
                            />
                        </div>

                        {/* Tx status */}
                        {txHash && (
                            <div className="rounded border px-3 py-2 text-xs" style={{
                                borderColor: isConfirmed ? 'var(--duki-500)' : 'var(--border)',
                                background: 'var(--muted)',
                                color: 'var(--foreground)',
                            }}>
                                {(isConfirming || isIndexing) && '⏳ Confirming transaction…'}
                                {/* {isIndexing && '📡 Indexing post…'} */}
                                {isConfirmed && (
                                    <div className="space-y-1.5">
                                        <div>✅ Post submitted on-chain!</div>
                                        <Link
                                            to="/"
                                            className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                                            style={{ color: 'var(--duki-400)' }}
                                        >
                                            View newest →
                                        </Link>
                                    </div>
                                )}
                                <div className="mt-1 font-mono text-[10px] opacity-70 truncate">
                                    tx: {txHash}
                                </div>
                            </div>
                        )}

                        {submitError && (
                            <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                                {submitError}
                            </div>
                        )}
                    </DukiPayment>
                </div>
            </form>
        </div>
    )
}

// ── AgentPreviewCard ────────────────────────────────────────────────────────
// Read-only summary of the on-chain DukigenAgent the user just loaded.
//
// Layout: tight 2-row header (name+id+spec pills · "Inherited" tag), then
// per-section rows divided by a hairline. Sections are conditional — if the
// agent has no website, no row appears for it. The agent's `approxBps` is
// labeled "Avg DUKI" rather than "DUKI X%" to avoid visual collision with
// the "Your DUKI Contribution" form field below the card, which is a
// different concept (post-level contribution vs agent's indicative average).
//
// Anything shown here is *inherited* into the post payload, so we don't ask
// for it again in the form below — the parent component hides those inputs
// when an agent is loaded.

function AgentPreviewCard({ agent }: { agent: DukigenAgent }) {
    const dukiTypeLabel =
        agent.dukiType === 1 ? 'Revenue'
        : agent.dukiType === 2 ? 'Profit'
        : '—'
    const productLabel = PRODUCT_LABELS[agent.productType as ProductType] ?? 'Unknown'
    const ProductIcon = PRODUCT_ICONS[agent.productType as ProductType]
    const DukiIcon = DUKI_ICONS[agent.dukiType as DukiType]

    const META = 'var(--meta-color)'
    const FG = 'var(--foreground)'
    const ROW_DIVIDER = '1px solid color-mix(in srgb, var(--border) 60%, transparent)'

    // Bookmark toggle so users can save an agent right from /submit without
    // hopping over to /market.
    const { isBookmarked, toggle } = useBookmarks()
    const bookmarked = isBookmarked(agent.agentId)

    const Row = ({ children }: { children: React.ReactNode }) => (
        <div className="px-3 py-1.5" style={{ borderTop: ROW_DIVIDER, color: META }}>
            {children}
        </div>
    )

    // Each "property" pill below is a labeled key/value chip — the same
    // language NFT marketplaces use for token attributes — so users
    // immediately read the card as on-chain metadata, not editable form fields.
    const Prop = ({ label, value, icon, title }: {
        label: string
        value: React.ReactNode
        icon?: React.ReactNode
        title?: string
    }) => (
        <span
            title={title}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{
                fontSize: 10,
                border: `1px solid ${ROW_DIVIDER.split(' ').pop() ?? 'var(--border)'}`,
                background: 'color-mix(in srgb, var(--background) 40%, transparent)',
            }}
        >
            <span style={{ color: META, opacity: 0.65 }}>{label}</span>
            <span className="inline-flex items-center gap-1" style={{ color: FG, fontWeight: 500 }}>
                {icon}
                {value}
            </span>
        </span>
    )

    return (
        <div
            className="mt-2 overflow-hidden rounded-lg border text-xs"
            style={{ borderColor: 'var(--duki-500)', background: 'var(--muted)', color: FG }}
        >
            {/* ── Banner: this card is on-chain NFT data, not an editable form. ── */}
            {/*    Strip across the top makes the read-only framing impossible to    */}
            {/*    miss. Bookmark star on the right is the only interactive element. */}
            <div
                className="flex items-center justify-between px-3 py-1"
                style={{
                    background: 'rgba(139,92,246,0.08)',
                    borderBottom: ROW_DIVIDER,
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--duki-300)',
                }}
            >
                <span className="inline-flex items-center gap-1.5">
                    <Lock size={10} />
                    NFT properties · read-only
                </span>
                <button
                    type="button"
                    onClick={() => toggle(agent.agentId)}
                    aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this agent'}
                    title={bookmarked ? 'Remove bookmark' : 'Bookmark this agent'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, border: 'none', background: 'transparent',
                        cursor: 'pointer', color: bookmarked ? '#f59e0b' : 'var(--duki-300)',
                    }}
                >
                    <Star size={12} fill={bookmarked ? '#f59e0b' : 'transparent'} />
                </button>
            </div>

            {/* ── Header: name · #id ── */}
            <div className="px-3 py-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: FG }}>
                        {agent.name || '(unnamed)'}
                    </span>
                    <span style={{ color: META, fontSize: 10 }}>
                        #{String(agent.agentId)}
                    </span>
                </div>

                {/* ── Property chips (the "tags") — basic NFT attributes ── */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <Prop
                        label="Product"
                        icon={ProductIcon ? <ProductIcon size={10} /> : null}
                        value={productLabel}
                    />
                    <Prop
                        label="DUKI"
                        icon={DukiIcon ? <DukiIcon size={10} /> : <HeartHandshake size={10} />}
                        value={`${dukiTypeLabel} share`}
                    />
                    <Prop
                        label="Avg %"
                        icon={<HeartPulse size={10} />}
                        value={`${(agent.approxBps / 100).toFixed(1)}%`}
                        title="Agent's indicative DUKI rate (averaged across deals). Distinct from the post's DUKI Contribution below."
                    />
                </div>
            </div>

            {/* ── Website + Pledge — only the row appears if at least one is set ── */}
            {(agent.website || agent.pledgeUrl) && (
                <Row>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {agent.website && (
                            <a
                                href={agent.website}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:opacity-80 min-w-0"
                                style={{ color: 'var(--duki-400)' }}
                            >
                                <Globe size={11} className="flex-shrink-0" />
                                <span className="truncate" style={{ maxWidth: 280 }}>{stripScheme(agent.website)}</span>
                            </a>
                        )}
                        {agent.pledgeUrl && (
                            <a
                                href={agent.pledgeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:opacity-80"
                                style={{ color: 'var(--duki-400)' }}
                                title={agent.pledgeUrl}
                            >
                                <ExternalLink size={11} />
                                <span>Pledge</span>
                            </a>
                        )}
                    </div>
                </Row>
            )}

            {/* ── Agent URI + hash — collapsed into one compact row ── */}
            {agent.agentUri && (
                <Row>
                    <div className="flex items-start gap-1.5">
                        <FileText size={11} className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-mono" style={{ fontSize: 10 }} title={agent.agentUri}>
                                {agent.agentUri}
                            </div>
                            {agent.agentUriHash && (
                                <div
                                    className="truncate font-mono opacity-60 inline-flex items-center gap-1"
                                    style={{ fontSize: 9 }}
                                    title={agent.agentUriHash}
                                >
                                    <Hash size={9} />
                                    {agent.agentUriHash}
                                </div>
                            )}
                        </div>
                    </div>
                </Row>
            )}

            {/* ── Deployed contracts — chip list ── */}
            {agent.chainContracts && agent.chainContracts.length > 0 && (
                <Row>
                    <div className="flex items-start gap-1.5">
                        <Network size={11} className="mt-1 flex-shrink-0" />
                        <div className="flex flex-wrap gap-1 min-w-0">
                            {agent.chainContracts.map((c, i) => (
                                <span
                                    key={i}
                                    className="rounded-md border px-1.5 py-0.5 inline-flex items-center gap-1.5 font-mono"
                                    style={{
                                        fontSize: 9,
                                        borderColor: 'var(--border)',
                                        background: 'color-mix(in srgb, var(--background) 40%, transparent)',
                                    }}
                                    title={c.contractAddr}
                                >
                                    <span className="opacity-60">{chainLabelForEid(Number(c.chainEid))}</span>
                                    <span>{shortAddr(c.contractAddr)}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </Row>
            )}
        </div>
    )
}

// ── Card helpers ───────────────────────────────────────────────────────────

/** Strip protocol from a URL for compact display. Keeps full URL on hover. */
function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}

/** Truncate an address to `0x1234…abcd`. Returns input unchanged if too short. */
function shortAddr(addr: string): string {
    if (!addr || addr.length < 12) return addr
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Friendly label for a known LayerZero EID, falling back to "eid N". */
const EID_NAMES: Record<number, string> = {
    31337: 'Anvil',
    30101: 'Ethereum',
    30319: 'World',
    30274: 'XLayer',
    11155111: 'Sepolia',
}
function chainLabelForEid(eid: number): string {
    return EID_NAMES[eid] ?? `eid ${eid}`
}
