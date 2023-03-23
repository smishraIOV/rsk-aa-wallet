import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
//import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TwoUserMultisig__factory } from "../typechain-types";
import { TransactionStruct } from "../typechain-types/contracts/IAccount";
import { TwoUserMultisigInterface } from "../typechain-types/contracts/TwoUserMultisig";
import { BigNumber } from "ethers";
import { UnsignedTransaction, serialize, parse } from "../scripts/localEthersTrans";
import { TransactionRequest } from '@ethersproject/providers';
import { keccak256 } from "@ethersproject/keccak256";

describe("AA-test", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployAATestFixture() {

    // Contracts are deployed using the first signer/account by default
    const [owner1, owner2,  otherAccount] = await ethers.getSigners();

    const TwoUserMultisig = await ethers.getContractFactory("TwoUserMultisig");
    const twoUserMultisig = await TwoUserMultisig.deploy();

    // this will revert if addresses are the same
    await twoUserMultisig.init(owner1.getAddress(), owner2.getAddress());
    return { twoUserMultisig, owner1, owner2, otherAccount };
  }

  describe("Post Deployment", function () {
    it("Should set the right 1st owner", async function () {
      const { twoUserMultisig, owner1 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner1()).to.equal(owner1.address);
    });

    it("Should set the right 2nd owner", async function () {
      const { twoUserMultisig, owner2 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner2()).to.equal(owner2.address);
    });

    it("Should revert if another initialization is attempted", async function(){
      const { twoUserMultisig, owner1, owner2 } = await loadFixture(deployAATestFixture);
      await expect(twoUserMultisig.init(owner1.getAddress(), owner2.getAddress())).to.be.revertedWith("contract already initialized");
    });

    it("Should decode transaction struct and fail due to balance", async function(){
      const { twoUserMultisig, owner1, owner2 } = await loadFixture(deployAATestFixture);
      const data = '0xdededada';
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      
      let tx:TransactionStruct;
      tx = {
        txType: BigNumber.from(3), 
        to: owner1.getAddress(),
        from: owner2.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(0),
        data: data, 
        signature: sig,
      }
    
      // test tx struct decoded properly
      await twoUserMultisig.printTxandHash(tx);
      //todo(shree) some random hash -- should test this with cmputed one
      let hash = ethers.utils.keccak256(data);
      //
      await expect(twoUserMultisig.validateTransaction(hash, tx)).to.be.revertedWith("Not enough balance for fee + value");

      //the test.. could check the given hash matches the computed one
    });

    //todo(shree) FIX this.. pass a hash computed on the fly.
    it("tx hash should match", async function() {
      const { twoUserMultisig, owner1, owner2 } = await loadFixture(deployAATestFixture);
      const data = '0xdededada';
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      
      let tx:TransactionStruct;
      tx = {
        txType: BigNumber.from(3), 
        to: owner1.getAddress(),
        from: owner2.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(0),
        data: data, 
        signature: sig,
      }
      
      let aaTx = newAATx(await owner1.getAddress(), await owner2.getAddress(), 0, data, sig);
      const parsedAA = parse(serialize(await aaTx));
      console.log("The given hash0 is:", parsedAA);

      await twoUserMultisig.printTxandHash(tx);
      //let hash1Str = new TextDecoder().decode(hash1);
      //console.log(hash1Str);
      //expect().to.equal(hash0);
    });

  });

});


//helpers
// populate a new AA 4337 TX Type based on TransactionRequest
async function newAATx(to: string, from: string, value: number, data: string, customSig: string): Promise<UnsignedTransaction>  {
  const chainId = (await ethers.provider.getNetwork()).chainId 

  let tx: UnsignedTransaction;
  tx = {
      to: to, 
      from: from,
      chainId: chainId,
      nonce: 0,//await ethers.provider.getTransactionCount(from),
      value: value,
      data: data,
      gasLimit: 2000000,
      gasPrice: 1,//await ethers.provider.getGasPrice(),
      type: 3,
  };
  return tx;
};