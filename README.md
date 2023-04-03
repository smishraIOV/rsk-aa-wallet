# Rootstock account abstraction

Note: The contracts and tests in this repo must be used with the appropriate [version of RSKJ modified](https://github.com/rsksmart/rskj/tree/AA-poc) for account abstraction.

This project explores introducing account abstraction in Rootstock using the ERC-4337 design. An important part of this approach
is the separation of a transaction's validation logic from its execution. The ERC is still a work in progress. However, some 
L2 rollup projects have implemented similar versions with "native" account abstraction. We start with code from a ZKSync [tutorial](https://github.com/matter-labs/custom-aa-tutorial) from Matter Labs.

Our approach is to create a contract with "some: ERC-4337 features and then use [RSKIP-167](https://github.com/rsksmart/RSKIPs/blob/master/IPs/RSKIP167.md) (`install code` precompiled contract)
to inject the compiled bytecode in the state trie under the node for an externally owned account (`EOA`). This will create a new type of EOA which can serve as a nearly native smart (contract) wallet.

Two key features of ERC4337 that we adopt are the separation of transaction validation and execution within the wallet. When processing a TX, a RSKJ node will call the wallet's `ValidateTransaction` method, and if it succeeds, then it will call the wallet's `Execute` method. To illustrate the generality of validation process the wallet is initiated with 2 owners, and for validation, a transaction must provide the concatenated ECDSA signature of each owner. This signature appears in a new EIP-2718 format new rransaction type. Noticeably absent from our appoach is any refence to ERC4337's paymaster (and associated contracts). 


## Motivation
Users on EVM chains are advised to store and manage their assets (coins, tokens, NFTs) using contracts, rather than EOAs. This 
approach results in a "smart (contract) wallet" which offers better security and UX. However, these smart wallets have two 
addresses: one of the user's EOA and another of the associated contract. One high-level goal of account abstraction is to 
combine both so that an account can have code as well.

## Contracts
The contract `TwoUserMultiSig.sol` is an adaptation of one from a ZKSync tutorial. Some modification were simplifications to get rid of objects related to ZKSync's rollup system. We added some methods for **batched** validation and execution. Instead of zksync's libraries for signers, we extended `ethers.js`'s  `TransactionRequest` and `UnsignedTransaction` classes to encode transactions.

- `TwoUserMultiSig.sol`: the main wallet
- `TransactionHelper.sol`: simplified from the original and extended to separate encoding and hashing methods.
- `RLP.sol`: a dependency
- `DummyDocMint.sol`: this is a *mintable* ERC20 token. We use `mint` and `transfer` to create examples and tests wallet functionality including batching. 

## Running the PoC Wallet Tests

As noted at the top, since we use install code (RSK167) to inject bytecode into an EOA, this wallet can only be deployed and used with a version of RSKJ modified to include the installcode precompiled contract, introduce  the new transaction type, as well as a host of changes reuired to validate and execute the new type of transactions. 

Build the RSK client for `AA-poc` [branch](https://github.com/rsksmart/rskj/tree/AA-poc). Then start it in `regtest` mode

---

Once the RSKJ client is running:

```shell
npx hardhat test test/AA-test.ts # unit tests run on Hardhat network
npx hardhat test test test/AA-integration-test.ts --network localhost # this must be run with appropriate RSKJ node
npx hardhat test test test/AA-int-Batch-test.ts --network localhost #multicall AA 
```
