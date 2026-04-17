import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'

const contractName = 'DukerRegistry'

const deploy: DeployFunction = async (hre) => {
    const { getNamedAccounts, deployments } = hre

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    const endpointV2Deployment = await hre.deployments.get('EndpointV2')

    // Get the network EID from hardhat config
    const networkConfig = hre.network.config as any
    const localChainEid = networkConfig.eid
    assert(localChainEid, `Missing eid in network config for ${hre.network.name}`)

    // DukigenRegistry must be deployed first (or use address(0) for tests)
    const dukigenRegistryAddr = process.env.DUKIGEN_REGISTRY ?? '0x0000000000000000000000000000000000000000'

    // Deploy via UUPS proxy:
    //   - constructor arg: _lzEndpoint (immutable, set on implementation)
    //   - initialize(): name, symbol, delegate, localChainEid, dukigenRegistry
    const { address } = await deploy(contractName, {
        from: deployer,
        args: [endpointV2Deployment.address], // constructor arg: _lzEndpoint
        proxy: {
            proxyContract: 'ERC1967Proxy',
            proxyArgs: ['{implementation}', '{data}'],
            execute: {
                init: {
                    methodName: 'initialize',
                    args: [
                        'Duker Naming System',       // name
                        'DUKER',                 // symbol
                        deployer,               // delegate/owner
                        localChainEid,          // this chain's LZ EID
                        dukigenRegistryAddr,     // DukigenRegistry address
                    ],
                },
            },
        },
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract (UUPS proxy): ${contractName}, network: ${hre.network.name}, address: ${address}`)
}

deploy.tags = [contractName]

export default deploy
