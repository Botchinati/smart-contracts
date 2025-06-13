// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {IDealManager} from "./interfaces/IDealManager.sol";

contract DealManager is IDealManager {
    using SafeERC20 for IERC20;

    uint256 public constant DEAL_LIFESPAN = 100000;
    uint64 public constant APPEAL_PERIOD = 100000;
    uint64 public constant VALIDATOR_FEE_PERCENTAGE = 2000; // 2%
    uint64 public constant MODERATOR_FEE_PERCENTAGE = 1000; // 2%
    uint64 public constant BASIS_POINTS = 10000; // 100%

    AgentRegistry immutable agentRegistry;
    IERC20 immutable USDT;

    mapping(bytes32 => Deal) public deals;

    constructor(address payable _agentRegistry, address _usdt) {
        agentRegistry = AgentRegistry(_agentRegistry);
        USDT = IERC20(_usdt);
        //TREASURY = _treasury;
    }

    function calculateFee(
        uint256 amount,
        uint64 feePercentage
    ) public pure returns (uint256 fee, uint256 remaining) {
        if (amount == 0) revert InvalidFeeCalculation();

        fee = (amount * feePercentage) / BASIS_POINTS;

        if (amount < fee) revert InvalidFeeCalculation();
        remaining = amount - fee;

        return (fee, remaining);
    }

    function createDeal(
        address validator,
        uint256 deadline,
        uint256 tokenAmount
    ) public {
        if (validator == address(0)) {
            revert InvalidAddress();
        }

        bytes32 dealID = keccak256(
            abi.encodePacked(msg.sender, deadline, block.timestamp)
        );

        USDT.safeTransferFrom(msg.sender, address(this), tokenAmount);

        deals[dealID] = Deal(
            msg.sender,
            address(0),
            bytes32(0),
            tokenAmount,
            validator,
            block.timestamp + DEAL_LIFESPAN,
            State.CREATED
        );

        emit DealProposalCreated(
            dealID,
            msg.sender,
            validator,
            block.timestamp + DEAL_LIFESPAN
        );
    }

    function acceptDeal(bytes32 dealID) public {
        Deal storage deal = deals[dealID];
        if (deal.influencer != msg.sender) revert NotAuthorized();
        if (deal.state != State.CREATED) {
            revert DealCannotBeAccepted();
        }
        deal.influencer = msg.sender;
        deal.state = State.APPLIED;
        emit DealAccepted(dealID, msg.sender);
    }

    function setDealResult(bytes32 dealID) public {
        agentRegistry.isValidator(msg.sender);

        Deal storage deal = deals[dealID];
        if (deal.state != State.APPLIED) {
            revert DealCannotBeAccepted();
        }
        deal.state = State.VALIDATED;
        emit DealValidated(dealID, msg.sender);
    }

    function revertDeal(bytes32 dealID) public {
        Deal storage deal = deals[dealID];
        if (deal.business != msg.sender) revert NotAuthorized();
        if (deal.state != State.APPLIED) {
            revert DealAlreadyApplied();
        }
        deal.state = State.APPLIED;
        emit DealReverted(dealID, msg.sender);
    }

    function withdrawPayment(bytes32 dealID) public {
        Deal storage deal = deals[dealID];
        if (deal.influencer != msg.sender) revert NotAuthorized();
        if (deal.state != State.VALIDATED) {
            revert DealCannotBeWithdrawn();
        }
        deal.state = State.CLOSED;

        (uint256 fee, uint256 remaining) = calculateFee(
            deal.price,
            VALIDATOR_FEE_PERCENTAGE
        );

        USDT.safeTransfer(deal.validator, fee);
        USDT.safeTransfer(msg.sender, remaining);

        emit DealWithdrawn(dealID, msg.sender);
    }

    function appealDeal(bytes32 dealID) public {
        Deal storage deal = deals[dealID];
        if (deal.influencer != msg.sender || deal.business != msg.sender)
            revert NotAuthorized();
        if (deal.state != State.VALIDATED) {
            revert DealCannotBeAppealed();
        }
        deal.state = State.APPEAL;
        emit DealAppealed(dealID, msg.sender);
    }

    function submitModeratorVerdict(bytes32 dealID, address receiver) public {
        agentRegistry.isModerator(msg.sender);

        Deal storage deal = deals[dealID];
        if (deal.state != State.APPEAL) {
            revert DealIsNotOnAppeal();
        }
        deal.state = State.CLOSED;

        (uint256 fee, uint256 remaining) = calculateFee(
            deal.price,
            MODERATOR_FEE_PERCENTAGE
        );

        USDT.safeTransfer(msg.sender, fee);
        USDT.safeTransfer(receiver, remaining);

        emit AppealSolved(dealID, msg.sender);
    }
}
