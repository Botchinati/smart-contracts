// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable, IAgentRegistry {
    uint256 public constant VALIDATOR_STAKE = 0.1 ether;
    uint256 public constant MODERATOR_STAKE = 0.2 ether;
    uint256 public constant SLASH_REQUEST_DURATION = 2 * 7 * 24 * 60 * 60; // 2 weeks in seconds
    uint128 requiredApprovals = 2;

    mapping(address => Agent) private agents;
    mapping(bytes32 => SlashRequest) private slashRequests;
    mapping(bytes32 => mapping(address => bool)) private slashApprovals;

    modifier isValidModerator() {
        if (agents[msg.sender].agentType != AgentType.MODERATOR) {
            revert NotRegistered();
        }
        if (agents[msg.sender].slashed) revert SlashedAgent();
        _;
    }
    constructor(address _owner) Ownable(_owner) {}

    function joinAsAgent(AgentType _agentType) external payable override {
        if (
            agents[msg.sender].agentType == AgentType.VALIDATOR &&
            agents[msg.sender].agentType == AgentType.MODERATOR
        ) {
            revert AlreadyRegistered(); // check if agent does not have other role;
        }
        if (agents[msg.sender].slashed) revert SlashedAgent(); // check if agent was slashed;

        uint256 requiredStake = getStakeAmount(_agentType);
        if (msg.value != requiredStake) {
            revert InvalidStakeAmount();
        }

        agents[msg.sender] = Agent(0, false, _agentType);
        emit AgentJoined(msg.sender, _agentType);
    }

    function leaveAsAgent() external override {
        if (
            agents[msg.sender].agentType == AgentType.VALIDATOR ||
            agents[msg.sender].agentType == AgentType.MODERATOR
        ) {
            revert NotRegistered();
        }
        if (agents[msg.sender].slashed) revert SlashedAgent();

        AgentType agentType = agents[msg.sender].agentType;
        delete agents[msg.sender];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentLeft(msg.sender, agentType);
    }

    function createSlashRequest(
        address target
    ) external override isValidModerator {
        bytes32 requestId = keccak256(
            abi.encodePacked(target, block.timestamp)
        );

        if (slashRequests[requestId].target != address(0)) revert Duplicate();

        slashRequests[requestId] = SlashRequest({
            target: target,
            deadline: block.timestamp + SLASH_REQUEST_DURATION,
            approvals: 0,
            executed: false
        });

        emit SlashRequestCreated(
            requestId,
            target,
            block.timestamp + SLASH_REQUEST_DURATION
        );
    }

    function approveSlashRequest(
        bytes32 requestId
    ) external override isValidModerator {
        SlashRequest storage request = slashRequests[requestId];
        if (request.target == address(0)) {
            revert SlashRequestNotFound();
        }
        if (block.timestamp > request.deadline) {
            revert SlashRequestExpired();
        }
        if (request.executed) {
            revert SlashRequestAlreadyExecuted();
        }
        if (slashApprovals[requestId][msg.sender]) {
            revert AlreadyApproved();
        }

        slashApprovals[requestId][msg.sender] = true;
        request.approvals++;
        emit SlashRequestApproved(requestId, msg.sender);
    }

    function executeSlashRequest(
        bytes32 requestId
    ) external override onlyOwner {
        SlashRequest storage request = slashRequests[requestId];
        if (request.target == address(0)) {
            revert SlashRequestNotFound();
        }
        if (block.timestamp > request.deadline) {
            revert SlashRequestExpired();
        }
        if (request.executed) {
            revert SlashRequestAlreadyExecuted();
        }
        if (request.approvals < requiredApprovals) {
            revert NotEnoughApprovals();
        }

        request.executed = true;
        AgentType agentType = agents[request.target].agentType;
        delete agents[request.target];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentSlashed(request.target, agentType, msg.sender);
    }

    function isValidator(address agent) external view override returns (bool) {
        return
            agents[agent].agentType == AgentType.VALIDATOR &&
            agents[agent].slashed;
    }

    function isModerator(address agent) external view override returns (bool) {
        return
            agents[agent].agentType == AgentType.MODERATOR &&
            agents[agent].slashed;
    }

    function getAgentType(
        address agent
    ) external view override returns (AgentType) {
        return agents[agent].agentType;
    }

    function getStakeAmount(
        AgentType agentType
    ) public pure override returns (uint256) {
        return
            agentType == AgentType.VALIDATOR
                ? VALIDATOR_STAKE
                : MODERATOR_STAKE;
    }

    function getSlashRequest(
        bytes32 requestId
    ) external view override returns (SlashRequest memory) {
        return slashRequests[requestId];
    }

    function changeRequiredApprovals(
        uint128 _requiredApprovals
    ) public onlyOwner {
        if (_requiredApprovals == 0) revert("Can't be a zero");
        requiredApprovals = _requiredApprovals;
    }

    receive() external payable {}
}
