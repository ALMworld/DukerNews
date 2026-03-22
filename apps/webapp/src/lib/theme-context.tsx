import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'system'

interface ThemeContextValue {
    theme: Theme
    resolved: 'dark' | 'light'
    setTheme: (t: Theme) => void
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'theme'

function getSystemTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(resolved: 'dark' | 'light') {
    const root = document.documentElement
    if (resolved === 'light') {
        root.classList.add('light')
    } else {
        root.classList.remove('light')
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'dark'
        return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark'
    })

    const resolved = theme === 'system' ? getSystemTheme() : theme

    // Apply theme class on mount and changes
    useEffect(() => {
        applyTheme(resolved)
    }, [resolved])

    // Listen for OS theme changes when set to 'system'
    useEffect(() => {
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: light)')
        const handler = () => applyTheme(getSystemTheme())
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [theme])

    const setTheme = (t: Theme) => {
        setThemeState(t)
        localStorage.setItem(STORAGE_KEY, t)
    }

    const toggleTheme = () => {
        const next = resolved === 'dark' ? 'light' : 'dark'
        setTheme(next)
    }

    return (
        <ThemeContext.Provider value={{ theme, resolved, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
    return ctx
}
