import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { renderFormattedText } from '../lib/format-text'

export const Route = createFileRoute('/formatdoc')({
    component: FormatDocPage,
})

const SAMPLE_TEXT = `This is a *paragraph* with some *italic* text.

This is a second paragraph separated by a blank line.

Here is a code block:

  function hello() {
    return "world"
  }

A URL auto-links: https://example.com

Angle bracket URL: <https://example.com/path?q=1>

Use \\* for a literal asterisk: 5\\*3 = 15`

function FormatDocPage() {
    const [text, setText] = useState(SAMPLE_TEXT)

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'var(--page-bg)',
                overflow: 'auto',
            }}
        >
            {/* Header bar — centered like HN */}
            <div style={{ background: 'var(--duki-600)', padding: '4px 0' }}>
                <div style={{ width: '85%', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box', fontWeight: 'bold', color: 'var(--duki-100)', fontSize: '13px' }}>
                    Formatting Options
                </div>
            </div>

            {/* Centered content — same 85% width as main app */}
            <div style={{ width: '85%', margin: '0 auto', padding: '16px 0', background: 'var(--background)' }}>
                <div style={{ padding: '0 16px' }}>
                    {/* Rules */}
                    <div className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>
                        <p style={{ marginBottom: '0.7em' }}>Blank lines separate paragraphs.</p>
                        <p style={{ marginBottom: '0.7em' }}>Text surrounded by asterisks is italicized. To get a literal asterisk, use \* or **.</p>
                        <p style={{ marginBottom: '0.7em' }}>
                            Text after a blank line that is indented by two or more spaces is reproduced verbatim.
                            <br />(This is intended for code.)
                        </p>
                        <p style={{ marginBottom: '0.7em' }}>Urls become links, except in the text field of a submission.</p>
                        <p style={{ marginBottom: '0.7em' }}>If your url gets linked incorrectly, put it in &lt;angle brackets&gt; and it should work.</p>
                    </div>

                    {/* Divider */}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

                    {/* Live Preview */}
                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--meta-color)' }}>Live Preview</div>

                    <div className="text-xs mb-1" style={{ color: 'var(--meta-color)' }}>Input</div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={10}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px',
                            background: 'var(--input)',
                            color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            borderRadius: 0,
                            outline: 'none',
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: '9pt',
                        }}
                    />

                    <div className="text-xs mt-3 mb-1" style={{ color: 'var(--meta-color)' }}>Output</div>
                    <div
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px',
                            color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            minHeight: '80px',
                            fontSize: '14px',
                            lineHeight: '1.4',
                        }}
                    >
                        {renderFormattedText(text)}
                    </div>
                </div>
            </div>
        </div>
    )
}
