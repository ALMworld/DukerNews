import React from 'react';
import { iChingRawNames } from './data';
import { Trigram } from './types';

const CARD_ACCENT = 'oklch(0.65 0.20 305)';

const trigramSections: Record<string, {
    seq: number;
    role: string;
    color: string;
    description: string;
}> = {
    '111': { seq: Trigram.Heaven_Qian_1_ALM, role: 'ALM Foundation', color: CARD_ACCENT, description: 'Core foundation driving the vision of universal kindness and All Lives Matter.' },
    '110': { seq: Trigram.Lake_Dui_2_Nation, role: 'Nation Partners', color: CARD_ACCENT, description: 'National-level partnerships and governance allocation for ecological impact.' },
    '101': { seq: Trigram.Fire_Li_3_Community, role: 'Community', color: CARD_ACCENT, description: 'Community engagement, marketing, and lottery-based fair distribution.' },
    '100': { seq: Trigram.Thunder_Zhen_4_Builders, role: 'Builders', color: CARD_ACCENT, description: 'Creators and builders constructing tools and infrastructure for DUKI in Action.' },
    '011': { seq: Trigram.Wind_Xun_5_Contributors, role: 'Contributors', color: CARD_ACCENT, description: 'Open-source contributors, translators, and volunteers supporting the ecosystem.' },
    '010': { seq: Trigram.Water_Kan_6_Investors, role: 'Investors', color: CARD_ACCENT, description: 'Mission-aligned investors providing capital for sustainable growth.' },
    '001': { seq: Trigram.Mountain_Gen_7_Maintainers, role: 'Maintainers', color: CARD_ACCENT, description: 'Long-term maintainers ensuring the protocol\'s reliability and evolution.' },
    '000': { seq: Trigram.Earth_Kun_8_Creators, role: 'Creators', color: CARD_ACCENT, description: 'Content creators, artists, and storytellers spreading the message of kindness.' },
};

export interface BaguaSectionCardProps {
    selectedKey: string | null;
    onAction?: (key: string, action: string) => void;
    className?: string;
}

export const BaguaSectionCard: React.FC<BaguaSectionCardProps> = ({
    selectedKey,
    onAction,
    className = '',
}) => {
    if (selectedKey === '❤') {
        return (
            <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}
                style={{ borderTopColor: '#ef4444', borderTopWidth: '2px' }}>
                <div className="p-5 pb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">❤</span>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">易 · Love</h3>
                            <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full"
                                style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                                Universal Kindness
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mx-5 border-t border-border" />
                <div className="p-5 pt-3 flex-1 flex flex-col">
                    <p className="text-2xl font-serif text-center mb-3 tracking-wider" style={{ color: 'var(--destructive)' }}>
                        兼相爱，交相利
                    </p>
                    <p className="text-muted-foreground text-xs text-center mb-4 italic">
                        — 墨子 · Mozi
                    </p>
                    <p className="text-secondary-foreground text-sm leading-relaxed mb-4">
                        Universal love and mutual benefit — the philosophical heart of DUKI.
                        Love all without distinction, benefit each other without reservation.
                        This is the Dao (道) that binds the eight trigrams together.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-muted-foreground text-xs mb-0.5">Philosophy</p>
                            <p className="text-foreground text-sm font-medium">兼爱 (Jiān Ài)</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-muted-foreground text-xs mb-0.5">Principle</p>
                            <p className="text-foreground text-sm font-medium">交利 (Jiāo Lì)</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                            <p className="text-muted-foreground text-xs mb-0.5">DUKI Mission</p>
                            <p className="text-foreground text-sm font-medium leading-snug">
                                Decentralized Universal Kindness Income — fair distribution through the wisdom of the I Ching.
                            </p>
                        </div>
                    </div>
                    {onAction && (
                        <button
                            onClick={() => onAction('❤', 'love')}
                            className="w-full mt-auto py-2.5 rounded-xl text-sm font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                            style={{ background: 'linear-gradient(135deg, #ef4444, #ec4899)' }}>
                            Join the Movement
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (!selectedKey || selectedKey.length !== 3) {
        return (
            <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col ${className}`}>
                <div className="flex flex-col items-center justify-center flex-1 min-h-[280px] text-muted-foreground">
                    <svg viewBox="0 0 48 48" className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="24" cy="24" r="20" />
                        <path d="M24 4a20 20 0 0 1 0 40" fill="currentColor" fillOpacity="0.15" />
                        <circle cx="24" cy="14" r="3" fill="currentColor" fillOpacity="0.4" />
                        <circle cx="24" cy="34" r="3" fill="currentColor" fillOpacity="0.4" />
                    </svg>
                    <p className="text-sm">Click a trigram to view details</p>
                </div>
            </div>
        );
    }

    const rawName = iChingRawNames[selectedKey];
    const section = trigramSections[selectedKey];

    if (!rawName || !section) {
        return (
            <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col ${className}`}>
                <p className="text-muted-foreground text-sm">Unknown trigram: {selectedKey}</p>
            </div>
        );
    }

    const yaoLines = selectedKey.split('').reverse();

    return (
        <div className={`rounded-2xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}
            style={{ borderTopColor: section.color, borderTopWidth: '2px' }}>

            <div className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{rawName.symbol}</span>
                            <h3 className="text-xl font-bold text-foreground truncate">{rawName.name}</h3>
                        </div>
                        <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full"
                            style={{ backgroundColor: section.color + '20', color: section.color }}>
                            {section.role}
                        </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 pt-1">
                        {yaoLines.map((bit, i) => (
                            <div key={i} className="flex gap-0.5">
                                {bit === '1' ? (
                                    <div className="h-[3px] rounded-full" style={{ width: 24, backgroundColor: section.color }} />
                                ) : (
                                    <>
                                        <div className="h-[3px] rounded-full" style={{ width: 10, backgroundColor: section.color }} />
                                        <div className="h-[3px] rounded-full" style={{ width: 10, backgroundColor: section.color }} />
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-5 border-t border-border" />

            <div className="p-5 pt-3 flex-1 flex flex-col">
                <p className="text-secondary-foreground text-sm leading-relaxed mb-4">
                    {section.description}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-muted-foreground text-xs mb-0.5">Combo</p>
                        <p className="text-foreground text-sm font-medium">{rawName.comboName}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-muted-foreground text-xs mb-0.5">Pinyin</p>
                        <p className="text-foreground text-sm font-medium">{rawName.pinyin}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                        <p className="text-muted-foreground text-xs mb-0.5">Gua Ci (卦辞)</p>
                        <p className="text-foreground text-sm font-medium leading-snug">{rawName.gua_ci}</p>
                    </div>
                </div>

                {onAction && (
                    <button
                        onClick={() => onAction(selectedKey, 'claim')}
                        className="w-full mt-auto py-2.5 rounded-xl text-sm font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                        style={{ background: `linear-gradient(135deg, ${section.color}, ${section.color}aa)` }}>
                        Claim FairDrop
                    </button>
                )}
            </div>
        </div>
    );
};

export default BaguaSectionCard;
