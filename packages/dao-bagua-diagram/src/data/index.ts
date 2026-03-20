import iChingRawData from './raw.json';
import zhData from './locales/zh.json';
import enData from './locales/en.json';

export const WUJI_KEY: string = '☯';

export interface LovableName {
    num: number;
    symbol: string;
    name: string;
    comboName: string;
    tname: string;
    pinyin: string;
    yong_ci?: string;
    gua_ci: string;
    yao_ci: string[];
    yinFlags: boolean[];
    binaryString: string;
    binaryNumber: number;
    decimalNumberString: string;
    geneticCode: string;
}

export const iChingRawNames: Record<string, LovableName> =
    iChingRawData as unknown as Record<string, LovableName>;

// ── Locale data ──
export interface LocaleStrings {
    title: string;
    badge: string;
    motto: string;
    mottoAttr?: string;
    description: string;
    stages?: { title: string; desc: string }[];
    stats?: { label: string; value: string }[];
    guaci?: string;
    yongci?: string;
}

export interface TrigramInfo {
    seq: number;
    role: string;
    description: string;
}

export interface FlowStrings {
    howTitle: string;
    step1Title: string; step1Body: string;
    step2Title: string; step2Body: string;
    dukiDesc: string; almDesc: string;
    step3Title: string; step3Body: string;
    step4Title: string; step4Body: string;
    stablecoin: string; treasury: string; deal: string;
    governance: string; distributed: string; goods: string;
    buyer: string; producer: string; everyone: string;
    title: string; dealToTreasury: string;
}

export interface LocaleData {
    love: LocaleStrings;
    yi: LocaleStrings;
    qian: LocaleStrings;
    kun: LocaleStrings;
    trigrams: Record<string, TrigramInfo>;
    ui: {
        joinAction: string;
        exploreAction: string;
        timeAxis: string;
        exchangeAxis: string;
    };
    flow: FlowStrings;
}

const locales: Record<string, LocaleData> = {
    zh: zhData as unknown as LocaleData,
    en: enData as unknown as LocaleData,
};

export function getLocaleData(locale: string): LocaleData {
    return locales[locale] || locales.en;
}
