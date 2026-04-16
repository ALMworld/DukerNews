import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { foundry, mainnet, scrollSepolia  } from 'viem/chains'
import { CONFIG } from '../config'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// BaguaDukiDaoContract
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const baguaDukiDaoContractAbi = [
  {
    type: 'function',
    inputs: [{ name: 'uns_domain', internalType: 'string', type: 'string' }],
    name: 'expireSecondsOfSubscription',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  }
] as const


let client: PublicClient | null = null


export function getClient() {
  if (!client) {
    client = createPublicClient({
      chain: CONFIG.CHAIN,
      // transport: fallback([http(CONFIG.RPC_URL), http()],)
      transport: http(CONFIG.RPC_URL)
    })
  }
  return client
}

export async function getExpireSecondsOfSubscription({
  address,
  uns_domain,
}: {
  address: `0x${string}`
  uns_domain: string
}): Promise<bigint> {
  try {
    const client = getClient()
    const result = await client.readContract({
      address,
      abi: baguaDukiDaoContractAbi,
      functionName: 'expireSecondsOfSubscription',
      args: [uns_domain],
    })
    return result
  } catch (error) {
    console.error('Failed to get subscription expiry:', error)
    throw new Error('Failed to get subscription expiry')
  }
}

// const publicClient = createPublicClient({
//   chain: polygon,
//   transport: http()
// })

// const success = await publicClient.verifySiweMessage({
//   message,
//   signature,
// })

export async function verifySiweMessage({
  message,
  signature,
}: {
  message: string
  signature: `0x${string}`
}) {
  const client = getClient()
  return client.verifySiweMessage({ message, signature })
}