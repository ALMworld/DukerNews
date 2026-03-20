// ── Main component ──
export { DaoBaguaDiagram, DaoBaguaDiagram as default } from './DaoBaguaDiagram';
export { BAGUA_THEMES } from './DaoBaguaDiagram';
export type { DaoBaguaDiagramProps, BaguaColorTheme, GuaColorStyle } from './DaoBaguaDiagram';

// ── I Ching center piece (taiji + heart + 易) ──
export { IChingDiagram, IChingDiagramGroup } from './IChingDiagram';
export type { IChingDiagramProps } from './IChingDiagram';
export { AnimatedHeartHandshake } from './AnimatedHeartHandshake';

// ── Integrated diagram + card ──
export { IChingDaoDiagram } from './IChingDaoDiagram';
export type { IChingDaoDiagramProps } from './IChingDaoDiagram';

// ── Section card ──
export { BaguaSectionCard } from './BaguaSectionCard';
export type { BaguaSectionCardProps } from './BaguaSectionCard';

// ── Half Dao (hexagram graph) ──
export { default as HalfDao, PositiveSumCompetitionGraph } from './HalfDao';

// ── Info Panel ──
export { InfoPanel } from './InfoPanel';
export type { InfoPanelProps } from './InfoPanel';

// ── Shader canvases ──
export { ShaderCanvas2 } from './ShaderCanvas2';
export { ShaderCanvas3 } from './ShaderCanvas3';
export { ShaderCanvas4 } from './ShaderCanvas4';

// ── Flow diagrams (DUKI explained) ──
export { FlowDiagram } from './FlowDiagram';
export type { FlowDiagramProps } from './FlowDiagram';
export { default as DealFlowChart } from './DealFlowChart';
export type { DealFlowChartProps } from './DealFlowChart';

// ── Locale data ──
export { getLocaleData } from './data';
export type { LocaleData, FlowStrings } from './data';
