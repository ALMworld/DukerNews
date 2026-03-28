import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import DaoBaguaDiagram, { IChingDiagram, BAGUA_THEMES, BaguaSectionCard, ShaderCanvas } from '@alm/dao-bagua-diagram'
import * as m from '../paraglide/messages.js'
import { useTheme } from '../lib/theme-context'
import { useLocale } from '../lib/locale-context'
import { useUiStore } from '../utils/uiStore'
import FlowDiagram from '../components/FlowDiagram'

/* ── 易 icon — inline Yi SVG symbol (matches Bagua diagram) ── */
function YiIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="-5 -5 100 210"
            style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
        >
            <path d="M 38.62642,0.50927058 C 13.66512,4.4383596 -6.5680699,31.79403 14.66652,53.03013 C 20.64122,59.00523 40.93602,62.72853 39.39342,72.07023 C 37.01812,86.45463 17.22892,81.54523 7.6264201,83.29863 C 2.6984101,84.19853 -1.6331399,88.82243 0.37333409,94.02703 C 5.1022401,106.29323 24.38952,97.28343 31.62642,93.05863 C 32.78952,92.37963 40.92172,86.47733 41.80932,88.09263 C 43.18462,90.59553 38.01422,95.58583 36.58322,97.03013 C 29.57642,104.10223 21.11872,105.68323 12.64572,109.98623 C 10.18492,111.23523 7.0566901,113.66923 8.7128401,116.79523 C 10.84492,120.82023 17.89382,120.31923 21.62642,119.76923 C 33.85352,117.96823 43.31382,108.37823 51.62642,100.07023 C 53.64472,98.05303 60.61172,89.01933 63.81002,93.44673 C 67.04452,97.92423 58.22832,105.86223 55.45662,108.49123 C 44.30612,119.06423 30.35102,124.97323 16.62722,131.37923 C 12.73672,133.19623 6.7617801,136.69223 9.6696201,141.92223 C 12.38622,146.80723 21.21682,145.24123 25.62642,144.17023 C 40.20312,140.63023 52.69842,129.00723 62.34092,118.07023 C 63.92542,116.27323 71.89562,104.85823 74.46202,106.27723 C 80.97342,109.87623 68.97302,125.46623 66.53302,128.05523 C 50.49532,145.07423 25.32632,149.31723 11.98602,169.07023 C 7.5753301,175.60123 -4.0879399,198.85323 11.62642,199.94223 C 22.43692,200.69123 21.32042,178.80023 27.72052,172.10923 C 47.12182,151.82823 94.74812,139.78923 88.29772,103.07023 C 86.44112,92.50133 76.92552,84.10503 67.62642,79.86263 C 61.51812,77.07603 51.40602,78.12093 51.21822,69.12893 C 51.12442,64.63663 56.36032,64.77763 59.62642,63.91433 C 68.41112,61.59233 76.52482,57.32073 82.23602,50.06943 C 105.30142,20.78433 65.27782,-3.6858404 38.62642,0.50927058 M 40.62642,10.37043 C 52.34042,8.6824396 66.54062,11.42003 74.23292,21.08493 C 86.80372,36.87923 69.26662,52.72423 53.62642,54.78083 C 42.03822,56.30463 28.91852,54.13393 20.84012,45.03013 C 6.8325201,29.24433 24.46082,12.69983 40.62642,10.37043 M 62.49292,25.02163 C 57.96082,25.12373 53.37662,27.50473 48.62642,27.61503 C 43.46362,27.73483 35.59512,25.13883 30.94432,28.24923 C 27.35462,30.65003 28.89132,35.88723 31.85482,38.06173 C 36.50662,41.47493 44.14362,41.29663 49.62642,41.03013 C 54.71952,40.78253 60.55802,39.12053 63.77152,34.88193 C 65.64572,32.40983 67.88782,24.90003 62.49292,25.02163 z"
                fill="var(--accent)" stroke="none" opacity="0.9" />
        </svg>
    )
}



const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px', fontSize: 11, borderRadius: 6,
    border: '1px solid var(--border)',
    background: active ? 'var(--duki-600)' : 'var(--muted)',
    color: active ? 'var(--duki-100)' : 'var(--duki-400)',
    cursor: 'pointer', transition: 'all 0.2s',
});

export const Route = createFileRoute('/dao')({
    component: DaoPage,
})

