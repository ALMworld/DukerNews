import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { iChingRawNames } from './data';
import { InfoPanel } from './InfoPanel';

interface LineData {
  id: string;
  t: number;
  yaoci: string;
  title: string;
  description: string;
}

interface HalfDaoProps {
  lang: string;
  lineTitles: string[];
  lineDescriptions: string[];
  yinFlags?: boolean[];
  hexagramName: string;
  outerTitle: string;
  outerDescription: string;

  hexgramGuaci: string;
  hexgramYongci: string;
  hexgramDescription: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  className?: string;
  isDark?: boolean;
}

// Custom hook to generate line data
const useLineData = (
  lang: string,
  lineTitles: string[],
  lineDescriptions: string[],
  binaryString: string,
): LineData[] => {
  return useMemo(() => {
    const tValues = [-5, -3, -1, 1, 3, 5];
    const rawEntry = iChingRawNames[binaryString];
    const rawLines: string[] = rawEntry?.yao_ci ?? [];

    return lineTitles.map((title, index) => ({
      id: `node-${index + 1}`,
      t: tValues[index] || 0,
      yaoci: rawLines[index] || '',
      title,
      description: lineDescriptions[index] || '',
    }));
  }, [lineTitles, lineDescriptions, binaryString, lang]);
};

// Helper functions
const sigmoid = (t: number): number => {
  return 1 / (1 + Math.exp(-t));
};

const mapValue = (
  val: number,
  in1: number,
  in2: number,
  out1: number,
  out2: number,
): number => {
  return ((val - in1) * (out2 - out1)) / (in2 - in1) + out1;
};

