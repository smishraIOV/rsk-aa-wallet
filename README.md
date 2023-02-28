# Rootstock account abstraction

This project explores introducing account abstraction in Rootstock using the ERC-4337 design. An important part of this approach
is the separation of a transaction's validation logic from its execution. The ERC is still a work in progress. However, some 
L2 rollup projects have implemented similar versions with "native" account abstraction. We start with code from a ZKSync [tutorial](https://github.com/matter-labs/custom-aa-tutorial) from Matter Labs.

At this state the experiment we have in mind is to create a contract with some ERC-4337 features and then use [RSKIP-167](https://github.com/rsksmart/RSKIPs/blob/master/IPs/RSKIP167.md) (`install code` precompiled contract)
to inject the compiled bytecode in the state trie under the node for an externally owned account (`EOA`). This will create a new type of EOA which can serve as a 
nearly native smart (contract) wallet.


## Motivation
Users on EVM chains are advised to store and manage their assets (coins, tokens, NFTs) using contracts, rather than EOAs. This 
approach results in a "smart (contract) wallet" which offers better security and UX. However, these smart wallets have two 
addresses: one of the user's EOA and another of the associated contract. One high-level goal of account abstraction is to 
combine both so that an account can have code as well.

## Contracts
The contract `TwoUserMultiSig.sol` is from the ZKSync tutorial. This will be modified as the main smart wallet (multisig + batching).

A few supporting contracts have been copied over from the tutorial's main depedency `"@matterlabs/zksync-contracts"`- 
chief among them is a library to encodede and hash transactions. We retain the original MIT license.  


## Misc hardhat starter readme
The initial hardhat scaffolding includes a basic contract (`Lock.sol`), associated scripts and tests. These have not been deleted. 

---

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```
