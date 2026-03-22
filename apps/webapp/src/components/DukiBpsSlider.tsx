/**
 * DukiBpsSlider — Standalone slider for setting DUKI distribution.
 *
 * Controls the split between DukerNews (platform operations) and
 * DUKI Treasury (mint DUKI tokens for everyone).
 *
 * dukiBps = basis points (0–10000) going to DUKI Treasury.
 * Slider right = more to Treasury (higher dukiBps).
 */

export interface DukiBpsSliderProps {
    value: number              // basis points 0–10000 (DUKI Treasury share)
    onChange: (v: number) => void
    disabled?: boolean
}

export function DukiBpsSlider({ value, onChange, disabled }: DukiBpsSliderProps) {
    const treasuryPct = value / 100
    const dukerPct = (10000 - value) / 100

    // Pink (DukerNews) on left, Gold (Treasury) on right
    const sliderTrack = `linear-gradient(to right,
        #c026d3 0%, #c026d3 ${dukerPct}%,
        var(--duki-coin, #c5a236) ${dukerPct}%, var(--duki-coin, #c5a236) 100%)`

    return (
        <div
            className="rounded-xl border p-4"
            style={{
                borderColor: 'rgba(109,40,217,0.5)',
                background: 'rgba(30,27,75,0.5)',
            }}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold" style={{ color: '#e879f9' }}>
                    🏢 Duker News
                </div>
                <div
                    className="text-sm font-bold"
                    style={{ color: 'var(--duki-300)', fontVariantNumeric: 'tabular-nums' }}
                >
                    {dukerPct}% / {treasuryPct}%
                </div>
                <div className="text-xs font-semibold" style={{ color: 'var(--duki-coin, #c5a236)' }}>
                    🏛 DUKI Treasury
                </div>
            </div>

            <style>{`
                .duki-bps-slider { -webkit-appearance: none; appearance: none; width: 100%;
                    height: 6px; border-radius: 3px; outline: none; cursor: pointer; }
                .duki-bps-slider::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none;
                    width: 18px; height: 18px; border-radius: 50%;
                    background: #fff; border: 3px solid #7c3aed;
                    box-shadow: 0 0 0 3px rgba(124,58,237,0.25);
                    cursor: pointer; transition: box-shadow 0.15s;
                }
                .duki-bps-slider::-moz-range-thumb {
                    width: 18px; height: 18px; border-radius: 50%;
                    background: #fff; border: 3px solid #7c3aed;
                    box-shadow: 0 0 0 3px rgba(124,58,237,0.25); cursor: pointer;
                }
                .duki-bps-slider::-webkit-slider-thumb:hover { box-shadow: 0 0 0 5px rgba(124,58,237,0.35); }
                .duki-bps-slider:disabled { opacity: 0.5; cursor: not-allowed; }
                .duki-bps-slider:disabled::-webkit-slider-thumb { cursor: not-allowed; }
            `}</style>
            <input
                type="range"
                min="0"
                max="10000"
                step="100"
                value={10000 - value}
                onChange={(e) => {
                    const bps = 10000 - +e.target.value
                    onChange(Math.min(9900, Math.max(5000, bps)))
                }}
                disabled={disabled}
                className="duki-bps-slider"
                style={{ background: sliderTrack }}
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--meta-color)' }}>
                <span style={{ color: '#c026d3' }}>← 平台运营</span>
                <span style={{ color: 'var(--duki-coin, #c5a236)' }}>铸造 DUKI 分发给所有人 →</span>
            </div>
        </div>
    )
}