const calculateNodePosition = (
  t: number,
  width: number,
  height: number,
): { x: number; y: number } => {
  const margin = { top: 20, right: 20, bottom: 30, left: 48 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  // Vertical padding so the curve doesn't start from y=0 or reach the very top
  const yPad = chartHeight * 0.12;

  const x = mapValue(t, -6, 6, margin.left, chartWidth + margin.left);
  // Shift sigmoid inflection 1.5 units right so curve stays flat through hexagram area
  const sigmoidValue = sigmoid(t - 1.5);
  const y = mapValue(
    sigmoidValue,
    0,
    1,
    chartHeight + margin.top - yPad,
    margin.top + yPad,
  );
  return { x, y };
};

interface ChartNodeProps {
  stage: LineData;
  position: { x: number; y: number };
  isActive: boolean;
  onTap: () => void;
}

const ChartNode: React.FC<ChartNodeProps> = ({
  stage,
  position,
  isActive,
  onTap,
}) => {
  const radius = isActive ? 10 : 7;
  const titleColor = isActive ? '#f1c40f' : 'var(--rp-c-text-1, #ecf0f1)';
  const dotColor = isActive ? '#f1c40f' : 'var(--rp-c-text-1, #2c3e50)';

  const titleOffset = stage.id === 'node-1'
    ? { x: 0, y: -(radius + 8) }
    : { x: 0, y: radius + 18 };

  return (
    <>
      <circle
        cx={position.x}
        cy={position.y}
        r={radius}
        fill={dotColor}
        onClick={onTap}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={position.x + titleOffset.x}
        y={position.y + titleOffset.y}
        fill={titleColor}
        fontSize="14"
        fontWeight="bold"
        textAnchor="middle"
        onClick={onTap}
        style={{ cursor: 'pointer' }}
      >
        {stage.title}
      </text>
    </>
  );
};

interface HexagramProps {
  width: number;
  height: number;
  activeNodeId: string | null;
  showAll: boolean;
  onNodeTap: (nodeId: string) => void;
  onTitleTap: () => void;
  onGuaciTap: () => void;
  hexagramName: string;
  stages: LineData[];
  yinFlags?: boolean[];
  guaci?: string;
  showGuaci?: boolean;
}

const Hexagram: React.FC<HexagramProps> = ({
  width,
  height,
  activeNodeId,
  showAll,
  onNodeTap,
  onTitleTap,
  onGuaciTap,
  hexagramName,
  stages,
  yinFlags = [],
  guaci,
  showGuaci = false,
}) => {
  const hexagramX = 60;
  const yaoHeight = 8;
  const yaoWidth = 60;
  const yaoGap = 18;
  const titleY = 42;
  const reversedStages = [...stages].reverse();

  return (
    <g>
      <text
        x={hexagramX}
        y={titleY}
        fill={showGuaci ? '#f1c40f' : 'var(--rp-c-text-1, #ecf0f1)'}
        fontSize="28"
        fontWeight="bold"
        onClick={onGuaciTap}
        style={{ cursor: 'pointer' }}
      >
        {hexagramName}
      </text>
      {guaci && (
        <text
          x={hexagramX + 40}
          y={titleY}
          fill={showGuaci ? '#f1c40f' : 'var(--rp-c-text-2, #9ca3af)'}
          fontSize="13"
          onClick={onGuaciTap}
          style={{ cursor: 'pointer' }}
        >
          {guaci}
        </text>
      )}
      {reversedStages.map((stage, i) => {
        const yPos = titleY + 30 + i * yaoGap;
        const isActive = activeNodeId === stage.id;
        const lineColor = isActive ? '#e67e22' : 'var(--rp-c-text-1, #2c3e50)';
        const isYin = yinFlags[stages.length - 1 - i]; // Reverse index for yinFlags

        return (
          <g
            key={stage.id}
            onClick={() => onNodeTap(stage.id)}
            style={{ cursor: 'pointer' }}
          >
            {isYin ? (
              // Broken line (yin)
              <>
                <rect
                  x={hexagramX}
                  y={yPos}
                  width={yaoWidth * 0.4}
                  height={yaoHeight}
                  fill={lineColor}
                />
                <rect
                  x={hexagramX + yaoWidth * 0.6}
                  y={yPos}
                  width={yaoWidth * 0.4}
                  height={yaoHeight}
                  fill={lineColor}
                />
              </>
            ) : (
              // Solid line (yang)
              <rect
                x={hexagramX}
                y={yPos}
                width={yaoWidth}
                height={yaoHeight}
                fill={lineColor}
              />
            )}
            <text
              x={hexagramX + yaoWidth + 8}
              y={yPos + yaoHeight / 2 + 4}
              fill={isActive ? '#f1c40f' : 'var(--rp-c-text-3, #bdc3c7)'}
              fontSize="11"
              fontWeight={isActive ? 'bold' : 'normal'}
            >
              {/* {stage.yaoci.split('：')[0]} */}
              {stage.yaoci}
            </text>
          </g>
        );
      })}
    </g>
  );
};




interface PositiveSumCompetitionGraphProps {
  className?: string;
  stages: LineData[];
  outerTitle: string;
  outerDescription: string;
  hexagramName: string;
  yinFlags?: boolean[];
  hexgramGuaci: string;
  hexgramYongci: string;
  hexgramDescription: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  isDark?: boolean;
}

export function PositiveSumCompetitionGraph({
  className,
  stages,
  outerTitle,
  outerDescription,
  hexagramName,
  hexgramGuaci,
  hexgramYongci,
  hexgramDescription,
  yAxisLabel = '竞争强度',
  xAxisLabel = '时间',
  yinFlags = [],
  isDark = true,
}: PositiveSumCompetitionGraphProps) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [showGuaci, setShowGuaci] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 240 });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width || 320, height: rect.height || 280 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeTap = (nodeId: string) => {
    if (activeNodeId === nodeId) {
      setActiveNodeId(null);
      setShowAll(true);
      setShowGuaci(false);
    } else {
      setActiveNodeId(nodeId);
      setShowAll(false);
      setShowGuaci(false);
    }
  };

  const handleTitleTap = () => {
    setShowAll(true);
    setShowGuaci(false);
    setActiveNodeId(null);
  };

  const handleGuaciTap = () => {
    setShowGuaci(!showGuaci);
    setShowAll(false);
    setActiveNodeId(null);
  };

  const { width, height } = dimensions;
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };

  // Generate S-curve path
  const generateCurvePath = () => {
    const points: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = mapValue(i, 0, 100, -6, 6);
      const pos = calculateNodePosition(t, width, height);
      points.push(`${i === 0 ? 'M' : 'L'} ${pos.x} ${pos.y}`);
    }
    return points.join(' ');
  };

  const isEmbedded = !outerTitle;

  return (
    <div
      className={`w-full ${isEmbedded ? '' : 'p-3 bg-[var(--rp-home-feature-bg)] border border-transparent rounded-lg'} transition-all duration-300 ${className || ''}`}
    >
      {/* Header — hidden when embedded */}
      {!isEmbedded && (
        <div className="text-center mb-5">
          <h2 className="bg-gradient-to-br from-yellow-400 to-orange-500 bg-clip-text text-transparent text-lg font-bold tracking-wide leading-relaxed mb-1.5">
            {outerTitle}
          </h2>
          <p
            className="text-xs leading-relaxed tracking-wide px-3"
            style={{ color: 'var(--rp-c-text-2, #9ca3af)' }}
          >
            {outerDescription}
          </p>
        </div>
      )}

      {/* Chart */}
      <div className={isEmbedded ? 'aspect-[4/3]' : 'aspect-[320/280]'}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ overflow: 'visible' }}
        >
          {/* Axes */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={height - margin.bottom}
            stroke="var(--rp-c-text-2, #7f8c8d)"
            strokeWidth="1.5"
          />
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            stroke="var(--rp-c-text-2, #7f8c8d)"
            strokeWidth="1.5"
          />

          {/* S-curve */}
          <path
            d={generateCurvePath()}
            fill="none"
            stroke="#3498db"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Hexagram */}
          <Hexagram
            width={width}
            height={height}
            activeNodeId={activeNodeId}
            showAll={showAll}
            onNodeTap={handleNodeTap}
            onTitleTap={handleTitleTap}
            onGuaciTap={handleGuaciTap}
            hexagramName={hexagramName}
            stages={stages}
            yinFlags={yinFlags}
            guaci={hexgramGuaci}
            showGuaci={showGuaci}
          />

          {/* Chart nodes */}
          {stages.map(stage => {
            const pos = calculateNodePosition(stage.t, width, height);
            const isActive = stage.id === activeNodeId;
            return (
              <ChartNode
                key={stage.id}
                stage={stage}
                position={pos}
                isActive={isActive}
                onTap={() => handleNodeTap(stage.id)}
              />
            );
          })}

          {/* Axis labels */}
          <text
            x="15"
            y={margin.top + 60}
            fill="var(--rp-c-text-2, #7f8c8d)"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90, 15, ${margin.top + 60})`}
          >
            {yAxisLabel}
          </text>
          <text
            x={width / 2}
            y={height - margin.bottom + 30}
            fill="var(--rp-c-text-2, #7f8c8d)"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            {xAxisLabel}
          </text>
        </svg>
      </div>

      {/* Info Panel */}
      <InfoPanel
        activeNodeId={activeNodeId}
        showAll={showAll}
        showGuaci={showGuaci}
        stages={stages}
        hexgramGuaci={hexgramGuaci}
        hexgramYongci={hexgramYongci}
        hexgramDescription={hexgramDescription}
        isDark={isDark}
      />
    </div>
  );
}

const HalfDao: React.FC<HalfDaoProps> = ({
  lang,
  lineTitles,
  lineDescriptions,
  hexagramName,
  outerTitle,
  outerDescription,
  hexgramGuaci,
  hexgramYongci,
  hexgramDescription,
  yAxisLabel,
  xAxisLabel,
  yinFlags,
  className,
  isDark = true,
}) => {
  const binaryString = yinFlags?.map(yin => (yin ? '0' : '1')).join('') || '';
  const stages = useLineData(lang, lineTitles, lineDescriptions, binaryString);

  return (
    <section className="relative flex flex-col justify-center  w-full">
      <div className="w-full max-w-full px-3">
        {/* <div className="flex items-center flex-col mb-8">
          <h1 className="text-[var(--rp-c-text-1)] font-bold text-3xl mt-16 sm:text-5xl sm:leading-none text-center">
            {t('yinyangTitle')}
          </h1>
          <p className="text-[var(--rp-c-text-2)] mt-8 mb-5 mx-6 text-center text-lg max-w-4xl">
            {t('yinyangDesc')}
          </p>
        </div> */}
        <PositiveSumCompetitionGraph
          className={className}
          stages={stages}
          outerTitle={outerTitle}
          outerDescription={outerDescription}
          hexgramGuaci={hexgramGuaci}
          hexgramYongci={hexgramYongci}
          hexgramDescription={hexgramDescription}
          hexagramName={hexagramName}
          yAxisLabel={yAxisLabel}
          xAxisLabel={xAxisLabel}
          yinFlags={yinFlags}
          isDark={isDark}
        />
      </div>
    </section>
  );
};

export default HalfDao;
