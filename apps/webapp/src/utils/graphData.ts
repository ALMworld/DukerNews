import enLoveIntuitions from './dao_de_ching/love_intuitions/love_intuitions_en.json';
import zhLoveIntuitions from './dao_de_ching/love_intuitions/love_intuitions_zh.json';


export type DaoLoveIntuition = {
  no: string,
  intuition: string,
}

export const daoLoveIntuitionLocales: Record<string, [DaoLoveIntuition]> = {
    // "en":enIChing,
    //@ts-ignore
    "zh": zhLoveIntuitions,
    //@ts-ignore
    "en": enLoveIntuitions,
    // "en": zhLoveIntuitions,
}
