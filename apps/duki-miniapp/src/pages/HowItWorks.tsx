import { FlowDiagram } from '@alm/dao-bagua-diagram'
import { useLocale, toDiagramLocale } from '../lib/i18n'

export default function HowItWorks() {
  const { t, locale } = useLocale()
  const diagramLocale = toDiagramLocale(locale)

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{t.howItWorksTitle}</h2>
        <p style={styles.subtitle}>{t.howItWorksSubtitle}</p>
      </div>

      {/* Flow diagram from dao-bagua-diagram package */}
      <FlowDiagram
        locale={diagramLocale}
        style={{ marginTop: 0 }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text)',
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-dim)',
    marginTop: 4,
  },
}
