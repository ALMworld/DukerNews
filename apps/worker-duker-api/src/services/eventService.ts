// KEPT FOR REFERENCE — Contract event fetching logic

// import { createPublicClient, http, getContract, decodeEventLog, type Log, type GetContractEventsParameters } from 'viem'
// import { bscTestnet, type Chain } from 'viem/chains'
// import { CONFIG } from '../config'

// // Mock ABI for compilation
// const evolveDaoContractAbi: any = [];

// export class EventService {
//     private client: any;
//     private evolveDaoContract: any;

//     constructor() {
//         this.client = createPublicClient({
//             chain: (CONFIG as any).CHAIN || bscTestnet,
//             transport: http(CONFIG.RPC_URL)
//         })
//         this.evolveDaoContract = getContract({
//             address: CONFIG.CONTRACT_ADDRESS,
//             abi: evolveDaoContractAbi,
//             client: this.client
//         })
//     }

//     /**
//      * Get block information
//      */
//     async getBlockInfo(blockNumber?: bigint) {
//         if (blockNumber) {
//             return this.client.getBlock({ blockNumber })
//         }
//         return this.client.getBlock()
//     }

//     /**
//      * Get current block number
//      */
//     async getCurrentBlockNumber(): Promise<bigint> {
//         return this.client.getBlockNumber()
//     }

//     /**
//      * Get contract events
//      */
//     async getContractEvents(params: { fromBlock?: bigint, toBlock?: bigint | 'latest' } = {}): Promise<Log[]> {
//         const { fromBlock, toBlock } = params
//         console.log(`Fetching events from block ${fromBlock ?? 'x'} to ${toBlock ?? 'y'}`);

//         try {
//             return [];
//         } catch (error) {
//             console.error('Error fetching contract events:', error)
//             throw new Error('Failed to fetch contract events')
//         }
//     }
// }

// export const bscTestnetEventService = new EventService()

// export function createEventService(): EventService {
//     return new EventService()
// }
