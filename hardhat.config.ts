import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks/agent";
import "./tasks/deal";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_URI = process.env.SEPOLIA_RPC_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url:
        process.env.PROVIDER_URI ||
        "https://ethereum-sepolia-rpc.publicnode.com",
      accounts:
        process.env.DEPLOYER_PRIVATE_KEY !== undefined
          ? [process.env.DEPLOYER_PRIVATE_KEY]
          : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: <string>process.env.ETHERSCAN_API_KEY,
    },
  },
};

export default config;
