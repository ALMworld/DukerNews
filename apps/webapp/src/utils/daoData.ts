import enJames from './dao_de_ching/James_en.json';
import frJulienDao from './dao_de_ching/Julien_fr.json';
import enLauDao from './dao_de_ching/Lau_en.json';
import enYutangDao from './dao_de_ching/Linyutang_en.json';
import enWaleyDao from './dao_de_ching/Waley_en.json';
import deWilhelmDao from './dao_de_ching/Wilhelm_de.json';
import zhDao from './dao_de_ching/zh.json';
import zhSimple from './dao_de_ching/zh_simple.json';

const rawDaoDeChing81Chapters = (zhSimple as unknown as ZhRawType[])
  .map((item, index) => {
    return {
      // title: '道德经·第' + (index + 1) + '章',
      title: item.title,
      text: item.text,
      annotatedText: item.yuanwen,
      annotation: item.zhushi,
    } as InterpretedChapter;
  });

export const rawDaoDeChing: InterpretedChapter[] =
  rawDaoDeChing81Chapters.concat([
    {
      title: '以爱为道',
      text: '分则见万物,合则归于道',
    } as InterpretedChapter,
  ]);

export interface Interpretation {
  author: string;
  chapters: InterpretedChapter[];
}

export interface InterpretedChapter {
  title: string;
  text: string;
  annotatedText?: string;
  annotation?: string;
}
export interface ZhRawType {
  title: string;
  text: string;
  yiwen: string;
  zhushi: string;
  yuanwen: string;
}

const laoziOriginalWille = {
  author: '老子',
  chapters: rawDaoDeChing81Chapters
} as Interpretation;

export const daoInterpretationMap: Record<string, Interpretation[]> = {
  zh: [laoziOriginalWille
  ],
  en: [
    // enYutangDao as unknown as Interpretation,
    enWaleyDao as unknown as Interpretation,
    enJames as unknown as Interpretation,
    enLauDao as unknown as Interpretation,
  ],
  fr: [frJulienDao as unknown as Interpretation],
  de: [deWilhelmDao as unknown as Interpretation],
};

export const intuitionMap: Record<string, Interpretation> = {
  en: enYutangDao as unknown as Interpretation,
  zh: laoziOriginalWille
}