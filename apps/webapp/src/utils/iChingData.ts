// import { enIChing, zhIChing } from './iChingData';

import enIChingRichardWilhelm from './i_ching/en_richard_wilhelm.json';
import iChingRawData from './i_ching/raw.json';
import zhKzIChing from './i_ching/zh_confucius.json';
import zhDeepSeekIChing from './i_ching/zh_deepseek.json';
import type { RelatedType } from './uiStore';
import zhBagua from './bagua/zh.json';
import enBagua from './bagua/en.json';
// import {getGeneticCodeFromBinary} from './iChingUtils';

export const WUJI_KEY: string = '☯';

export interface Perspective {
  title?: string; // maybe like 文言，象辞
  text: string;
  comment: string;
}

export interface GuaInterpretation {
  perspectives: Perspective[];
}

export interface IChingGua {
  name: string;
  gua_ci: GuaInterpretation;
  lines: GuaInterpretation[];
  yong_ci?: GuaInterpretation;
}

//  "gua_ci": "蛊：元亨，利涉大川。先甲三日，后甲三日。",
//       "name": "蛊",
//       "symbol": "䷑",
//       "yao_ci": [
//         "初六：干父之蛊，有子，考无咎，厉终吉。",
//         "九二：干母之蛊，不可贞。",
//         "九三：干父之蛊，小有悔，无大咎。",
//         "六四：裕父之蛊，往见吝。",
//         "六五：干父之蛊，用誉。",
//         "上九：不事王侯，高尚其事。"
//       ]

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
  lines: Perspective[];
}

export const iChingRawNames: Record<string, LovableName> =
  iChingRawData as unknown as Record<string, LovableName>;

// { [key: string]: IChing }
// export type IChingDaoMap = { [key: string]: IChingDao };

export type IChingInterpretation = {
  author: string;
  iChingMap: Record<string, IChingGua>;
};

export const iChingLocales: Record<string, IChingInterpretation[]> = {
  // "en":enIChing,
  zh: [
    zhDeepSeekIChing as unknown as IChingInterpretation,
    zhKzIChing as unknown as IChingInterpretation,
  ],
  en: [
    // enIChing as unknown as IChingInterpretation,
    enIChingRichardWilhelm as unknown as IChingInterpretation
  ],
};

export const baguaLocaleMap: Record<string, Record<string,GuaInterpretation>> = {
  zh: zhBagua as unknown as Record<string,GuaInterpretation>,
  en: enBagua as unknown as Record<string,GuaInterpretation>,
}


const numToBinaryStringMap: Record<number, string> = Object.entries(
  iChingRawNames,
)
  .filter(([key, value]) => key.length > 3)
  .reduce(
    (acc, [key, value]) => {
      acc[value.num] = key;
      return acc;
    },
    {} as Record<number, string>,
  );

// 64周期计算函数
/**
 * 根据文王卦序，获取下一个卦象的二进制字符串。
 * @param binaryString - 当前卦象的6位二进制字符串。
 * @returns 下一个卦象的二进制字符串。
 */
export function getNextHexagramByNum(binaryString: string): string {
  // 使用反向映射 O(1) 复杂度找到当前序号
  const currentNum = iChingRawNames[binaryString].num;
  if (currentNum === undefined) return binaryString;

  const nextNum = currentNum === 64 ? 1 : currentNum + 1;

  // 使用正向映射 O(1) 复杂度找到下一个二进制串
  return numToBinaryStringMap[nextNum] || binaryString;
}

/**
 * 根据文王卦序，获取上一个卦象的二进制字符串。
 * @param binaryString - 当前卦象的6位二进制字符串。
 * @returns 上一个卦象的二进制字符串。
 */
export function getPreviousHexagramByNum(binaryString: string): string {
  const currentNum = iChingRawNames[binaryString].num;
  if (currentNum === undefined) return binaryString;

  const prevNum = currentNum === 1 ? 64 : currentNum - 1;

  return numToBinaryStringMap[prevNum] || binaryString;
}

