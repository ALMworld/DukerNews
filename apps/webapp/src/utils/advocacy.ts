// @ts-ignore — external package, types may not be available locally
import type { ModernDaoStackProps } from '@doc-ui/tool-stack';
import { daoInterpretationMap, rawDaoDeChing } from './daoData';
import { iChingLocales } from './iChingData';
import { daoLoveIntuitionLocales } from './graphData';
//   "theModernDaoStack": {
//     "en":"The Modern DAO Stack",
//     "zh": "道的技术栈"
//   },
//   "theModernDaoStackDesc": {
//     "en":"The Modern DAO Stack",
//     "zh": "道的技术栈"
//   },
//   "stack1Decentralization": {
//     "en":"Decentralization",
//     "zh": "去中心化"
//   },
//   "stack1PositiveSumTrade": {
//     "en":"Positive Sum Trade In Freedom",
//     "zh": "自由正和交易"
//   },
//   "modernStack1Desc": {
//     "en":"Decentralization",
//     "zh": "去中心化"
//   },
//   "stack1TradeCompetitionDesc": {
//     "en":"Positive Sum Trade Competition",
//     "zh": "拥抱自由商业竞争，让最有能力创造爱的企业脱颖而出"
//   },
//   "stack2Decentralization": {
//     "en":"Decentralization",
//     "zh": "去中心化"
//   },
//   "stack2DecentralizationDesc": {
//     "en":"Embrace the Decentralization of Blockchain, make deal transparent, secure, and equal",
//     "zh": "拥抱去中心化的区块链，让交易更加透明、安全、平等"
//   },
//   "stack2LoveZkProof": {
//     "en":"DUKI In Action",
//     "zh": "杜康行动"
//   },
//   "stack2LoveZkProofDesc": {
//     "en":"DUKI In Action",
//     "zh": "让可验证的爱成为交易市场的指示牌"
//   }

// export type Advocacy = {
//     modernDao: string,
//     modernDaoDesc: string,
//     items: {
//         title: string,
//         desc: string,
//         icon: string,
//         linkText: string,
//         link: string,
//     }[]
// }

export const zhAdvocacy: ModernDaoStackProps = {
  modernDao: '古老智慧·当下世界',
  modernDaoDesc: '️上善若水 以易显道',
  tools: [
    {
      name: 'ZK世界公民',
      descriptions: [
        '不见可欲，使民心不乱。是以圣人之治，虚其心，实其腹；弱其志，强其骨。常使民无知无欲，使夫（fú）智者不敢为也。为无为，则无不治。',
      ],
      logo: 'zero_knowledge',
      tags: ['零知识', '隐私保护'],
      url: '/zh/tao_te_ching/chapters/03',
    },
    {
      name: '去中心化',
      descriptions: [rawDaoDeChing[16].text],
      logo: 'decentralization',
      url: '/zh/tao_te_ching/chapters/17',
      tags: ['为而不争', '区块链', '信用', '无为'],
    },
    {
      name: '易爱之道',
      descriptions: [
        '乾之用九：见群龙无首，吉。',
        '坤之用六：先迷后得主，利永贞。',
        '乾-自强不息，适者生存; 坤-厚德载物，谨慎选择。',
      ],
      logo: 'taiji',
      tags: ['易里乾坤', '资产代币化', '正和博弈'],
      url: '/zh/i_ching/hexagrams/00',
    },
    // {
    //     name: "上善若水-杜康行动",
    //     descriptions: [rawDaoDeChing[80].text],
    //     logo: "handshake",
    //     tags: ["大爱证明","营销之道", "1%利润捐赠世界"],
    //     url: "/MakeAllGreatAgainMarketing",
    // },
  ],
};


export const enAdvocacy: ModernDaoStackProps = {
  modernDao: 'Ancient Wisdom · Modern World',
  modernDaoDesc: '️The highest good is like water. Manifesting the Tao through the I Ching.',
  tools: [
    {
      name: 'ZK World Citizen',
      descriptions: [
        // This is a translation of Tao Te Ching, Chapter 3
        'Not showing what is desirable, so that the people\'s minds are not thrown into disorder. Therefore the sage governs by emptying their hearts and filling their bellies, weakening their ambitions and strengthening their bones. Always keep the people without knowledge and without desire, so that the clever ones dare not act. Act without action, and nothing will be ungoverned.',
      ],
      logo: 'zero_knowledge',
      tags: ['Zero-Knowledge', 'Privacy Protection'],
      url: '/tao_te_ching/chapters/03',
    },
    {
      name: 'Decentralization',
      // descriptions: [iChingLocales['en'][0].iChingMap['111111'].gua_ci.perspectives[0].text],
      descriptions: [daoInterpretationMap['en'][0].chapters[16].text],
      logo: 'decentralization',
      url: '/tao_te_ching/chapters/17',
      tags: ['Acting Without Contention', 'Blockchain', 'Trust', 'Wu Wei'],
    },
    {
      name: 'The Tao of Exchanging Love',
      descriptions: [
        'Qian (The Creative) - Use of Nines: A group of dragons appears without a leader. Auspicious.',
        'Kun (The Receptive) - Use of Sixes: First goes astray, then finds the master. It is beneficial to be eternally steadfast.',
        'Qian - Relentless self-strengthening, survival of the fittest; Kun - Great virtue supports all things, choose with caution.',
      ],
      logo: 'taiji',
      tags: ['The Dao of Exchanging Love', 'Asset Tokenization', 'Positive-Sum Game'],
      url: '/i_ching/hexagrams/00',
    },
    // {
    //     name: "Supreme Goodness is Like Water - Dukang Initiative",
    //     descriptions: ['[Translation of Tao Te Ching, Chapter 80]'],
    //     logo: "handshake",
    //     tags: ["Proof of Love", "The Way of Marketing", "Donating 1% of Profits to the World"],
    //     url: "/MakeAllGreatAgainMarketing",
    // },
  ],
};

export const advocacyLocales: Record<string, ModernDaoStackProps> = {
  zh: zhAdvocacy,
  en: enAdvocacy,
};
