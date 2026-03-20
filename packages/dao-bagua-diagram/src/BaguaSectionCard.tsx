import React from 'react';
import { iChingRawNames, getLocaleData, type LocaleStrings } from './data';
import HalfDao from './HalfDao';
import styles from './BaguaSectionCard.module.scss';

// ── Trigram section metadata ──
const CARD_ACCENT = 'oklch(0.65 0.20 305)';


export interface BaguaSectionCardProps {
    /** Binary key of the selected trigram, e.g. "111" for Heaven */
    selectedKey: string | null;
    /** Callback when user clicks an action button. Receives the binary key and action name. */
    onAction?: (key: string, action: string) => void;
    /** Additional CSS class */
    className?: string;
    /** Dark mode (default: true) */
    isDark?: boolean;
    /** Locale for i18n content (default: 'en') */
    locale?: string;
}

// ── Shared card shell ──
const CardShell: React.FC<{
    className: string;
    borderColor: string;
    symbol: string;
    title: string;
    subtitle?: string;
    badge?: string;
    badgeBg?: string;
    badgeColor?: string;
    children: React.ReactNode;
}> = ({ className, borderColor, symbol, title, subtitle, badge, badgeBg, badgeColor, children }) => (
    <div className={className} style={{ borderTopColor: borderColor }}>
        <div className={styles.header}>
            <div className={styles.headerRow}>
                <div className={styles.headerLeft}>
                    <div className={styles.titleRow}>
                        <span className={styles.symbol}>{symbol}</span>
                        <h3 className={styles.title}>{title}</h3>
                    </div>
                    {subtitle && (
                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', opacity: 0.7, color: borderColor }}>
                            {subtitle}
                        </p>
                    )}
                    {badge && (
                        <span className={styles.badge}
                            style={{ backgroundColor: badgeBg || `${borderColor}20`, color: badgeColor || borderColor }}>
                            {badge}
                        </span>
                    )}
                </div>
            </div>
        </div>
        <div className={styles.divider} />
        <div className={styles.body}>
            {children}
        </div>
    </div>
);

