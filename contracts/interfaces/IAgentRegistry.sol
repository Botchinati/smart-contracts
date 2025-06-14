// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IAgentRegistry {
    // Structs
    struct SlashRequest {
        address target;
        uint256 deadline;
        uint256 approvals;
        bool executed;
    }

    struct Agent {
        uint8 rating;
        bool slashed;
        AgentType agentType;
    }

    // Events
    event AgentJoined(address indexed agent, AgentType indexed agentType);
    event AgentLeft(address indexed agent, AgentType indexed agentType);
    event SlashRequestCreated(
        bytes32 indexed requestId,
        address indexed target,
        uint256 deadline
    );
    event SlashRequestApproved(
        bytes32 indexed requestId,
        address indexed approver
    );
    event AgentSlashed(
        address indexed agent,
        AgentType indexed agentType,
        address indexed slashed
    );

    // Errors
    error InvalidAgentType();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidStakeAmount();
    error SlashRequestNotFound();
    error SlashRequestExpired();
    error SlashRequestAlreadyExecuted();
    error AlreadyApproved();
    error NotEnoughApprovals();
    error NotAuthorized();
    error SlashedAgent();
    error Duplicate();

    enum AgentType {
        VALIDATOR,
        MODERATOR
    }

    // Functions
    function joinAsAgent(AgentType agentType) external payable;
    function leaveAsAgent() external;
    function createSlashRequest(address target) external;
    function approveSlashRequest(bytes32 requestId) external;
    function executeSlashRequest(bytes32 requestId) external;

    // View functions
    function isValidator(address agent) external view returns (bool);
    function isModerator(address agent) external view returns (bool);
    function getAgentType(address agent) external view returns (AgentType);
    function getStakeAmount(
        AgentType agentType
    ) external pure returns (uint256);
    function getSlashRequest(
        bytes32 requestId
    ) external view returns (SlashRequest memory);
}
