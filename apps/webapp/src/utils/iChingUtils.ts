export type TextType = 'NAME' | 'SYMBOL' | '';

export interface Section {
    id: string;
    bid: string;
    ch_symbol: string;
    cn_seq: number;
    arr_index: number;
    seq: number;
    percentage: number;
    color: string;
    opacity: number;
    title?: string;
    description?: string;
    target?: string;
}


export enum Trigram {
    Heaven_Qian_1_ALM, // 1 ☰ Qian - Heaven/Sky suggest 2.5%
    Lake_Dui_2_Nation, // 2 ☱ Dui - Lake/Marsh  suggest 2.5% . (no more than 5% total, need compete with others who do not give; maybe a fitness loss if kindness do not begets kindness)
    Fire_Li_3_Community, //3 ☲ Li - Fire, Community, Currently has Lottery, currently be like marketing
    Thunder_Zhen_4_Builders, //4 ☳ Zhen - Thunder, Other Creators That Are Building for Duki in Action
    Wind_Xun_5_Contributors, //5 ☴ Xun - Wind/Wood, Contributors
    Water_Kan_6_Investors, // 6  ☵ Kan - Water, investors
    Mountain_Gen_7_Maintainers, // 7 ☶ Gen - Mountain, creators, #may need pay taxes
    Earth_Kun_8_Creators // 8 ☷ Kun - Earth, survival and existence, sin,

}

export function getGeneticCodeFromBinary(binary: string) {
    if (binary.length === 0) {
        return '️❤️';
    }
    if (binary.length == 1 || binary.length == 3) {
        //  ignore it, have no idea yet
        return ""
    }

    const mapping = {
        "00": 'U', // Uracil (RNA equivalent of Thymine)
        "01": 'C', // Cytosine
        "10": 'G', // Guanine
        "11": 'A', // Adenine
    }
    const grouped = binary.match(/.{1,2}/g);
    //@ts-ignore
    return grouped.map(group => mapping[group]).join('');
}


