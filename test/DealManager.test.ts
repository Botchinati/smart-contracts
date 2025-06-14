import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const dealAmount = ethers.parseUnits("100", 6);
const deadline = Math.floor(Date.now() / 1000) + 3600;

const DEAL_LIFESPAN = 2 * 7 * 24 * 60 * 60; // 2 weeks in seconds
const APPEAL_PERIOD = 1 * 7 * 24 * 60 * 60; // 2 weeks in seconds
const VALIDATE_PERIOD = 10 * 60; // 10 minutes  in seconds

async function createDeal(usdt, business, dealManager, validator, influencer) {
  await usdt
    .connect(business)
    .approve(await dealManager.getAddress(), dealAmount);
  const content = ethers.randomBytes(32);
  // Create deal
  const createTx = await dealManager
    .connect(business)
    .createDeal(
      validator.address,
      influencer.address,
      content,
      deadline,
      dealAmount
    );
  const createReceipt = await createTx.wait();
  const filter = dealManager.filters.DealProposalCreated();
  const events = await dealManager.queryFilter(
    filter,
    createReceipt.blockNumber,
    createReceipt.blockNumber
  );
  return events[0].args.dealID;
}

describe("DealManager", function () {
  const VALIDATOR = 0;
  const MODERATOR = 1;

  const CREATED = 0;
  const APPLIED = 1;
  const REJECTED = 2;
  const VALIDATED = 3;
  const APPEAL = 4;
  const CLOSED = 5;

  let dealManager: any;
  let agentRegistry: any;
  let usdt: any;
  let owner: any;
  let business: any;
  let validator: any;
  let influencer: any;
  let moderator: any;

  beforeEach(async function () {
    [owner, business, validator, influencer, moderator] =
      await ethers.getSigners();

    // Deploy USDT mock
    const USDT = await ethers.getContractFactory("MockERC20");
    usdt = await USDT.deploy("USDT", "USDT", 6);
    await usdt.waitForDeployment();

    // Deploy AgentRegistry
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    agentRegistry = await AgentRegistry.deploy(owner.address);
    await agentRegistry.waitForDeployment();

    // Deploy DealManager
    const DealManager = await ethers.getContractFactory("DealManager");
    dealManager = await DealManager.deploy(
      await agentRegistry.getAddress(),
      await usdt.getAddress()
    );
    await dealManager.waitForDeployment();

    // Setup agents
    const validatorStake = await agentRegistry.getStakeAmount(VALIDATOR);
    const moderatorStake = await agentRegistry.getStakeAmount(MODERATOR);

    await agentRegistry
      .connect(validator)
      .joinAsAgent(VALIDATOR, { value: validatorStake });
    await agentRegistry
      .connect(moderator)
      .joinAsAgent(MODERATOR, { value: moderatorStake });

    // Mint USDT to business
    await usdt.mint(business.address, ethers.parseUnits("1000", 6));
  });

  it("should create and complete a deal successfully", async function () {
    const dealId = createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );

    // Accept deal
    await dealManager.connect(influencer).acceptDeal(dealId);

    // Validate deal
    await dealManager.connect(validator).setDealResult(dealId, VALIDATED);

    const initialValidatorBalance = await usdt.balanceOf(validator.address);
    const initialInfluencerBalance = await usdt.balanceOf(influencer.address);

    await dealManager.connect(influencer).withdrawPayment(dealId);

    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    const finalValidatorBalance = await usdt.balanceOf(validator.address);
    const finalInfluencerBalance = await usdt.balanceOf(influencer.address);

    const validatorFee = (dealAmount * 2000n) / 100000n; // 2% fee
    const influencerAmount = dealAmount - validatorFee;

    expect(finalValidatorBalance - initialValidatorBalance).to.equal(
      validatorFee
    );
    expect(finalInfluencerBalance - initialInfluencerBalance).to.equal(
      influencerAmount
    );
  });

  it("should handle deal appeal when validator submits validation result", async function () {
    const dealId = await createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );
    await dealManager.connect(influencer).acceptDeal(dealId);

    await dealManager.connect(validator).setDealResult(dealId, REJECTED);

    await dealManager.connect(business).appealDeal(dealId);

    // Get initial balances
    const initialModeratorBalance = await usdt.balanceOf(moderator.address);
    const initialBusinessBalance = await usdt.balanceOf(business.address);

    await dealManager
      .connect(moderator)
      .submitModeratorVerdict(dealId, business.address);

    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    const finalModeratorBalance = await usdt.balanceOf(moderator.address);
    const finalBusinessBalance = await usdt.balanceOf(business.address);

    const moderatorFee = (dealAmount * 10000n) / 100000n; // 10% fee
    const businessAmount = dealAmount - moderatorFee;

    expect(finalModeratorBalance - initialModeratorBalance).to.equal(
      moderatorFee
    );
    expect(finalBusinessBalance - initialBusinessBalance).to.equal(
      businessAmount
    );
  });

  it("should handle deal appeal when validator doesn't submit validation result", async function () {
    // Create and accept deal
    const dealId = await createDeal(
      usdt,
      business,
      dealManager,
      validator,
      influencer
    );

    await dealManager.connect(influencer).acceptDeal(dealId);

    await expect(
      dealManager.connect(business).appealDeal(dealId)
    ).to.be.revertedWithCustomError(dealManager, "DealCannotBeAppealed");

    await time.increase(DEAL_LIFESPAN + VALIDATE_PERIOD + 1);

    // Appeal deal
    await dealManager.connect(business).appealDeal(dealId);

    // Get initial balances
    const initialModeratorBalance = await usdt.balanceOf(moderator.address);
    const initialBusinessBalance = await usdt.balanceOf(business.address);

    // Submit moderator verdict
    await dealManager
      .connect(moderator)
      .submitModeratorVerdict(dealId, business.address);

    // Check final state
    const deal = await dealManager.deals(dealId);
    expect(deal.state).to.equal(CLOSED);

    // Check final balances
    const finalModeratorBalance = await usdt.balanceOf(moderator.address);
    const finalBusinessBalance = await usdt.balanceOf(business.address);

    // Calculate expected amounts
    const moderatorFee = (dealAmount * 10000n) / 100000n; // 10% fee
    const businessAmount = dealAmount - moderatorFee;

    // Verify balances
    expect(finalModeratorBalance - initialModeratorBalance).to.equal(
      moderatorFee
    );
    expect(finalBusinessBalance - initialBusinessBalance).to.equal(
      businessAmount
    );
  });
});
