import { create } from 'zustand'
import { emptyRelatedHexagrams, getNextHexagramByNum, getPreviousHexagramByNum, getRelatedHexagrams, RelatedHexagrams } from './iChingData'


interface UiState {
  isDark: boolean
  zenLang: string,
  zenMode: boolean
  zenIChingTarget: string
  zenYaoPosition: number
  setIsDark: (isDark: boolean) => void
  setZenLang: (zenLang: string) => void
  setZenYaoPosition: (pos: number) => void
  enterZenMode: () => void
  exitZenMode: () => void
  zenFocusOn: (target: string) => void
  relatedHexagrams: RelatedHexagrams

  // ── Diagram config ──
  diagramMode: 'iching' | 'bagua'
  curvedYao: boolean
  hideInnerText: boolean
  hideTaiChi: boolean
  showDebug: boolean
  themeIndex: number
  setDiagramMode: (mode: 'iching' | 'bagua') => void
  setCurvedYao: (v: boolean) => void
  setHideInnerText: (v: boolean) => void
  setHideTaiChi: (v: boolean) => void
  setShowDebug: (v: boolean) => void
  setThemeIndex: (i: number) => void
  toggleDiagramMode: () => void
}

export type RelatedType = "wenPrev" | "identity" | "wenNext" | "jiao" | "hu" | "cuo" | "zong" | "leibnizPrev" | "leibnizNext";
// 定义6个卦的十六进制颜色
export const guaRelatedColorMap: Record<RelatedType, string> = {
  "wenPrev": '#ef4444',  // 前卦 - 红色
  "wenNext": '#3b82f6',  // 后卦 - 蓝色
  "jiao": '#10b981',  // 交- 绿色
  "cuo": '#8b5cf6',  // 错 - 紫色
  "zong": '#ec4899',  // 综 - 粉色
  "hu": '#ccfccc',  // 互 
  "identity": '#f59e0b',        // 本卦 - 黄色
  "leibnizPrev": '#f9c74f',     // 莱布尼茨前 - 更接近identity的浅黄色
  "leibnizNext": '#b26a00',     // 莱布尼茨后 - 更接近identity的深黄色
};

export const ringGuaRelatedColorMap: Record<'identity', string> = {
  "identity": '#f59e0b',        // 本卦 - 黄色
};



export const useUiStore = create<UiState>((set) => ({
  isDark: true,
  zenLang: 'zh',
  zenMode: false,
  zenIChingTarget: '',
  zenYaoPosition: 0,
  relatedHexagrams: emptyRelatedHexagrams,

  // ── Diagram config defaults ──
  diagramMode: 'iching',
  curvedYao: false,
  hideInnerText: true,
  hideTaiChi: false,
  showDebug: false,
  themeIndex: 0,

  setIsDark: (isDark: boolean) => set({ isDark }),
  setZenLang: (zenLang: string) => set({ zenLang }),
  setZenYaoPosition: (pos: number) => set({ zenYaoPosition: pos }),
  enterZenMode: () => set({ zenMode: true }),
  exitZenMode: () => set({ zenMode: false }),
  zenFocusOn: (target: string) => {
    set({
      relatedHexagrams: calculateRelatedHexagrams(target),
      zenIChingTarget: target,
      zenYaoPosition: 0,
    })
  },

  // ── Diagram config setters ──
  setDiagramMode: (mode) => set({ diagramMode: mode }),
  setCurvedYao: (v) => set({ curvedYao: v }),
  setHideInnerText: (v) => set({ hideInnerText: v }),
  setHideTaiChi: (v) => set({ hideTaiChi: v }),
  setShowDebug: (v) => set({ showDebug: v }),
  setThemeIndex: (i) => set({ themeIndex: i }),
  toggleDiagramMode: () => set((s) => ({ diagramMode: s.diagramMode === 'iching' ? 'bagua' : 'iching' })),
}))



function calculateRelatedHexagrams(binaryString: string): RelatedHexagrams {
  if (binaryString.length !== 6) return emptyRelatedHexagrams;

  const relatedHexagrams = getRelatedHexagrams(binaryString);
  console.log(relatedHexagrams);
  return relatedHexagrams;
}
