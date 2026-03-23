import { useLocale } from '../lib/i18n'

/** Inline DUKI favicon icon (purple circle with gold D letter) */
function DukiIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" fill="none">
      <defs>
        <linearGradient id="bIcon" x1="250" y1="41" x2="250" y2="459" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7"/>
          <stop offset="1" stopColor="#7e22ce"/>
        </linearGradient>
      </defs>
      <path fillRule="evenodd" clipRule="evenodd" d="M250 475C374.264 475 475 374.264 475 250C475 125.736 374.264 25 250 25C125.736 25 25 125.736 25 250C25 374.264 125.736 475 250 475ZM250 500C388.071 500 500 388.071 500 250C500 111.929 388.071 0 250 0C111.929 0 0 111.929 0 250C0 388.071 111.929 500 250 500Z" fill="#9333ea"/>
      <circle cx="250" cy="250" r="209" fill="url(#bIcon)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M250 459C365.428 459 459 365.428 459 250C459 134.572 365.428 41 250 41C134.572 41 41 134.572 41 250C41 365.428 134.572 459 250 459ZM250 475C374.264 475 475 374.264 475 250C475 125.736 374.264 25 250 25C125.736 25 25 125.736 25 250C25 374.264 125.736 475 250 475Z" fill="#9333ea"/>
      <g transform="translate(120, 55) scale(0.35)">
        <path d="M298 950l0-30 111 0q84 0 155-27.5 71-27.5 122.5-77.5 51.5-50 80-118 28.5-68 28.5-149 0-81-28.5-149-28.5-68-80-118-51.5-50-122.5-77.5-71-27.5-155-27.5l-111 0 0-30 111 0 0 0q91 0 167 29.5 76 29.5 132 83.5 56 54 87 127.5 31 73.5 31 161.5 0 88-31 161.5-31 73.5-87 127.5-56 54-132 83.5-76 29.5-167 29.5l0 0-111 0z m-198-519l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 453l0-30 111 0q94 0 166-39 72-39 113-108.5 41-69.5 41-158.5 0-90-41-159-41-69-113-108-72-39-166-39l-111 0 0-30 111 0 0 0q103 0 182 43 79 43 124 119 45 76 45 174 0 98-45 174-45 76-124 119-79 43-182 43l0 0-111 0z m0-66l0-30 111 0q76 0 132.5-30 56.5-30 88.5-84.5 32-54.5 32-125.5 0-72-32-126-32-54-88.5-84-56.5-30-132.5-30l-111 0 0-30 111 0 0 0q84 0 148 34 64 34 100 95 36 61 36 141 0 80-36 141-36 61-100 95-64 34-148 34l0 0-111 0z m-288-321l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m90 321l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z" fill="#FFD700" stroke="#FFD700" strokeWidth="30" strokeLinejoin="round"/>
      </g>
    </svg>
  )
}

export default function DukiBanner() {
  const { t } = useLocale()

  return (
    <div style={styles.container}>
      {/* Brand row */}
      <div style={styles.brandRow}>
        <DukiIcon size={48} />
        <div>
          <h1 style={styles.title}>{t.brandName}</h1>
          <p style={styles.subtitle}>{t.brandFull}</p>
        </div>
      </div>

    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    background: 'linear-gradient(135deg, #07071a 0%, #12092a 50%, #0a1220 100%)',
    borderRadius: 'var(--radius)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    border: '1px solid rgba(147, 51, 234, 0.15)',
    position: 'relative',
    overflow: 'hidden',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: '#f0f0f8',
    margin: 0,
    lineHeight: 1,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#a78bfa',
    letterSpacing: '0.14em',
    marginTop: 4,
    textTransform: 'uppercase' as const,
  },
  divider: {
    height: 1,
    background: 'linear-gradient(to right, transparent, rgba(167,139,250,0.3), rgba(52,211,153,0.3), transparent)',
  },
  footer: {
    fontSize: 10,
    color: '#7878a0',
    letterSpacing: '0.04em',
    margin: 0,
  },
  footerLabel: {
    color: '#55556e',
  },
}