export type RelatedHexagrams = {
  identity: string;
  zong: string; // 综卦 - flip 180 degree
  hu: string;// 互卦 - 取二、三、四爻组成新下卦，取三、四、五爻组成新上卦。 
  jiao: string; // 交卦 - 上下交换位置
  cuo: string; // 错卦 - 取反
  wenPrev: string;
  wenNext: string;
  leibnizPrev: string;
  leibnizNext: string;
  relatedValueMap: Record<string, RelatedType>;
};
export const emptyRelatedHexagrams: RelatedHexagrams = {
  identity: '',
  zong: '',
  hu: '',
  jiao: '',
  cuo: '',
  wenPrev: '',
  wenNext: '',
  leibnizPrev: '',
  leibnizNext: '',
  relatedValueMap: {},
};
/**
 * 获取一个卦象所有相关的变卦。
 *
 * @param binaryString - 代表卦象的6位二进制字符串。
 *   约定: 字符串从左到右代表爻位从下到上。
 *   binaryString[0] = 初爻 (Line 1)
 *   binaryString[5] = 上爻 (Line 6)
 *
 * @returns 一个包含所有相关卦象二进制字符串的对象，或在输入无效时返回null。
 */
export function getRelatedHexagrams(binaryString: string): RelatedHexagrams {
  if (!/^[01]{6}$/.test(binaryString)) {
    console.error(
      "Invalid binary string input. Must be 6 characters of '0' or '1'.",
    );
    return emptyRelatedHexagrams;
  }

  const s = binaryString;
  // --- 1. 综卦 (Zong Gua / 倒置卦) ---
  // 将原卦象上下颠倒。在字符串上，即 L1<->L6, L2<->L5, L3<->L4。
  // 这相当于直接反转字符串。
  const zong = s.split('').reverse().join('');

  // --- 2. 错卦 (Cuo Gua / 反对卦) ---
  // 将原卦象的每一爻都变为相反的爻（阳变阴，阴变阳）。
  const cuo = s
    .split('')
    .map(bit => (bit === '1' ? '0' : '1'))
    .join('');

  // --- 3. 互卦 (Jiao/Hu Gua) ---
  // 由原卦的内层爻组成新的卦。取二、三、四爻组成新下卦，取三、四、五爻组成新上卦。 [2, 3, 7]
  // 假设二进制字符串从左到右代表从上到下（第6爻到第1爻）。
  // s[0]=line6, s[1]=line5, s[2]=line4, s[3]=line3, s[4]=line2, s[5]=line1
  const lowerNuclearTrigram = s[4] + s[3] + s[2]; // 由原卦的2、3、4爻组成
  const upperNuclearTrigram = s[3] + s[2] + s[1]; // 由原卦的3、4、5爻组成
  const hu = upperNuclearTrigram + lowerNuclearTrigram;

  // --- 4. 交卦 (Jiao Gua) ---
  // 将原卦象的上下卦交换位置。注意跟综卦的区别。 上下卦交换位置。
  // 定义：将本卦的上卦（外卦）与下卦（内卦）的位置互相交换所形成的新卦。[8]
  const jiao = s.slice(3) + s.slice(0, 3);

  // --- 4. 文王卦序 (King Wen Sequence) ---
  // 这部分依赖于 iChingRawNames 的数据结构，函数本身无需修改。
  const wenPrev = getPreviousHexagramByNum(s);
  const wenNext = getNextHexagramByNum(s);

  // --- 5. 莱布尼茨/伏羲卦序 (Leibniz/Fu Xi Sequence) ---
  // 这是基于二进制的自然顺序（先天八卦序）。 [1]
  const currentLeibnizNum = parseInt(binaryString, 2);

  const nextLeibnizNum = (currentLeibnizNum + 1) % 64;
  const leibnizNext = nextLeibnizNum.toString(2).padStart(6, '0');

  const prevLeibnizNum = (currentLeibnizNum - 1 + 64) % 64;
  const leibnizPrev = prevLeibnizNum.toString(2).padStart(6, '0');

  return {
    identity: binaryString,
    zong,
    jiao,
    cuo,
    hu,
    wenPrev,
    wenNext,
    leibnizPrev,
    leibnizNext,
    relatedValueMap: {
      [binaryString]: 'identity',
      [zong]: 'zong',
      [jiao]: 'jiao',
      [cuo]: 'cuo',
      [hu]: 'hu',
      [wenPrev]: 'wenPrev',
      [wenNext]: 'wenNext',
      [leibnizPrev]: 'leibnizPrev',
      [leibnizNext]: 'leibnizNext',
    },
  };
}
