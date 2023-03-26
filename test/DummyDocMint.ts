import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
//import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const ONE_GWEI = 1_000_000_000n; //use bigint throughout

describe("Dummy DOC Mint Test", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployDummyERC20() {    
    const initBtcPrice = 23000n; // DOC per BTC
    const initFee =  210n * 6n * ONE_GWEI; //21000 gas at gasprice of 0.06 gwei

    // Contracts are deployed using the first signer/account by default
    // brew: see use of `connect` to call with otherAccount
    const [owner, otherAccount] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("DummyDocMint");
    const erc20 = await ERC20.deploy(owner.address, initFee , initBtcPrice, { value: 0 });

    return {erc20, initFee , initBtcPrice, owner, otherAccount};
  }

    describe("Deployment", function () {
        it("Should set the right owner address", async function () {
            const { erc20, initFee , initBtcPrice, owner, otherAccount } = await loadFixture(deployDummyERC20);
      
            expect(await erc20.owner()).to.equal(owner.address);
        });
      
        it("Should set the  correct fee", async function () {
              const { erc20, initFee , initBtcPrice, owner, otherAccount } = await loadFixture(deployDummyERC20);
        
              expect(await erc20.fee()).to.equal(initFee);
        });
      
        it("Should set the correct BTC price", async function () {
              const { erc20, initFee , initBtcPrice, owner, otherAccount } = await loadFixture(deployDummyERC20);
        
              expect(await erc20.btcPrice()).to.equal(initBtcPrice);
        });
            
        it("Should set the correct initial token supply (zero)", async function () {
              const { erc20, initFee , initBtcPrice, owner, otherAccount } = await loadFixture(deployDummyERC20);
        
              expect(await erc20.totalSupply()).to.equal(0);
        });
      
        it("Should set the correct token symbol", async function () {
              const { erc20, initFee , initBtcPrice, owner, otherAccount } = await loadFixture(deployDummyERC20);
        
              expect(await erc20.symbol()).to.equal('DDOC');
        });
      
    });

    describe("Set Params", function () {
        it("Should revert reset price by other accounts", async function () {
            const { erc20, initBtcPrice, otherAccount} = await loadFixture(deployDummyERC20);
            await expect(erc20.connect(otherAccount).setBtcPrice( initBtcPrice*2n)).to.be.revertedWith(
            "Only owner can reset price"
           );
        });
        
        it("Should revert reset fee by other accounts", async function () {
            const { erc20, initFee, otherAccount} = await loadFixture(deployDummyERC20);
            await expect(erc20.connect(otherAccount).setMintFee(initFee*3n)).to.be.revertedWith(
            "Only owner can reset fee"
           );
        });

        it("Should reset BTC price correctly by owner", async function () {
            const { erc20, initBtcPrice} = await loadFixture(deployDummyERC20);
            await erc20.setBtcPrice( initBtcPrice*3n);
            expect(await erc20.btcPrice()).to.equal(initBtcPrice*3n);
        });
        
        it("Should reset fee correctly by owner", async function () {
            const { erc20, initFee} = await loadFixture(deployDummyERC20);
            await erc20.setMintFee( initFee*3n);
            expect(await erc20.fee()).to.equal(initFee*3n);
        });
    });

    describe("Mint DOCs", function () {
        it("Should mint Docs", async function () {
            const {erc20, initBtcPrice, initFee, otherAccount} = await loadFixture(deployDummyERC20);
            let initRbtcBal = await otherAccount.getBalance();
            let val = 2000_000n * ONE_GWEI;
            let toMint = 1000_000n * ONE_GWEI; //10^15 gwei = 0.01BTC
            let tx = await erc20.connect(otherAccount).mintDoc(toMint, {value: val});
            let minted = initBtcPrice * toMint;
            //minter must get tokens
            expect(await erc20.balanceOf(otherAccount.address)).to.equal(minted);
            let newRbtcBal = await otherAccount.getBalance();
            console.log("Difference in balance: %d ",initRbtcBal.sub(newRbtcBal));
            let RbtcUsed = ethers.BigNumber.from(toMint + initFee); 
            //minter must get remaing rbtc
            console.log("RBTC used:",RbtcUsed);
            let gasusedGwei = initRbtcBal.sub(newRbtcBal).sub(RbtcUsed);
            let gasUsed = gasusedGwei.div(tx.gasPrice!);
            console.log("Gas used for minting: %d gas ",gasUsed); //may be different in RSK and Hardhat VM
        });
    });

    describe("Treasury Ops", function () {
        it("Only owner should be able to claim funds", async function () {
            const {erc20, initFee, otherAccount} = await loadFixture(deployDummyERC20);
            let val = 2000_000n * ONE_GWEI;
            let toMint = 1000_000n * ONE_GWEI; //10^15 gwei = 0.01BTC
            
            // otherAccount mints
            await erc20.connect(otherAccount).mintDoc(toMint, {value: val});
            
            let RbtcUsed = ethers.BigNumber.from(toMint + initFee); 
            //console.log("The contract's address is: %s and the balance is %d ", erc20.address, await ethers.provider.getBalance(erc20.address));
            //contract should have funds spent by minter 
            expect(await ethers.provider.getBalance(erc20.address)).to.equal(RbtcUsed);
            
            //other account should not be able to claim funds
            await expect(erc20.connect(otherAccount).claimTreasury()).to.be.revertedWith(
                "Only owner can claim treasury"
               );

            // owner claims funds in contract
            await erc20.claimTreasury(); 
            expect(await ethers.provider.getBalance(erc20.address)).to.equal(0);
            //let newRbtcBal = await otherAccount.getBalance();
            //console.log("Difference in balance: %d ",initRbtcBal.sub(newRbtcBal));
                        //let gasusedGwei = initRbtcBal.sub(newRbtcBal).sub(RbtcUsed);
            //let gasUsed = gasusedGwei.div(tx.gasPrice!);
            //console.log("Gas used for minting: %d gas ",gasUsed); //may be different in RSK and Hardhat VM
        });
    });

});