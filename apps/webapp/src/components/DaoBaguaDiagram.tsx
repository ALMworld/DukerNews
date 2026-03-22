/**
 * Re-export wrapper: wires webapp-specific stores (useUiStore, useTheme)
 * into the standalone @alm/dao-bagua-diagram package props.
 */
import React from 'react';
import {
    DaoBaguaDiagram as DaoBaguaDiagramBase,
    BAGUA_THEMES,
} from '@alm/dao-bagua-diagram';
import type { DaoBaguaDiagramProps as BaseProps, BaguaColorTheme, GuaColorStyle } from '@alm/dao-bagua-diagram';
import { useUiStore } from '../utils/uiStore';
import { useTheme } from '../lib/theme-context';

// Re-export types and themes from the package
export { BAGUA_THEMES };
export type { BaguaColorTheme, GuaColorStyle };

type DaoBaguaDiagramProps = Omit<BaseProps, 'isDark' | 'focusedKey' | 'onFocusChange'> & {
    /** Override isDark (defaults to reading from useTheme) */
    isDark?: boolean;
    /** Override focusedKey (defaults to reading from useUiStore) */
    focusedKey?: string;
    /** Override onFocusChange (defaults to useUiStore.zenFocusOn) */
    onFocusChange?: (key: string) => void;
};

export const DaoBaguaDiagram: React.FC<DaoBaguaDiagramProps> = (props) => {
    const { resolved: currentTheme } = useTheme();
    const { zenIChingTarget, zenFocusOn } = useUiStore();

    return (
        <DaoBaguaDiagramBase
            {...props}
            isDark={props.isDark ?? (currentTheme === 'dark')}
            focusedKey={props.focusedKey ?? zenIChingTarget}
            onFocusChange={props.onFocusChange ?? zenFocusOn}
        />
    );
};

export default DaoBaguaDiagram;
