import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
//import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("AA-test", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployAATestFixture() {
    //const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    //const ONE_GWEI = 1_000_000_000;

    //const lockedAmount = ONE_GWEI;
    //const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [owner1, owner2,  otherAccount] = await ethers.getSigners();

    const TwoUserMultisig = await ethers.getContractFactory("TwoUserMultisig");
    const twoUserMultisig = await TwoUserMultisig.deploy(owner1.address, owner2.address);

    return { twoUserMultisig, owner1, owner2, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right 1st owner", async function () {
      const { twoUserMultisig, owner1 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner1()).to.equal(owner1.address);
    });

    it("Should set the right 2nd owner", async function () {
      const { twoUserMultisig, owner2 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner2()).to.equal(owner2.address);
    });


  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { twoUserMultisig } = await loadFixture(deployAATestFixture);

        /*await expect(twoUserMultisig.withdraw()).to.be.revertedWith(
          "You can't withdraw yet"
        );*/
      });

      it("Should revert with the right error if called from another account", async function () {

      });

    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {

      });
    });
  });
});
