import { getChainConfig } from './src/config'
import { createPublicClient, http } from 'viem'
import { dukerRegistryAbi } from 'contract-duki-alm-world'

async function main() {
    const chainEid = 31337
    const cfg = getChainConfig(chainEid)
    console.log("Config:", cfg)
    
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })
    
    const [chainEvtSeq, checkpoints] = await client.readContract({
        address: cfg.dukerRegistryAddress,
        abi: dukerRegistryAbi,
        functionName: 'eventState',
    })
    console.log("chainEvtSeq:", chainEvtSeq)
}
main().catch(console.error)
