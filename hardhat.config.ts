import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

 //todo(shree) want optimization enabled. Fix error in transaction helper encodedListLength

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: false,
        runs: 1000,
      },
    },
  },
};

export default config;