// ── Philosophy card (shared by ❤, ☯, 1, 0) ──
const PhilosophyCard: React.FC<{
    cardClass: string;
    borderColor: string;
    symbol: string;
    content: LocaleStrings;
    onAction?: (key: string, action: string) => void;
    actionKey?: string;
    actionLabel?: string;
    actionGradient?: string;
    yaoSymbol?: React.ReactNode;
}> = ({ cardClass, borderColor, symbol, content, onAction, actionKey, actionLabel, actionGradient, yaoSymbol }) => (
    <CardShell
        className={cardClass}
        borderColor={borderColor}
        symbol={symbol}
        title={content.title}
        badge={content.badge}
        badgeBg={`${borderColor}20`}
        badgeColor={borderColor}
    >
        {/* Motto quote */}
        <p className={styles.quoteText} style={{ color: borderColor }}>
            {content.motto}
        </p>
        {content.mottoAttr && (
            <p className={styles.quoteAttr}>— {content.mottoAttr}</p>
        )}

        {/* Guaci / Yongci (for Qian/Kun) */}
        {content.guaci && (
            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `3px solid ${borderColor}` }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--rp-c-text-1, #f5f3ff)' }}>
                    {content.guaci}
                </p>
                {content.yongci && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--rp-c-text-2, #ddd6fe)', opacity: 0.85 }}>
                        {content.yongci}
                    </p>
                )}
            </div>
        )}

        {/* Description */}
        <p className={styles.description}>{content.description}</p>

        {/* Stages (for Qian/Kun) */}
        {content.stages && (
            <div style={{ marginBottom: 16 }}>
                {content.stages.map((stage, i) => (
                    <div key={i} style={{
                        display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start',
                    }}>
                        <span style={{
                            flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                            background: `${borderColor}30`, color: borderColor,
                            fontSize: 11, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rp-c-text-1, #f5f3ff)' }}>
                                {stage.title}
                            </span>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--rp-c-text-2, #ddd6fe)', opacity: 0.85 }}>
                                {stage.desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Stats (for Love/Yi) */}
        {content.stats && (
            <div className={styles.statsGrid}>
                {content.stats.map((stat, i) => (
                    <div key={i} className={`${styles.statItem} ${i === content.stats!.length - 1 && content.stats!.length % 2 === 1 ? styles.statSpan2 : ''}`}>
                        <p className={styles.statLabel}>{stat.label}</p>
                        <p className={styles.statValue}>{stat.value}</p>
                    </div>
                ))}
            </div>
        )}

        {/* Action button */}
        {onAction && actionKey && actionLabel && (
            <button
                onClick={() => onAction(actionKey, 'explore')}
                className={styles.actionBtn}
                style={{ background: actionGradient || `linear-gradient(135deg, ${borderColor}, ${borderColor}aa)` }}>
                {actionLabel}
            </button>
        )}
    </CardShell>
);

export const BaguaSectionCard: React.FC<BaguaSectionCardProps> = ({
    selectedKey,
    onAction,
    className = '',
    isDark = true,
    locale = 'en',
}) => {
    const i18n = getLocaleData(locale);
    const themeClass = isDark ? '' : styles.light;
    const cardClass = `${styles.card} ${themeClass} ${className}`;

    // ── ❤ Love card ──
    if (selectedKey === '❤') {
        const c = i18n.love;
        return (
            <PhilosophyCard
                cardClass={cardClass}
                borderColor="#ef4444"
                symbol="❤"
                content={c}
                onAction={onAction}
                actionKey="❤"
                actionLabel={i18n.ui.joinAction}
                actionGradient="linear-gradient(135deg, #ef4444, #ec4899)"
            />
        );
    }

    // ── ☯ Yi/Exchange card ──
    if (selectedKey === '☯') {
        const c = i18n.yi;
        return (
            <PhilosophyCard
                cardClass={cardClass}
                borderColor="#8b5cf6"
                symbol="☯"
                content={c}
                onAction={onAction}
                actionKey="☯"
                actionLabel={i18n.ui.exploreAction}
                actionGradient="linear-gradient(135deg, #8b5cf6, #6d28d9)"
            />
        );
    }

    // ── "1" Yang / Qian — HalfDao diagram ──
    if (selectedKey === '1') {
        const c = i18n.qian;
        const qianDesc = '\u4e7e\u5366\u7684\u667a\u6167\u4e0d\u6b62\u4e8e\u516d\u4e2a\u9636\u6bb5\u7684\u7ebf\u6027\u6f14\u53d8\uff0c\u5176\u7cbe\u9ad3\u5728\u4e8e\u201c\u7528\u4e5d\uff1a\u89c1\u7fa4\u9f99\u65e0\u9996\uff0c\u5409\u201d\u3002\u8fd9\u63ed\u793a\u4e86\u5546\u4e1a\u751f\u6001\u7684\u7ec8\u6781\u5f62\u6001\uff1a\u4e00\u4e2a\u5145\u5206\u7ade\u4e89\u3001\u53bb\u4e2d\u5fc3\u5316\u7684\u52a8\u6001\u7cfb\u7edf\uff0c\u6240\u6709\u4eba\u90fd\u80fd\u53d7\u76ca\u3002\u62e5\u62b1\u7269\u7ade\u5929\u62e9\u7684\u6cd5\u5219\uff0c\u8d85\u8d8a\u5bf9\u5355\u4e00\u9738\u6743\u7684\u6267\u5ff5\uff0c\u624d\u80fd\u8ba9\u6574\u4e2a\u5546\u4e1a\u751f\u6001\u751f\u751f\u4e0d\u606f\u3002';
        return (
            <CardShell
                className={cardClass}
                borderColor="#f59e0b"
                symbol={'\u2630'}
                title={c.title}
                badge={`${c.badge} \u00b7 ${c.yongci || ''}`}
                badgeBg="#f59e0b20"
                badgeColor="#f59e0b"
            >
                <HalfDao
                    lang={locale}
                    lineTitles={c.stages?.map(s => s.title) ?? []}
                    lineDescriptions={c.stages?.map(s => s.desc) ?? []}
                    hexagramName={'\u4e7e'}
                    outerTitle=""
                    outerDescription=""
                    hexgramGuaci={iChingRawNames['111111']?.gua_ci ?? ''}
                    hexgramYongci={c.yongci ?? ''}
                    hexgramDescription={qianDesc}
                    yinFlags={[false, false, false, false, false, false]}
                    xAxisLabel={i18n.ui.timeAxis}
                    yAxisLabel={i18n.ui.exchangeAxis}
                    className="w-full"
                    isDark={isDark}
                />
            </CardShell>
        );
    }

    // ── "0" Yin / Kun — HalfDao diagram ──
    if (selectedKey === '0') {
        const c = i18n.kun;
        const kunDesc = '\u5764\u5366\u7684\u667a\u6167\uff0c\u662f\u4ece\u6d88\u8d39\u8005\u7684\u89c6\u89d2\u51fa\u53d1\uff0c\u63cf\u7ed8\u4e86\u4e00\u4e2a\u660e\u667a\u7684\u6d88\u8d39\u8005\u5728\u7e41\u6742\u5e02\u573a\u4e2d\u8fdb\u884c\u9009\u62e9\u7684\u5168\u8fc7\u7a0b\u3002\u5764\u9053\u7684\u6838\u5fc3\u5728\u4e8e\u67d4\u987a\u800c\u575a\u5b9a\uff0c\u6d88\u8d39\u8005\u7684\u9009\u62e9\u672c\u8eab\u5c31\u662f\u4e00\u79cd\u529b\u91cf\u3002\u5bf9\u539a\u5fb7\u8f7d\u7269\u7684\u4f01\u4e1a\u4fdd\u6301\u5fe0\u8bda\u4e0e\u4fe1\u8d56\uff0c\u662f\u5171\u540c\u5851\u9020\u826f\u6027\u5546\u4e1a\u751f\u6001\u7684\u6700\u9ad8\u667a\u6167\u3002';
        return (
            <CardShell
                className={cardClass}
                borderColor="#3b82f6"
                symbol={'\u2637'}
                title={c.title}
                badge={`${c.badge} · ${c.yongci || ''}`}
                badgeBg="#3b82f620"
                badgeColor="#3b82f6"
            >
                <HalfDao
                    lang={locale}
                    lineTitles={c.stages?.map(s => s.title) ?? []}
                    lineDescriptions={c.stages?.map(s => s.desc) ?? []}
                    hexagramName={'\u5764'}
                    outerTitle=""
                    outerDescription=""
                    hexgramGuaci={iChingRawNames['000000']?.gua_ci ?? ''}
                    hexgramYongci={c.yongci ?? ''}
                    hexgramDescription={kunDesc}
                    yinFlags={[true, true, true, true, true, true]}
                    xAxisLabel={i18n.ui.timeAxis}
                    yAxisLabel={i18n.ui.exchangeAxis}
                    className="w-full"
                    isDark={isDark}
                />
            </CardShell>
        );
    }

    // ── Empty state ──
    if (!selectedKey || selectedKey.length !== 3) {
        return (
            <div className={cardClass}>
                <div className={styles.emptyState}>
                    <svg viewBox="0 0 48 48" className={styles.emptyIcon} fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="24" cy="24" r="20" />
                        <path d="M24 4a20 20 0 0 1 0 40" fill="currentColor" fillOpacity="0.15" />
                        <circle cx="24" cy="14" r="3" fill="currentColor" fillOpacity="0.4" />
                        <circle cx="24" cy="34" r="3" fill="currentColor" fillOpacity="0.4" />
                    </svg>
                    <p className={styles.emptyText}>
                        {locale === 'zh' ? '点击卦象查看详情' : 'Click a trigram to view details'}
                    </p>
                </div>
            </div>
        );
    }

    // ── Trigram card (3-bit keys) ──
    const rawName = iChingRawNames[selectedKey];
    const section = i18n.trigrams[selectedKey];

    if (!rawName || !section) {
        return (
            <div className={cardClass}>
                <div className={styles.emptyState}>
                    <p className={styles.emptyText}>Unknown trigram: {selectedKey}</p>
                </div>
            </div>
        );
    }

    const yaoLines = selectedKey.split('').reverse(); // bottom to top

    return (
        <div className={cardClass}
            style={{ borderTopColor: CARD_ACCENT }}>

            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <div className={styles.headerLeft}>
                        <div className={styles.titleRow}>
                            <span className={styles.symbol}>{rawName.symbol}</span>
                            <h3 className={styles.title}>{rawName.name}</h3>
                        </div>
                        <span className={styles.badge}
                            style={{ backgroundColor: CARD_ACCENT + '20', color: CARD_ACCENT }}>
                            {section.role}
                        </span>
                    </div>
                    {/* Mini yao display */}
                    <div className={styles.yaoLines}>
                        {yaoLines.map((bit, i) => (
                            <div key={i} className={styles.yaoRow}>
                                {bit === '1' ? (
                                    <div className={`${styles.yaoBar} ${styles.yaoYang}`}
                                        style={{ backgroundColor: CARD_ACCENT }} />
                                ) : (
                                    <>
                                        <div className={`${styles.yaoBar} ${styles.yaoYin}`}
                                            style={{ backgroundColor: CARD_ACCENT }} />
                                        <div className={`${styles.yaoBar} ${styles.yaoYin}`}
                                            style={{ backgroundColor: CARD_ACCENT }} />
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className={styles.divider} />

            {/* Description */}
            <div className={styles.body}>
                <p className={styles.description}>
                    {section.description}
                </p>

                {/* Stats grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <p className={styles.statLabel}>Combo</p>
                        <p className={styles.statValue}>{rawName.comboName}</p>
                    </div>
                    <div className={styles.statItem}>
                        <p className={styles.statLabel}>Pinyin</p>
                        <p className={styles.statValue}>{rawName.pinyin}</p>
                    </div>
                    <div className={`${styles.statItem} ${styles.statSpan2}`}>
                        <p className={styles.statLabel}>Gua Ci (卦辞)</p>
                        <p className={styles.statValue}>{rawName.gua_ci}</p>
                    </div>
                </div>

                {/* Action button */}
                {onAction && (
                    <button
                        onClick={() => onAction(selectedKey, 'claim')}
                        className={styles.actionBtn}
                        style={{ background: `linear-gradient(135deg, ${CARD_ACCENT}, ${CARD_ACCENT}aa)` }}>
                        Claim FairDrop
                    </button>
                )}
            </div>
        </div>
    );
};

export default BaguaSectionCard;
