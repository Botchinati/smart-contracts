import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentRegistry", function () {
  const VALIDATOR = 0;
  const MODERATOR = 1;

  let agentRegistry: any;
  let owner: any;
  let validator: any;
  let validator1: any;
  let validator2: any;
  let moderator: any;
  let moderator1: any;
  let moderator2: any;
  let other: any;

  beforeEach(async function () {
    [
      owner,
      validator,
      validator1,
      validator2,
      moderator,
      moderator1,
      moderator2,
      other,
    ] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    agentRegistry = await AgentRegistry.deploy(owner.address);
    await agentRegistry.waitForDeployment();
  });

  describe("Agent Registration", function () {
    it("should allow an address to register as a validator", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);
      expect(await agentRegistry.isValidator(validator.address)).to.be.false;
      expect(await agentRegistry.isModerator(validator.address)).to.be.false;
      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmount });

      expect(await agentRegistry.isValidator(validator.address)).to.be.true;
      expect(await agentRegistry.isModerator(validator.address)).to.be.false;
    });

    it("should allow an address to register as a moderator", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);

      expect(await agentRegistry.isModerator(moderator.address)).to.be.false;
      expect(await agentRegistry.isValidator(moderator.address)).to.be.false;

      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });

      expect(await agentRegistry.isModerator(moderator.address)).to.be.true;
      expect(await agentRegistry.isValidator(moderator.address)).to.be.false;
    });

    it("should not allow registration with insufficient stake", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

      await expect(
        agentRegistry
          .connect(validator)
          .joinAsAgent(VALIDATOR, { value: stakeAmount - 1n })
      ).to.be.revertedWithCustomError(agentRegistry, "InvalidStakeAmount");
    });

    it("should not allow registration as both validator and moderator", async function () {
      const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
      const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: validatorStake });

      await expect(
        agentRegistry
          .connect(validator)
          .joinAsAgent(MODERATOR, { value: moderatorStake })
      ).to.be.revertedWithCustomError(agentRegistry, "AlreadyRegistered");
    });
  });

  describe("Agent Leaving", function () {
    it("should allow a validator to leave and receive their stake back", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(VALIDATOR);

      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmount });

      const initialBalance = await ethers.provider.getBalance(
        validator.address
      );
      const tx = await agentRegistry.connect(validator).leaveAsAgent();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(validator.address);

      expect(await agentRegistry.isValidator(validator.address)).to.be.false;
      expect(finalBalance).to.equal(initialBalance + stakeAmount - gasCost);
    });

    it("should allow a moderator to leave and receive their stake back", async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);

      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });

      const initialBalance = await ethers.provider.getBalance(
        moderator.address
      );
      const tx = await agentRegistry.connect(moderator).leaveAsAgent();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(moderator.address);

      expect(await agentRegistry.isModerator(moderator.address)).to.be.false;
      expect(finalBalance).to.equal(initialBalance + stakeAmount - gasCost);
    });

    it("should not allow non-registered address to leave", async function () {
      await expect(
        agentRegistry.connect(other).leaveAsAgent()
      ).to.be.revertedWithCustomError(agentRegistry, "NotRegistered");
    });
  });

  describe("Slash Request System", function () {
    beforeEach(async function () {
      const stakeAmount = await agentRegistry.getStakeAmount(MODERATOR);
      const stakeAmountV = await agentRegistry.getStakeAmount(VALIDATOR);
      await agentRegistry
        .connect(validator)
        .joinAsAgent(VALIDATOR, { value: stakeAmountV });
      await agentRegistry
        .connect(moderator)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
      await agentRegistry
        .connect(moderator1)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
      await agentRegistry
        .connect(moderator2)
        .joinAsAgent(MODERATOR, { value: stakeAmount });
    });

    it("should allow creating a slash request", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);
      const request = await agentRegistry.getSlashRequest(requestID);
      expect(request.target).to.equal(validator.address);
      expect(request.deadline).to.be.gt(0);
    });

    it("should not allow creating multiple slash requests for the same agent", async function () {
      await agentRegistry
        .connect(moderator)
        .createSlashRequest(validator.address);

      expect(
        await agentRegistry
          .connect(moderator)
          .createSlashRequest(validator.address)
      ).to.be.revertedWithCustomError(agentRegistry, "Duplicate");
    });

    it("should allow approving a slash request", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);

      const initialBalance = await ethers.provider.getBalance(
        validator.address
      );
      await agentRegistry.connect(moderator1).approveSlashRequest(requestID);
      await agentRegistry.connect(moderator2).approveSlashRequest(requestID);

      await agentRegistry.connect(owner).executeSlashRequest(requestID);

      const finalBalance = await ethers.provider.getBalance(validator.address);

      expect(await agentRegistry.isValidator(validator.address)).to.be.false;
      expect(finalBalance - initialBalance).to.equal(0n); // No stake returned
    });

    it("should not allow non-owner to approve slash requests", async function () {
      const requestID = createSlashRequest(agentRegistry, moderator, validator);

      await expect(
        agentRegistry.connect(other).approveSlashRequest(requestID)
      ).to.be.revertedWithCustomError(agentRegistry, "NotRegistered");
    });

    it("should not allow approving non-existent slash requests", async function () {
      await expect(
        agentRegistry
          .connect(moderator)
          .approveSlashRequest(ethers.randomBytes(32))
      ).to.be.revertedWithCustomError(agentRegistry, "SlashRequestNotFound");
    });
  });

  describe("Stake Management", function () {
    it("should have different stake amounts for validators and moderators", async function () {
      const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
      const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

      expect(validatorStake).to.not.equal(moderatorStake);
    });
  });
});

async function createSlashRequest(agentRegistry, slasher, slashed) {
  const reqTx = await agentRegistry
    .connect(slasher)
    .createSlashRequest(slashed.address);
  const slashReceipt = await reqTx.wait();
  const filter = agentRegistry.filters.SlashRequestCreated();
  const events = await agentRegistry.queryFilter(
    filter,
    slashReceipt.blockNumber,
    slashReceipt.blockNumber
  );
  return events[0].args.requestId;
}
