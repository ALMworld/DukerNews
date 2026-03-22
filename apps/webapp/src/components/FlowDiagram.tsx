/**
 * FlowDiagram — Thin wrapper around @alm/dao-bagua-diagram's FlowDiagram.
 * Passes the current app locale as a prop.
 */
import { FlowDiagram as PackageFlowDiagram } from '@alm/dao-bagua-diagram'
import { useLocale } from '../lib/locale-context'

export default function FlowDiagram() {
    const { locale } = useLocale()
    const lang = locale.startsWith('zh') ? 'zh' : 'en'
    return <PackageFlowDiagram locale={lang} />
}
