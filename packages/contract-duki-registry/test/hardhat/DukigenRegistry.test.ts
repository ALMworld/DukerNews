import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract, ContractFactory, BigNumber } from 'ethers'
import { ethers } from 'hardhat'

describe('DukigenRegistry — ERC-8004 Compliant', function () {
    const LOCAL_CHAIN_EID = 30102

    let owner: SignerWithAddress
    let agentOwner: SignerWithAddress
    let payer: SignerWithAddress
    let newWallet: SignerWithAddress

    let registry: Contract
    let usdt: Contract
    let minter: Contract

    const usdt6 = (n: number) => ethers.utils.parseUnits(n.toString(), 6)

    beforeEach(async function () {
        ;[owner, agentOwner, payer, newWallet] = await ethers.getSigners()

        const MockERC20 = await ethers.getContractFactory('MockERC20')
        usdt = await MockERC20.deploy('Mock USDT', 'USDT', 6)

        const MockMinter = await ethers.getContractFactory('MockAlmWorldDukiMinter')
        minter = await MockMinter.deploy()

        const DukigenRegistry = await ethers.getContractFactory('DukigenRegistry')
        registry = await DukigenRegistry.deploy(
            'DUKIGEN Agent', 'DKGN', owner.address, LOCAL_CHAIN_EID,
            usdt.address, minter.address
        )

        await usdt.mint(payer.address, usdt6(1000))
        await usdt.connect(payer).approve(registry.address, ethers.constants.MaxUint256)
    })

    // ── Registration ──────────────────────────────────────────────────

    it('register with name + bps → pay → verify split', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://QmTest', 5000, 5000, 9900)

        const agentId = 1
        expect(await registry.isRegistered(agentId)).to.be.true
        expect((await registry.totalAgents()).toNumber()).to.equal(1)

        const agent = await registry.getAgent(agentId)
        expect(agent.name).to.equal('DukerNews')
        expect(agent.defaultDukiBps).to.equal(5000)
        expect(await registry.getAgentWallet(agentId)).to.equal(agentOwner.address)

        // Pay 100 USDT (default 50%)
        await registry.connect(payer)['pay(uint256,uint256)'](agentId, usdt6(100))

        expect(await usdt.balanceOf(minter.address)).to.eql(usdt6(50))
        expect(await usdt.balanceOf(agentOwner.address)).to.eql(usdt6(50))
        expect(await usdt.balanceOf(payer.address)).to.eql(usdt6(900))
    })

    it('ERC-8004: register(agentURI) — no name, default bps', async function () {
        await registry.connect(agentOwner)['register(string)']('ipfs://QmSimple')

        const agentId = 1
        expect(await registry.isRegistered(agentId)).to.be.true

        const agent = await registry.getAgent(agentId)
        expect(agent.name).to.equal('')
        expect(agent.defaultDukiBps).to.equal(5000)
        expect(await registry.tokenURI(agentId)).to.equal('ipfs://QmSimple')
    })

    it('ERC-8004: register() — no args', async function () {
        await registry.connect(agentOwner)['register()']()

        const agentId = 1
        expect(await registry.isRegistered(agentId)).to.be.true
        expect(await registry.tokenURI(agentId)).to.equal('')
    })

    // ── Payment ──────────────────────────────────────────────────────

    it('pay with custom dukiBps 70%', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('TestAgent', 'ipfs://test', 5000, 5000, 9900)

        await registry.connect(payer)['pay(uint256,uint256,uint16)'](1, usdt6(100), 7000)

        expect(await usdt.balanceOf(minter.address)).to.eql(usdt6(70))
        expect(await usdt.balanceOf(agentOwner.address)).to.eql(usdt6(30))
    })

    it('revert: dukiBps out of range', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('TestAgent', 'ipfs://test', 5000, 5000, 9900)

        try {
            await registry.connect(payer)['pay(uint256,uint256,uint16)'](1, usdt6(100), 4000)
            expect.fail('should have reverted')
        } catch (e: any) {
            expect(e.message).to.include('DukiBpsOutOfRange')
        }
    })

    // ── EIP-712 setAgentWallet ────────────────────────────────────────

    it('setAgentWallet with valid EIP-712 signature', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://test', 5000, 5000, 9900)

        const agentId = 1
        const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

        // Build EIP-712 domain
        const domain = {
            name: 'DUKIGEN Agent',
            version: '1',
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: registry.address,
        }

        const types = {
            SetAgentWallet: [
                { name: 'agentId', type: 'uint256' },
                { name: 'newWallet', type: 'address' },
                { name: 'deadline', type: 'uint256' },
            ],
        }

        const value = {
            agentId: agentId,
            newWallet: newWallet.address,
            deadline: deadline,
        }

        // newWallet signs the typed data
        const signature = await newWallet._signTypedData(domain, types, value)

        // agentOwner calls setAgentWallet with the signature
        await registry.connect(agentOwner).setAgentWallet(agentId, newWallet.address, deadline, signature)

        // Verify wallet updated
        expect(await registry.getAgentWallet(agentId)).to.equal(newWallet.address)
    })

    it('revert: setAgentWallet with invalid signature', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://test', 5000, 5000, 9900)

        const agentId = 1
        const deadline = Math.floor(Date.now() / 1000) + 3600

        // Wrong signer signs (payer instead of newWallet)
        const domain = {
            name: 'DUKIGEN Agent',
            version: '1',
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: registry.address,
        }
        const types = {
            SetAgentWallet: [
                { name: 'agentId', type: 'uint256' },
                { name: 'newWallet', type: 'address' },
                { name: 'deadline', type: 'uint256' },
            ],
        }
        const value = { agentId, newWallet: newWallet.address, deadline }

        // payer signs instead of newWallet → invalid
        const badSignature = await payer._signTypedData(domain, types, value)

        try {
            await registry.connect(agentOwner).setAgentWallet(agentId, newWallet.address, deadline, badSignature)
            expect.fail('should have reverted')
        } catch (e: any) {
            expect(e.message).to.include('InvalidSignature')
        }
    })

    it('unsetAgentWallet → defaults to owner', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://test', 5000, 5000, 9900)

        const agentId = 1

        // Set wallet via signature first
        const deadline = Math.floor(Date.now() / 1000) + 3600
        const domain = {
            name: 'DUKIGEN Agent',
            version: '1',
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: registry.address,
        }
        const types = {
            SetAgentWallet: [
                { name: 'agentId', type: 'uint256' },
                { name: 'newWallet', type: 'address' },
                { name: 'deadline', type: 'uint256' },
            ],
        }
        const sig = await newWallet._signTypedData(domain, types, {
            agentId, newWallet: newWallet.address, deadline,
        })
        await registry.connect(agentOwner).setAgentWallet(agentId, newWallet.address, deadline, sig)
        expect(await registry.getAgentWallet(agentId)).to.equal(newWallet.address)

        // Unset → back to owner
        await registry.connect(agentOwner).unsetAgentWallet(agentId)
        expect(await registry.getAgentWallet(agentId)).to.equal(agentOwner.address)
    })

    // ── Revert cases ─────────────────────────────────────────────────

    it('revert: duplicate agent name', async function () {
        await registry
            .connect(agentOwner)
            ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://test', 5000, 5000, 9900)

        try {
            await registry
                .connect(agentOwner)
                ['register(string,string,uint16,uint16,uint16)']('DukerNews', 'ipfs://test2', 5000, 5000, 9900)
            expect.fail('should have reverted')
        } catch (e: any) {
            expect(e.message).to.include('AgentNameTaken')
        }
    })
})
