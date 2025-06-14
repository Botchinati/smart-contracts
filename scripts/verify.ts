import { run } from "hardhat";

async function main() {
  const usdtAddress = process.env.USDT_ADDRESS;
  const agentRegistryAddress = process.env.AGENT_REGISTRY_ADDRESS;
  const dealManagerAddress = process.env.DEAL_MANAGER_ADDRESS;

  if (!usdtAddress || !agentRegistryAddress || !dealManagerAddress) {
    throw new Error("Please set all required environment variables");
  }

  console.log("Verifying contracts...");

  // Verify Mock USDT
  console.log("Verifying Mock USDT...");
  try {
    await run("verify:verify", {
      address: usdtAddress,
      constructorArguments: ["USDT", "USDT", 6],
    });
    console.log("Mock USDT verified successfully");
  } catch (error) {
    console.error("Error verifying Mock USDT:", error);
  }

  // Verify AgentRegistry
  console.log("Verifying AgentRegistry...");
  try {
    await run("verify:verify", {
      address: agentRegistryAddress,
      constructorArguments: [process.env.TREASURY_ADDRESS],
    });
    console.log("AgentRegistry verified successfully");
  } catch (error) {
    console.error("Error verifying AgentRegistry:", error);
  }

  // Verify DealManager
  console.log("Verifying DealManager...");
  try {
    await run("verify:verify", {
      address: dealManagerAddress,
      constructorArguments: [agentRegistryAddress, usdtAddress],
    });
    console.log("DealManager verified successfully");
  } catch (error) {
    console.error("Error verifying DealManager:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
