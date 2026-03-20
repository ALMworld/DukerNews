import React, { useState } from 'react';
import { IChingDiagram } from './IChingDiagram';
import ShaderCanvas2 from './ShaderCanvas2';
import { BaguaSectionCard } from './BaguaSectionCard';
import styles from './IChingDaoDiagram.module.scss';

export interface IChingDaoDiagramProps {
    /** Additional CSS class for the container */
    className?: string;
    /** Dark mode (default: true) */
    isDark?: boolean;
    /** Callback when a card action button is clicked */
    onAction?: (key: string, action: string) => void;
}

/**
 * Self-contained I Ching Dao Diagram with integrated info card.
 * Each part is clickable: love icon → '❤', taiji → '☯', left/right 易.
 */
export const IChingDaoDiagram: React.FC<IChingDaoDiagramProps> = ({
    className = '',
    isDark = true,
    onAction,
}) => {
    const [selectedKey, setSelectedKey] = useState<string>('❤');

    const handleItemClick = (key: string) => {
        setSelectedKey(key);
    };

    return (
        <div className={`${styles.container} ${className}`}>
            {/* Diagram with shader background */}
            <div className={styles.diagramWrap}>
                <div className={styles.diagramInner} style={{ position: 'relative' }}>
                    {/* ShaderCanvas2 background — theme aware */}
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden' }}>
                        <ShaderCanvas2 bgColor={isDark ? '#1e1b4b' : '#ede9fe'} />
                    </div>
                    {/* Taiji SVG overlay */}
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IChingDiagram
                            style={{ width: '50%', height: '50%' }}
                            focusedKey={selectedKey}
                            onItemClick={handleItemClick}
                        />
                    </div>
                </div>
            </div>

            {/* Card */}
            <div className={styles.cardWrap}>
                <BaguaSectionCard
                    selectedKey={selectedKey}
                    onAction={onAction}
                    isDark={isDark}
                />
            </div>
        </div>
    );
};

export default IChingDaoDiagram;
