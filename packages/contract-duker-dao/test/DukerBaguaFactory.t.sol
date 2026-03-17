// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { BaguaDao } from "../src/BaguaDao.sol";
import { DukerBaguaFactory } from "../src/DukerBaguaFactory.sol";
import "../src/libraries/DukiDaoTypes.sol";
import "../src/libraries/DukiDaoConstants.sol";

import "../src/evolve/IEvolveDaoEvents.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/**
 * @dev A mock ALMWorldToken that implements ILoveMintable for testing
 */
contract MockALMWorldToken is ERC20 {
    constructor() ERC20("ALM World Token", "ALM") { }

    function mint(address ying_receiver, address, uint256 amount) external returns (bool) {
        _mint(ying_receiver, amount);
        return true;
    }

    function mint(address taiji_receiver, uint256 amount) external returns (bool) {
        _mint(taiji_receiver, amount);
        return true;
    }
}

contract BaguaDaoTest is Test {
    DukerBaguaFactory public factory;
    BaguaDao public dao;
    MockERC20 public stableCoin;
    MockALMWorldToken public almToken;

    address public founder1 = makeAddr("founder1");
    address public founder2 = makeAddr("founder2");
    address public maintainer1;
    address public investor1 = makeAddr("investor1");

    uint256 public constant INITIAL_BALANCE = 10000 * 10 ** 18;

    function setUp() public {
        stableCoin = new MockERC20("USD Stablecoin", "USDC", 18);
        almToken = new MockALMWorldToken();
        maintainer1 = address(this); // test contract is maintainer for calling maintainerOnly functions

        // Deploy implementation + factory
        BaguaDao impl = new BaguaDao();
        factory = new DukerBaguaFactory(address(impl));

        // Create a DAO via factory
        address[] memory founders = new address[](2);
        founders[0] = founder1;
        founders[1] = founder2;

        address[] memory maintainers = new address[](1);
        maintainers[0] = maintainer1;

        DukiDaoTypes.BaguaDeployConfig memory config = DukiDaoTypes.BaguaDeployConfig({
            d18StableCoin: address(stableCoin),
            almWorldMiner: address(almToken),
            maintainers: maintainers,
            creators: founders
        });

        address daoAddr = factory.createDao(config);
        dao = BaguaDao(daoAddr);

        // Fund accounts
        stableCoin.mint(investor1, INITIAL_BALANCE);
        stableCoin.mint(address(dao), 200 * 10 ** 18); // seed the DAO treasury
    }

    // ─── Factory Tests ───

    function test_factoryDeploysDaoProxy() public view {
        assertEq(factory.getDaoCount(), 1);
        assertEq(factory.getDao(0), address(dao));
    }

    function test_factoryDeploysMultiple() public {
        address[] memory founders = new address[](1);
        founders[0] = founder1;
        address[] memory maintainers = new address[](1);
        maintainers[0] = maintainer1;

        DukiDaoTypes.BaguaDeployConfig memory config = DukiDaoTypes.BaguaDeployConfig({
            d18StableCoin: address(stableCoin),
            almWorldMiner: address(almToken),
            maintainers: maintainers,
            creators: founders
        });

        factory.createDao(config);
        factory.createDao(config);
        assertEq(factory.getDaoCount(), 3); // 1 in setUp + 2 here
    }

    // ─── Initialization ───

    function test_foundersRegistered() public view {
        DukiDaoTypes.BaguaDaoEgoAgg memory agg = dao.baguaDaoAgg4Me(founder1);
        // Founder should have a claimData with latestClaimedRound = Initial_Evolve_Round (1)
        assertEq(agg.fairnessClaimDataArr[DukiDaoConstants.SEQ_7_Heaven_Founders].latestClaimedRound, 1);
    }

    function test_maintainersRegistered() public view {
        DukiDaoTypes.BaguaDaoEgoAgg memory agg = dao.baguaDaoAgg4Me(maintainer1);
        assertEq(agg.fairnessClaimDataArr[DukiDaoConstants.SEQ_6_Lake_Builders].latestClaimedRound, 1);
    }

    // ─── Invest ───

    function test_connectDaoToInvest() public {
        // investor1 needs to approve stablecoin
        vm.startPrank(investor1);
        stableCoin.approve(address(dao), DukiDaoConstants.Hexagram_INVEST_AMOUNT_D18);
        dao.connectDaoToInvest();
        vm.stopPrank();

        // Check investor was registered
        DukiDaoTypes.BaguaDaoEgoAgg memory agg = dao.baguaDaoAgg4Me(investor1);
        assertEq(agg.fairnessClaimDataArr[DukiDaoConstants.SEQ_2_Water_Investors].latestClaimedRound, 1);
    }

    // ─── Observer Approval ───

    function test_approveAsObserver() public {
        address partner = makeAddr("partner");

        // maintainer1 (this contract) is a maintainer — can approve observers
        dao.approveAsObserver(partner, DukiDaoConstants.SEQ_5_Fire_Partners);

        DukiDaoTypes.BaguaDaoEgoAgg memory agg = dao.baguaDaoAgg4Me(partner);
        assertEq(agg.fairnessClaimDataArr[DukiDaoConstants.SEQ_5_Fire_Partners].latestClaimedRound, 1);
    }

    function test_approveAsObserver_onlyMaintainer() public {
        vm.prank(investor1);
        vm.expectRevert(DukiDaoTypes.OnlyMaintainerOrAutomationCanCall.selector);
        dao.approveAsObserver(investor1, DukiDaoConstants.SEQ_5_Fire_Partners);
    }

    // ─── World Agg View ───

    function test_baguaDaoAgg4World() public view {
        DukiDaoTypes.BaguaDaoWorldAgg memory agg = dao.baguaDaoAgg4World();
        assertEq(agg.evolveNum, 1); // Initial_Evolve_Round
        assertGt(agg.bornSeconds, 0);
        assertGt(agg.daoStableCoinBalance, 0);
    }

    // ─── Automation ───

    function test_setAutomationRegistry() public {
        address automation = makeAddr("automation");
        dao.setAutomationRegistry(automation);
        assertEq(dao.automationRegistry(), automation);
    }

    function test_setMinWaitBetweenEvolutions() public {
        dao.setMinWaitBetweenEvolutions(3 days);
        assertEq(dao.s_minWaitBetweenEvolutions(), 3 days);
    }
}
