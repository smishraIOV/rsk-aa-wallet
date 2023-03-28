import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
//import '@nomiclabs/hardhat-ethers';
//import '@nomiclabs/hardhat-waffle';
//import '@nomiclabs/hardhat-etherscan';
//import 'hardhat-gas-reporter';


const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
            details: {
              yul: true,
              cse: true,
              deduplicate: true,
              orderLiterals: true,
              constantOptimizer: true,
            }
          },
          viaIR: true,
        }
        
      },
    ],
  },
};

//if (mnemonics && infuraKey) {
  config.networks = {
    localhost: {
        accounts: "remote",
        url: `http://127.0.0.1:4444`,
        chainId: 33,
       }
  };

// npx hardhat account --network localhost
task('accounts', 'Prints all accounts', async (_, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (let i = 0; i < accounts.length; i += 1) {
    console.log(`${i + 1}: ${await accounts[i].getAddress()}`);
  }
});


export default config;