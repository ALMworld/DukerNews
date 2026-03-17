/**
 * Self-contained types for the Bagua DAO UI components.
 * These are extracted from the webapp to make this package standalone.
 */

/** Trigram enum matching the Solidity DukiDaoConstants SEQ values */
export enum Trigram {
    // Note: The UI uses a different ordering than the Solidity contract.
    // Heaven=1 through Earth=8 is the traditional King Wen sequence,
    // while Solidity uses SEQ_0 through SEQ_7.
    Heaven_Qian_1_ALM = 1,
    Lake_Dui_2_Nation = 2,
    Fire_Li_3_Community = 3,
    Thunder_Zhen_4_Builders = 4,
    Wind_Xun_5_Contributors = 5,
    Water_Kan_6_Investors = 6,
    Mountain_Gen_7_Maintainers = 7,
    Earth_Kun_8_Creators = 8,
}

/** Section data used by the BaguaDukiDao SVG component */
export interface Section {
    seq: number;
    bid: number; // binary id for iChing lookup
    color: string;
    opacity: number;
    id: string; // label
    arr_index: number; // 1-based position around the octagon
}

/** The 8 Bagua sections for the DAO SVG diagram */
export const BaguaSections: Section[] = [
    { seq: 0, bid: 0, color: '#5D4037', opacity: 0.5, id: 'Earth', arr_index: 1 },
    { seq: 1, bid: 1, color: '#A1887F', opacity: 0.5, id: 'Mountain', arr_index: 2 },
    { seq: 2, bid: 2, color: '#2196F3', opacity: 0.5, id: 'Water', arr_index: 3 },
    { seq: 3, bid: 3, color: '#66BB6A', opacity: 0.5, id: 'Wind', arr_index: 4 },
    { seq: 4, bid: 4, color: '#7E57C2', opacity: 0.5, id: 'Thunder', arr_index: 5 },
    { seq: 5, bid: 5, color: '#FF6B35', opacity: 0.5, id: 'Fire', arr_index: 6 },
    { seq: 6, bid: 6, color: '#26C6DA', opacity: 0.5, id: 'Lake', arr_index: 7 },
    { seq: 7, bid: 7, color: '#F5C542', opacity: 0.5, id: 'Heaven', arr_index: 8 },
];

/** Special center section for the yin-yang / DAO love symbol */
export const DualityDaoLoveSection: Section = {
    seq: -1,
    bid: -1,
    color: '#ef4444',
    opacity: 0.7,
    id: 'Love',
    arr_index: 0,
};
