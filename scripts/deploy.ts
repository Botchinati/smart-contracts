import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy Mock USDT first
  console.log("Deploying Mock USDT...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("USDT", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("Mock USDT deployed to:", usdtAddress);

  // Deploy AgentRegistry
  console.log("Deploying AgentRegistry...");
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy(deployer.address);
  await agentRegistry.waitForDeployment();
  const agentRegistryAddress = await agentRegistry.getAddress();
  console.log("AgentRegistry deployed to:", agentRegistryAddress);

  // Deploy DealManager
  console.log("Deploying DealManager...");
  const DealManager = await ethers.getContractFactory("DealManager");
  const dealManager = await DealManager.deploy(
    agentRegistryAddress,
    usdtAddress
  );
  await dealManager.waitForDeployment();
  const dealManagerAddress = await dealManager.getAddress();
  console.log("DealManager deployed to:", dealManagerAddress);

  // Mint some USDT to the deployer for testing
  const mintAmount = ethers.parseUnits("1000000", 6); // 1 million USDT
  await usdt.mint(deployer.address, mintAmount);
  console.log(
    `Minted ${ethers.formatUnits(mintAmount, 6)} USDT to ${deployer.address}`
  );

  // Log deployment summary
  console.log("\nDeployment Summary:");
  console.log("------------------");
  console.log("Mock USDT:", usdtAddress);
  console.log("AgentRegistry:", agentRegistryAddress);
  console.log("DealManager:", dealManagerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
