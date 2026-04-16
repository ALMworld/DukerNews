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

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [
            'Duker Identity', // name
            'DUKR', // symbol
            endpointV2Deployment.address, // LayerZero EndpointV2
            deployer, // delegate/owner
            localChainEid, // this chain's LZ EID
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${contractName}, network: ${hre.network.name}, address: ${address}`)
}

deploy.tags = [contractName]

export default deploy
