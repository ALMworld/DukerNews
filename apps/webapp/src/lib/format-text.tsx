/**
 * Render HN-style formatted text to React elements.
 *
 * Supported formatting:
 * - Blank lines separate paragraphs
 * - *text* renders as italic
 * - Lines indented by 2+ spaces render as code (verbatim)
 * - URLs auto-link
 * - <url> angle-bracket URLs auto-link
 * - \* for literal asterisk
 */

import React from 'react'

const URL_REGEX = /https?:\/\/[^\s<>)]+/g
const ANGLE_URL_REGEX = /<(https?:\/\/[^>]+)>/g
const ITALIC_REGEX = /(?<![\\*])\*([^*]+)\*(?!\*)/g
const ESCAPED_ASTERISK = /\\\*/g

function renderInline(text: string): React.ReactNode[] {
    // First, handle angle-bracket URLs: <http://...>
    let processed = text.replace(ANGLE_URL_REGEX, '%%LINK:$1%%')

    // Handle escaped asterisks temporarily
    processed = processed.replace(ESCAPED_ASTERISK, '%%ESCAPED_AST%%')

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let key = 0

    // Split by italic markers and URLs
    const combined = /(\*[^*]+\*|https?:\/\/[^\s<>)]+|%%LINK:[^%]+%%|%%ESCAPED_AST%%)/g
    let match: RegExpExecArray | null

    while ((match = combined.exec(processed)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
            parts.push(processed.slice(lastIndex, match.index))
        }

        const m = match[0]

        if (m === '%%ESCAPED_AST%%') {
            parts.push('*')
        } else if (m.startsWith('%%LINK:') && m.endsWith('%%')) {
            const url = m.slice(7, -2)
            parts.push(
                <a
                    key={key++}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80"
                    style={{ color: 'var(--link-color)' }}
                >
                    {url}
                </a>
            )
        } else if (m.startsWith('*') && m.endsWith('*')) {
            parts.push(<i key={key++}>{m.slice(1, -1)}</i>)
        } else if (m.match(/^https?:\/\//)) {
            parts.push(
                <a
                    key={key++}
                    href={m}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80"
                    style={{ color: 'var(--link-color)' }}
                >
                    {m}
                </a>
            )
        } else {
            parts.push(m)
        }

        lastIndex = match.index + m.length
    }

    // Add remaining text
    if (lastIndex < processed.length) {
        parts.push(processed.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
}

export function renderFormattedText(text: string): React.ReactNode {
    if (!text) return null

    const lines = text.split('\n')
    const blocks: React.ReactNode[] = []
    let currentParagraph: string[] = []
    let currentCode: string[] = []
    let key = 0

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            const content = currentParagraph.join(' ')
            blocks.push(
                <p key={key++} style={{ margin: '0 0 0.6em 0' }}>
                    {renderInline(content)}
                </p>
            )
            currentParagraph = []
        }
    }

    const flushCode = () => {
        if (currentCode.length > 0) {
            blocks.push(
                <pre
                    key={key++}
                    style={{
                        margin: '0 0 0.6em 0',
                        padding: '6px 10px',
                        background: 'var(--muted)',
                        borderRadius: '4px',
                        fontSize: '9pt',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                    }}
                >
                    {currentCode.join('\n')}
                </pre>
            )
            currentCode = []
        }
    }

    for (const line of lines) {
        const isBlank = line.trim() === ''
        const isCode = line.startsWith('  ') && !isBlank

        if (isBlank) {
            flushCode()
            flushParagraph()
        } else if (isCode) {
            flushParagraph()
            currentCode.push(line)
        } else {
            flushCode()
            currentParagraph.push(line)
        }
    }

    flushCode()
    flushParagraph()

    return <>{blocks}</>
}
