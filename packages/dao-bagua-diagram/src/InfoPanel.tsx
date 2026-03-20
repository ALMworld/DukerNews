import React from 'react';

interface LineData {
    id: string;
    t: number;
    yaoci: string;
    title: string;
    description: string;
}

export interface InfoPanelProps {
    activeNodeId: string | null;
    showAll: boolean;
    stages: LineData[];
    hexgramGuaci: string;
    hexgramYongci: string;
    hexgramDescription: string;
    /** When true, uses light-mode colors */
    isDark?: boolean;
    /** When true, show guaci content only */
    showGuaci?: boolean;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
    activeNodeId,
    showAll,
    stages,
    hexgramGuaci,
    hexgramYongci,
    hexgramDescription,
    isDark = true,
    showGuaci = false,
}) => {
    let data = { guaci: '', yongci: '', description: '' };

    if (showGuaci) {
        data = {
            guaci: hexgramGuaci,
            yongci: '',
            description: '',
        };
    } else if (showAll) {
        data = {
            guaci: hexgramYongci,
            yongci: hexgramGuaci,
            description: hexgramDescription,
        };
    } else if (activeNodeId) {
        const stageData = stages.find(s => s.id === activeNodeId);
        if (stageData) {
            data = {
                guaci: stageData.title,
                yongci: stageData.yaoci,
                description: stageData.description,
            };
        }
    }

    const bgColor = isDark ? 'rgba(30, 27, 75, 0.5)' : 'rgba(237, 233, 254, 0.6)';
    const borderColor = isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)';
    const titleColor = isDark ? '#facc15' : '#b45309';
    const textPrimary = isDark ? '#f5f3ff' : '#1e1b4b';
    const textSecondary = isDark ? '#a5b4c3' : '#4c566a';
    const accentBorder = isDark ? '#ea580c' : '#c2410c';

    return (
        <div
            style={{
                marginTop: 12,
                padding: 16,
                width: '100%',
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                transition: 'all 0.3s ease-out',
            }}
        >
            <h3 style={{
                color: titleColor,
                fontSize: '1.15rem',
                fontWeight: 700,
                marginBottom: 12,
                margin: '0 0 12px',
            }}>
                {data.guaci}
            </h3>
            {data.yongci && (
                <div style={{
                    paddingLeft: 8,
                    borderLeft: `4px solid ${accentBorder}`,
                    marginBottom: 12,
                }}>
                    <div style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: textPrimary,
                    }}>
                        {data.yongci}
                    </div>
                </div>
            )}
            <p style={{
                fontSize: '0.85rem',
                lineHeight: 1.65,
                color: textSecondary,
                margin: 0,
            }}>
                {data.description}
            </p>
        </div>
    );
};

export default InfoPanel;