function DaoPage() {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const { locale: appLocale } = useLocale();
    const locale = useMemo(() => appLocale.startsWith('zh') ? 'zh' : 'en', [appLocale]);

    // All diagram config from store
    const {
        zenIChingTarget, zenFocusOn,
        diagramMode: mode, toggleDiagramMode,
        curvedYao, setCurvedYao,
        hideInnerText, setHideInnerText,
        hideTaiChi, setHideTaiChi,
        showDebug, setShowDebug,
        themeIndex, setThemeIndex,
    } = useUiStore();
    const selectedKey = zenIChingTarget || '';

    // IChingDiagram mode state (local — only affects which card shows)
    const [ichingSelectedKey, setIchingSelectedKey] = useState<string>('☯');
    const handleIChingClick = (key: string) => {
        setIchingSelectedKey(key);
    };

    const handleAction = (key: string, action: string) => {
        console.log(`[DAO] Action "${action}" on key "${key}"`);
    };

    const handleItemClick = (key: string) => {
        if (/^[01]{1,3}$/.test(key) || key === '❤' || key === '☯') {
            const next = zenIChingTarget === key ? '' : key;
            zenFocusOn?.(next);
        }
    };

    return (
        <div className="min-h-[80vh] py-6 px-4">
            {/* Header */}
            <div className="mb-8 max-w-2xl mx-auto flex items-center gap-6">
                <img src="/favicon.svg" width={140} height={140} alt="DUKI" style={{ borderRadius: '50%', flexShrink: 0 }} />
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent"
                        style={{ backgroundImage: 'linear-gradient(to right, var(--primary), var(--accent), var(--primary))' }}>
                        {m.dao_title()}
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {m.dao_subtitle_before()} <YiIcon size={16} /><span style={{ fontSize: '0.8em', opacity: 0.7 }}>({m.dao_subtitle_deal()})</span> {m.dao_subtitle_after()}
                    </p>
                    <p className="text-muted-foreground text-xs mt-2 leading-relaxed">
                        <strong style={{ color: 'var(--accent)' }}>DUKI</strong>{' '}
                        <span style={{ fontStyle: 'italic', opacity: 0.8 }}>/djuːki/</span>{' '}
                        {m.dao_duki_desc()}
                    </p>
                </div>
            </div>

            {/* DUKI 如何运作 — practical overview first */}
            <div className="max-w-2xl mx-auto mb-10">
                <FlowDiagram />
            </div>

            {/* Philosophical foundation — Bagua Diagram */}
            <div className="max-w-6xl mx-auto">
                <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--duki-400, #a78bfa)' }}>
                    ☰ 哲学基础 · The Philosophy Behind
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    {/* Left: Diagram with controls overlay */}
                    <div style={{ position: 'relative' }}>
                        {/* ── Top-left: gear toggle ── */}
                        <button
                            onClick={() => setShowDebug(!showDebug)}
                            style={{
                                position: 'absolute', top: 8, left: 8, zIndex: 10,
                                width: 28, height: 28, borderRadius: '50%',
                                border: '1px solid var(--border)',
                                background: showDebug ? 'var(--duki-600)' : 'var(--muted)',
                                color: showDebug ? 'var(--duki-100)' : 'var(--duki-400)',
                                cursor: 'pointer',
                                fontSize: 14, lineHeight: '26px', textAlign: 'center',
                                padding: 0, transition: 'all 0.2s',
                            }}
                            title="Toggle debug controls"
                        >
                            ⚙
                        </button>

                        {/* ── Top-right: theme toggle ── */}
                        <button
                            onClick={() => setTheme(isDark ? 'light' : 'dark')}
                            style={{
                                position: 'absolute', top: 8, right: 8, zIndex: 10,
                                width: 28, height: 28, borderRadius: '50%',
                                border: '1px solid var(--border)',
                                background: 'var(--muted)',
                                color: 'var(--duki-400)',
                                cursor: 'pointer',
                                fontSize: 14, lineHeight: '26px', textAlign: 'center',
                                padding: 0, transition: 'all 0.2s',
                            }}
                            title={isDark ? 'Switch to light' : 'Switch to dark'}
                        >
                            {isDark ? '☀' : '🌙'}
                        </button>

                        {/* ── Debug panel (below gear) ── */}
                        {showDebug && (
                            <div style={{
                                position: 'absolute', top: 42, left: 8, zIndex: 10,
                                display: 'flex', flexDirection: 'column', gap: 4,
                            }}>
                                <button onClick={toggleDiagramMode} style={btnStyle(true)}>
                                    {mode === 'iching' ? '☯ I Ching' : '☰ Bagua'}
                                </button>
                                {mode === 'bagua' && (
                                    <>
                                        <button onClick={() => setCurvedYao(!curvedYao)} style={btnStyle(curvedYao)}>
                                            Curved: {curvedYao ? 'ON' : 'OFF'}
                                        </button>
                                        <button onClick={() => setHideInnerText(!hideInnerText)} style={btnStyle(hideInnerText)}>
                                            Yao Lines: {hideInnerText ? 'ON' : 'OFF'}
                                        </button>
                                        <button onClick={() => setHideTaiChi(!hideTaiChi)} style={btnStyle(!hideTaiChi)}>
                                            TaiChi: {hideTaiChi ? 'OFF' : 'ON'}
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setThemeIndex((themeIndex + 1) % BAGUA_THEMES.length)} style={btnStyle(true)}>
                                    Theme: {BAGUA_THEMES[themeIndex]?.name}
                                </button>
                            </div>
                        )}

                        {/* Diagram content */}
                        {mode === 'iching' ? (
                            <div style={{
                                position: 'relative', width: '100%', aspectRatio: '1',
                                borderRadius: 16, overflow: 'hidden',
                            }}>
                                <div style={{ position: 'absolute', inset: 0 }}>
                                    <ShaderCanvas bgColor={isDark ? '#1e1b4b' : '#eac3f8ff'} />
                                </div>
                                <div style={{
                                    position: 'relative', width: '100%', height: '100%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <IChingDiagram
                                        style={{ width: '50%', height: '50%' }}
                                        focusedKey={ichingSelectedKey}
                                        onItemClick={handleIChingClick}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full aspect-square">
                                <DaoBaguaDiagram
                                    className="w-full h-full"
                                    onItemClick={handleItemClick}
                                    focusedKey={selectedKey}
                                    onFocusChange={(k) => zenFocusOn?.(k)}
                                    curvedYao={curvedYao}
                                    hideInnerText={hideInnerText}
                                    hideTaiChi={hideTaiChi}
                                    colorTheme={BAGUA_THEMES[themeIndex]}
                                    isDark={isDark}
                                    showDebug={false}
                                />
                            </div>
                        )}
                    </div>

                    {/* Right: Card — aspect-square to match diagram height */}
                    <div className="w-full aspect-square overflow-hidden">
                        <BaguaSectionCard
                            selectedKey={mode === 'iching' ? ichingSelectedKey : selectedKey}
                            onAction={handleAction}
                            isDark={isDark}
                            locale={locale}
                            className="h-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
