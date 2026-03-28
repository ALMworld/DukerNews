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
import { PostKind, DukiType, ProductType, type PbPostData, PbPostDataSchema, WorksPostDataSchema } from '@repo/apidefs'
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
import { AggType, EventType, DukerTxReqSchema, EventDataSchema, PostCreatedPayloadSchema } from '@repo/apidefs'
import { DukiPayment, type DukiPaymentValue } from '../DukiPayment'
import { SubmitOnChainButton } from '../SubmitOnChainButton'
import { SectionHeader } from './SectionHeader'
import { useAppForm } from './form-context'

import {
    HeartHandshake,
    FileText,
    Zap,
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
            dukiType: DukiType.REVENUE as DukiType,
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

                                <form.AppField
                                    name="productType"
                                    children={(field) => (
                                        <field.PillField label="Product Category" tooltip="What type of product or service is this?" options={CATEGORY_OPTIONS} />
                                    )}
                                />

                                {/* DUKI Contribution — merged row */}
                                <form.Field name="dukiPercent">
                                    {(pctField) => (
                                        <form.Field name="dukiType">
                                            {(typeField) => {
                                                const pct = pctField.state.value
                                                const isRevenue = typeField.state.value === DukiType.REVENUE
                                                return (
                                                    <div title="Percentage of revenue or profit pledged to DUKI — the decentralized universal kindness initiative">
                                                        <label className="mb-0.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--meta-color)' }}>
                                                            <span className="font-medium">DUKI Contribution</span>
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
                                                            <button
                                                                type="button"
                                                                onClick={() => typeField.handleChange(DukiType.REVENUE)}
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
                                                                onClick={() => typeField.handleChange(DukiType.PROFIT)}
                                                                className={cn(
                                                                    'text-xs font-medium transition-colors',
                                                                    !isRevenue ? '' : 'line-through opacity-40'
                                                                )}
                                                                style={{ color: !isRevenue ? 'var(--duki-400)' : 'var(--meta-color)' }}
                                                            >
                                                                Profit
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            }}
                                        </form.Field>
                                    )}
                                </form.Field>

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
                                <form.AppField
                                    name="tags"
                                    children={(field) => (
                                        <field.TextField label="Tags" hint={`(max ${MAX_DISPLAY_TAGS})`} tooltip="Comma-separated tags to help categorize your project" placeholder="ai, web3, oss" />
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
