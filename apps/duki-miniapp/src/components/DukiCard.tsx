import { useLocale } from '../lib/i18n'

export default function DukiCard() {
  const { t } = useLocale()

  return (
    <div style={styles.container}>
      {/* Brand row: icon + name side by side */}
      <div style={styles.brandRow}>
        <img src="/favicon.svg" alt="DUKI" width={48} height={48} style={{ borderRadius: '50%' }} />
        <h2 style={styles.brand}>{t.brandName}</h2>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* CTA */}
      <p style={styles.claimLabel}>{t.claimYour}</p>
      <p style={styles.claimMain}>{t.brandFull}</p>

      {/* Bottom divider */}
      <div style={{ ...styles.divider, width: '40%', margin: '0 auto' }} />

      {/* Advocated by */}
      <div style={styles.footerBlock}>
        <span style={styles.footerLabel}>{t.advocatedBy}</span>
        <span style={styles.footerOrg}>ALLLIVESMATTER.WORLD</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 345,
    background: 'linear-gradient(135deg, #06061a 0%, #110a28 50%, #091018 100%)',
    borderRadius: 'var(--radius)',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    border: '1px solid rgba(147, 51, 234, 0.12)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#f2f2fa',
    margin: 0,
  },
  divider: {
    width: '60%',
    height: 1,
    background: 'linear-gradient(to right, transparent, rgba(167,139,250,0.4), rgba(52,211,153,0.3), transparent)',
    margin: '4px 0',
  },
  claimLabel: {
    fontSize: 12,
    fontWeight: 400,
    color: '#b0b0cc',
    letterSpacing: '0.04em',
    margin: 0,
  },
  claimMain: {
    fontSize: 16,
    fontWeight: 700,
    background: 'linear-gradient(to right, #818cf8, #a78bfa, #34d399)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.4,
  },
  footerBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  footerLabel: {
    fontSize: 7,
    color: '#505068',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
  footerOrg: {
    fontSize: 10.5,
    fontWeight: 600,
    color: '#7878a0',
    letterSpacing: '0.06em',
  },
}
