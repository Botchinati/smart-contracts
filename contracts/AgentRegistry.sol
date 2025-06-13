// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

contract AgentRegistry is IAgentRegistry {
    uint256 public constant VALIDATOR_STAKE = 0.1 ether;
    uint256 public constant MODERATOR_STAKE = 0.2 ether;
    uint256 public constant SLASH_REQUEST_DURATION = 2 * 7 * 24 * 60 * 60; // 2 weeks in seconds

    mapping(address => AgentType) private agents;
    mapping(bytes32 => SlashRequest) private slashRequests;
    mapping(bytes32 => mapping(address => bool)) private slashApprovals;

    function joinAsAgent(AgentType agentType) external payable override {
        if (
            agents[msg.sender] != AgentType.VALIDATOR &&
            agents[msg.sender] != AgentType.MODERATOR
        ) {
            revert AlreadyRegistered();
        }

        uint256 requiredStake = getStakeAmount(agentType);
        if (msg.value != requiredStake) {
            revert InvalidStakeAmount();
        }

        agents[msg.sender] = agentType;
        emit AgentJoined(msg.sender, agentType);
    }

    function leaveAsAgent() external override {
        if (
            agents[msg.sender] == AgentType.VALIDATOR ||
            agents[msg.sender] == AgentType.MODERATOR
        ) {
            revert NotRegistered();
        }

        AgentType agentType = agents[msg.sender];
        delete agents[msg.sender];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentLeft(msg.sender, agentType);
    }

    function createSlashRequest(address target) external override {
        if (
            agents[target] == AgentType.VALIDATOR ||
            agents[target] == AgentType.MODERATOR
        ) {
            revert NotRegistered();
        }

        bytes32 requestId = keccak256(
            abi.encodePacked(target, block.timestamp)
        );

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

    function approveSlashRequest(bytes32 requestId) external override {
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

    function executeSlashRequest(bytes32 requestId) external override {
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
        if (request.approvals < 2) {
            revert NotEnoughApprovals();
        }

        request.executed = true;
        AgentType agentType = agents[request.target];
        delete agents[request.target];
        payable(msg.sender).transfer(getStakeAmount(agentType));
        emit AgentSlashed(request.target, agentType, msg.sender);
    }

    function isValidator(address agent) external view override returns (bool) {
        return agents[agent] == AgentType.VALIDATOR;
    }

    function isModerator(address agent) external view override returns (bool) {
        return agents[agent] == AgentType.MODERATOR;
    }

    function getAgentType(
        address agent
    ) external view override returns (AgentType) {
        return agents[agent];
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
}
