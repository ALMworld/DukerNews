import React from 'react'
import { getLocaleData, type FlowStrings } from './data'
import DealFlowChart from './DealFlowChart'

const P600 = 'var(--duki-600, #6d28d9)'
const P700 = 'var(--duki-700, #4c1d95)'
const P300 = 'var(--duki-300, #c4b5fd)'
const P400 = 'var(--duki-400, #a78bfa)'
const FG   = 'var(--foreground)'
const META = 'var(--meta-color)'
const TOKEN_W = 44

/* ── Inline icons (avoid lucide-react dependency) ── */

function HeartIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="#ef4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0 2.82 2.82 0 0 1 0 4l-1.9 1.79" />
        </svg>
    )
}

function HandshakeIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="#ef4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14h2" />
            <path d="m6 7-1.12-.75A2 2 0 0 0 3.43 6L2 14" />
        </svg>
    )
}

function YiSvgIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="-5 -5 100 210"
            style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}>
            <path d="M 38.62642,0.50927058 C 13.66512,4.4383596 -6.5680699,31.79403 14.66652,53.03013 C 20.64122,59.00523 40.93602,62.72853 39.39342,72.07023 C 37.01812,86.45463 17.22892,81.54523 7.6264201,83.29863 C 2.6984101,84.19853 -1.6331399,88.82243 0.37333409,94.02703 C 5.1022401,106.29323 24.38952,97.28343 31.62642,93.05863 C 32.78952,92.37963 40.92172,86.47733 41.80932,88.09263 C 43.18462,90.59553 38.01422,95.58583 36.58322,97.03013 C 29.57642,104.10223 21.11872,105.68323 12.64572,109.98623 C 10.18492,111.23523 7.0566901,113.66923 8.7128401,116.79523 C 10.84492,120.82023 17.89382,120.31923 21.62642,119.76923 C 33.85352,117.96823 43.31382,108.37823 51.62642,100.07023 C 53.64472,98.05303 60.61172,89.01933 63.81002,93.44673 C 67.04452,97.92423 58.22832,105.86223 55.45662,108.49123 C 44.30612,119.06423 30.35102,124.97323 16.62722,131.37923 C 12.73672,133.19623 6.7617801,136.69223 9.6696201,141.92223 C 12.38622,146.80723 21.21682,145.24123 25.62642,144.17023 C 40.20312,140.63023 52.69842,129.00723 62.34092,118.07023 C 63.92542,116.27323 71.89562,104.85823 74.46202,106.27723 C 80.97342,109.87623 68.97302,125.46623 66.53302,128.05523 C 50.49532,145.07423 25.32632,149.31723 11.98602,169.07023 C 7.5753301,175.60123 -4.0879399,198.85323 11.62642,199.94223 C 22.43692,200.69123 21.32042,178.80023 27.72052,172.10923 C 47.12182,151.82823 94.74812,139.78923 88.29772,103.07023 C 86.44112,92.50133 76.92552,84.10503 67.62642,79.86263 C 61.51812,77.07603 51.40602,78.12093 51.21822,69.12893 C 51.12442,64.63663 56.36032,64.77763 59.62642,63.91433 C 68.41112,61.59233 76.52482,57.32073 82.23602,50.06943 C 105.30142,20.78433 65.27782,-3.6858404 38.62642,0.50927058 M 40.62642,10.37043 C 52.34042,8.6824396 66.54062,11.42003 74.23292,21.08493 C 86.80372,36.87923 69.26662,52.72423 53.62642,54.78083 C 42.03822,56.30463 28.91852,54.13393 20.84012,45.03013 C 6.8325201,29.24433 24.46082,12.69983 40.62642,10.37043 M 62.49292,25.02163 C 57.96082,25.12373 53.37662,27.50473 48.62642,27.61503 C 43.46362,27.73483 35.59512,25.13883 30.94432,28.24923 C 27.35462,30.65003 28.89132,35.88723 31.85482,38.06173 C 36.50662,41.47493 44.14362,41.29663 49.62642,41.03013 C 54.71952,40.78253 60.55802,39.12053 63.77152,34.88193 C 65.64572,32.40983 67.88782,24.90003 62.49292,25.02163 z"
                fill="#ef4444" stroke="none" opacity="0.9" />
        </svg>
    )
}

function DukiSvgIcon({ size = 20 }: { size?: number }) {
    return (
        <img src="/favicon.svg" width={size} height={size} alt="DUKI"
            style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0, borderRadius: '50%' }} />
    )
}

/* ── Component ── */

export interface FlowDiagramProps {
    locale?: string
    className?: string
    style?: React.CSSProperties
}

export function FlowDiagram({ locale = 'en', className, style }: FlowDiagramProps) {
    const f = getLocaleData(locale).flow

    const steps = [
        { icon: <HeartIcon size={18} />,      title: f.step1Title, body: f.step1Body, tokens: null },
        { icon: <YiSvgIcon size={20} />,      title: f.step2Title, body: f.step2Body,
          tokens: [
              { label: 'DUKI', desc: f.dukiDesc },
              { label: 'ALM',  desc: f.almDesc },
          ] },
        { icon: <HandshakeIcon size={18} />,  title: f.step3Title, body: f.step3Body, tokens: null },
        { icon: <DukiSvgIcon size={20} />,    title: f.step4Title, body: f.step4Body, tokens: null },
    ]

    return (
        <div className={className} style={{ marginTop: 8, ...style }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', marginBottom: 20, color: P400 }}>
                {f.howTitle}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                        {/* Spine */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                            width: 34, flexShrink: 0 }}>
                            <div style={{
                                width: 32, height: 32, flexShrink: 0, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'color-mix(in srgb,var(--duki-700,#4c1d95) 60%,transparent)',
                                border: '1.5px solid var(--duki-600,#6d28d9)',
                            }}>
                                {step.icon}
                            </div>
                            {i < steps.length - 1 && (
                                <div style={{ width: 1.5, flex: 1, minHeight: 12, margin: '3px 0',
                                    background: 'var(--duki-700,#4c1d95)' }} />
                            )}
                        </div>

                        {/* Content */}
                        <div style={{ paddingBottom: i < steps.length - 1 ? 18 : 0, flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: FG }}>{step.title}</p>
                            <p style={{ fontSize: 12, lineHeight: 1.6, color: META }}>{step.body}</p>

                            {step.tokens && (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {step.tokens.map((t, j) => (
                                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                width: TOKEN_W, minWidth: TOKEN_W, padding: '2px 0', flexShrink: 0,
                                                fontSize: 12, fontWeight: 700, borderRadius: 4, textAlign: 'center',
                                                background: P700, color: P300, border: `1px solid ${P600}`,
                                            }}>
                                                {t.label}
                                            </span>
                                            <span style={{ fontSize: 12, color: META }}>{t.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <DealFlowChart locale={locale} />
        </div>
    )
}
