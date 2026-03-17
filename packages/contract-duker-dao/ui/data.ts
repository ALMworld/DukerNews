/**
 * Minimal I Ching trigram data for the Bagua DAO components.
 * Subset of the full iChingData from the webapp, containing only trigram-level entries.
 */

export interface RawTrigramInfo {
    name: string;
    symbol: string;
    pinyin: string;
    comboName: string;
    gua_ci: string;
}

/** Trigram raw names keyed by binary representation */
export const iChingRawNames: Record<string, RawTrigramInfo> = {
    '111': { name: '乾', symbol: '☰', pinyin: 'Qián', comboName: 'Heaven ☰', gua_ci: '元亨利貞' },
    '110': { name: '兑', symbol: '☱', pinyin: 'Duì', comboName: 'Lake ☱', gua_ci: '亨利貞' },
    '101': { name: '离', symbol: '☲', pinyin: 'Lí', comboName: 'Fire ☲', gua_ci: '利貞亨' },
    '100': { name: '震', symbol: '☳', pinyin: 'Zhèn', comboName: 'Thunder ☳', gua_ci: '亨' },
    '011': { name: '巽', symbol: '☴', pinyin: 'Xùn', comboName: 'Wind ☴', gua_ci: '小亨' },
    '010': { name: '坎', symbol: '☵', pinyin: 'Kǎn', comboName: 'Water ☵', gua_ci: '有孚' },
    '001': { name: '艮', symbol: '☶', pinyin: 'Gèn', comboName: 'Mountain ☶', gua_ci: '艮其背' },
    '000': { name: '坤', symbol: '☷', pinyin: 'Kūn', comboName: 'Earth ☷', gua_ci: '元亨利牝馬之貞' },
};
