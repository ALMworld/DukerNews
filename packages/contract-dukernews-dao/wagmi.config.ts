import { defineConfig } from '@wagmi/cli'
import { foundry } from '@wagmi/cli/plugins'

export default defineConfig({
    out: 'generated/index.ts',
    plugins: [
        foundry({
            project: './',
            include: [
                'EvolveDaoContract.sol/*.json',
                'DukerBaguaFactory.sol/*.json',
                'DukerNews.sol/*.json',
                'MockUSDT.sol/*.json',
            ],
        }),
    ],
})
