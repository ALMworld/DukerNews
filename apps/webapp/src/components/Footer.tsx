export default function Footer() {
    return (
        <footer
            className="border-t mt-8 py-6 px-4 text-center text-xs"
            style={{
                borderColor: 'var(--border)',
                color: 'var(--meta-color)',
            }}
        >
            <div className="space-y-2">
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    {/* Guidelines · FAQ · API · About DUKI — commented out for now
                    <span>Guidelines</span>
                    <span>·</span>
                    <span>FAQ</span>
                    <span>·</span>
                    <span>API</span>
                    <span>·</span>
                    <span>About DUKI</span>
                    */}
                    <a
                        href="https://alllivesmatter.world"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline hover:underline"
                        style={{ color: 'var(--duki-300, #c4b5fd)' }}
                    >
                        About DUKI In Action
                    </a>
                </div>
                <p style={{ color: 'var(--duki-200)' }}>
                    Discover Works Generating Decentralized Universal Kindness Income
                </p>
                <p className="opacity-60">
                    Building a better future on web3, one work at a time.
                </p>
            </div>
        </footer>
    )
}
