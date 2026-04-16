import { defineConfig } from '@wagmi/cli'
import { actions, foundry, react } from '@wagmi/cli/plugins'
import { erc20Abi } from 'viem'

export default defineConfig({
  out: 'src/gen/contracts/generated.ts',
  contracts: [
    {
      name: 'erc20',
      abi: [
        ...erc20Abi,
        {
          type: 'function',
          name: 'permit',
          inputs: [
            {
              name: 'owner',
              type: 'address'
            },
            {
              name: 'spender',
              type: 'address'
            },
            {
              name: 'value',
              type: 'uint256'
            },
            {
              name: 'deadline',
              type: 'uint256'
            },
            {
              name: 'v',
              type: 'uint8'
            },
            {
              name: 'r',
              type: 'bytes32'
            },
            {
              name: 's',
              type: 'bytes32'
            }
          ],
          outputs: [],
          stateMutability: 'nonpayable'
        },
        {
          type: 'function',
          name: 'DOMAIN_SEPARATOR',
          inputs: [],
          outputs: [
            {
              name: '',
              type: 'bytes32'
            }
          ],
          stateMutability: 'view'
        },
        {
          type: 'function',
          name: 'nonces',
          inputs: [
            {
              name: 'owner',
              type: 'address'
            }
          ],
          outputs: [
            {
              name: '',
              type: 'uint256'
            }
          ],
          stateMutability: 'view'
        }
      ]
    },
  ],
  plugins: [
    foundry({
      // /Users/beswarm/Developer/web3/love/dao_is_all_love_contract/packages/foundry/contracts/duki_in_action/1_knowunknowable_love/LoveDaoContract.sol
      project: '/Users/beswarm/Developer/web3/love/dao_is_all_love_contract/packages/foundry/',
      include: [
        '**/EvolveDaoContract.sol/**'
      ],
      forge: {
        clean: true,
      },
    }),
    // actions(),
    // etherscan({
    //   apiKey: process.env.ETHERSCAN_API_KEY!,
    //   chainId: mainnet.id,
    //   contracts: [
    //     {
    //       name: 'EnsRegistry',
    //       address: {
    //         [mainnet.id]: '0x314159265dd8dbb310642f98f50c066173c1259b',
    //         [sepolia.id]: '0x112234455c3a32fd11230c42e7bccd4a84e02010',
    //       },
    //     },
    //   ],
    // }),
    // react(),
  ],
})