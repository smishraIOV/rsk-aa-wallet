import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
//import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, config } from "hardhat";
import { TwoUserMultisig__factory } from "../typechain-types";
import { TransactionStruct } from "../typechain-types/contracts/TwoUserMultisig";
import { BigNumber } from "ethers";
import { UnsignedTransaction, serialize, parse, serializeTR, encode4337withoutCustomSig } from "../scripts/localEthersTrans";
import { TransactionRequest } from '@ethersproject/providers';  
//import { keccak256 } from "@ethersproject/keccak256";
import { splitSignature } from "@ethersproject/bytes";

describe("AA-test", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployAATestFixture() {

    // Contracts are deployed using the first signer/account by default
    // user1 and user2 from Hardhat network
    const [user1, user2,  otherAccount] = await ethers.getSigners();

    // deploy the mintable erc20 contract
    const ONE_GWEI = 1_000_000_000n; //use bigint throughout
    const initBtcPrice = 23000n; // DOC per BTC
    const initFee =  210n * 6n * ONE_GWEI; //21000 gas at gasprice of 0.06 gwei

    // deploy a mintable DOC token. 
    const ERC20 = await ethers.getContractFactory("DummyDocMint");
    const erc20 = await ERC20.deploy(user1.address, initFee , initBtcPrice, { value: 0 });

    const TwoUserMultisig = await ethers.getContractFactory("TwoUserMultisig");
    const twoUserMultisig = await TwoUserMultisig.deploy();

    // RSK wallets will not have any funds in Hardhat network. We only use them for signing the AA TX (with multisig). 
    const [wallet1, wallet2] = await getRSKWallets(true);
    await twoUserMultisig.init(wallet1.address, wallet2.address);
  
    return { erc20, initFee , initBtcPrice, twoUserMultisig, user1, user2, otherAccount, wallet1, wallet2 };
  }

  describe("Init wallet and serialization checks", function () {
    it("Should set the right 1st owner", async function () {
      const { twoUserMultisig, wallet1 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner1()).to.equal(wallet1.address);
    });

    it("Should set the right 2nd owner", async function () {
      const { twoUserMultisig, wallet2 } = await loadFixture(deployAATestFixture);

      expect(await twoUserMultisig.owner2()).to.equal(wallet2.address);
    });

    it("Should revert if another initialization is attempted", async function(){
      const { twoUserMultisig, user1, user2 } = await loadFixture(deployAATestFixture);
      await expect(twoUserMultisig.init(user1.getAddress(), user2.getAddress())).to.be.revertedWith("contract already initialized");
    });

    it("Should decode transaction struct and fail validation due to balance", async function(){
      const { twoUserMultisig, user1, user2 } = await loadFixture(deployAATestFixture);
      const data = '0xdededada';
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      
      let tx:TransactionStruct;
      tx = {
        txType: BigNumber.from(3), 
        to: user1.getAddress(),
        from: user2.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(0),
        data: data, 
        signature: sig,
      }
    
      // test tx struct decoded properly
      //await twoUserMultisig.printTxandHash(tx);
      //todo(shree) some made-up hash -- separate test to check hashes
      let hash = ethers.utils.keccak256(data);
      //
      await expect(twoUserMultisig.validateTransaction(hash, tx)).to.be.revertedWith("Not enough balance for fee + value");
    });


    it("expect tx serialization and hash from contract to match input data", async function() {
      const { twoUserMultisig, user1, user2 } = await loadFixture(deployAATestFixture);
      const data = '0xdededada';
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      const val = 0;

      let tx:TransactionStruct;
      tx = {
        txType: BigNumber.from(3), 
        to: user1.getAddress(),
        from: user2.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(val),
        data: data, 
        signature: sig,
      }
      
      let aaTx = await newAATx(await user1.getAddress(), await user2.getAddress(), val, data, sig);
      const serializedAaTx = await serializeTR(aaTx);
      //console.log("The serialized tx is:", serializedAaTx);
      //           nonce   gasprice   gaslimit   toaddr                                     value   data       chainid          fromAddr                                     customsig
      //0x03 f8 3e 8-0     0-1        83-1e8480  94-f39fd6e51aad88f6f4ce6ab8827279cfffb92266  8-0   84-dededada 82-7a69         94-70997970c51812dc3a010c7d01b50e0d17dc79c8 84-deadbeef

      const parsedAA = parse(serializedAaTx); //for the hash
      //console.log("The tx is:", parsedAA); 

      //await twoUserMultisig.printTxandHash(tx);
  
      // set excludeSig to false 
      let txEnc = await twoUserMultisig.getTxEncoded(tx, false);    
      //console.log("The encoded value is \n", txEnc);
      //console.log("Parsing the other tx: ", parse(txEnc));
      expect(serializedAaTx).to.equal(txEnc);

      let txHash = await twoUserMultisig.getTxHash(tx, false);
      //console.log(parsedAA.hash);
      //console.log(txHash);
      expect(txHash).to.equal(parsedAA.hash);
    });

  });

  describe("execution calls checks", function() {
    it("total supply check", async function() {
      const { erc20 } = await loadFixture(deployAATestFixture);
      let supply = await erc20.totalSupply();
      expect(supply).to.equal(BigNumber.from('0'));;
    });

    it("test mint and transfer call", async function() {
      const { erc20, twoUserMultisig, user1, user2, otherAccount } = await loadFixture(deployAATestFixture);
      
      let mintSel = funcSelector("mintDoc(uint256)");
      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
    
      let mintcalldata = mintSel + toMint;
      //console.log(mintcalldata);

      //const data = mintcalldata;
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      const val = 2_000_000 * 1000_000_000; //2M gwei

      let tx:TransactionStruct;
      tx = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(val),
        data: mintcalldata, 
        signature: sig,
      }

      await twoUserMultisig.executeTransaction(tx, {value: val}); //value needs to be explit (the value " struct field" is only for internal logic and type 3)
      let supply = await erc20.totalSupply();
      //console.log(supply);

      // mint some more the direct way way
      let _directMint = await erc20.mintDoc(val/2, {value: val});

      supply = await erc20.totalSupply();
      //console.log(supply);
      //console.log(_directMint);
      expect(supply).to.equal(BigNumber.from('46000000000000000000'));

      // transfer DOCs to someone else:
      // 0x a9059cbb 000000000000000000000000e700691da7b9851f2f35f8b8182c69c53ccad9db 000000000000000000000000000000000000000000000006c6b935b8bbd40000
      let transSel = funcSelector("transfer(address,uint256)");  //0xa9059cbb
      let transTo = await otherAccount.getAddress();
      let transAmt =  '0000000000000000000000000000000000000000000000013f306a2409fc0000'; //23000_000_000_000_000_000 .. = 23 DOC, 23e18 "gwei(DOC)"
      let transCallData  = transSel + '000000000000000000000000' + transTo.substring(2) + transAmt;
      //console.log(transCallData);

      //update the struct fields, including nonce (not really needed)
      tx = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(await ethers.provider.getGasPrice()),
        nonce: BigNumber.from(1),
        value: BigNumber.from(0),
        data: transCallData,
        signature: sig,
      }

      await twoUserMultisig.executeTransaction(tx, {value: 0});

      //check balance of recipient
      let recBal = await erc20.balanceOf(transTo);
      //console.log('Recipient token balance is: ', recBal );
      expect(recBal).to.equal(BigNumber.from('23000000000000000000'));
    });

    it("test batched mint and transfer call", async function() {
      const { erc20, twoUserMultisig, user1, user2, otherAccount } = await loadFixture(deployAATestFixture);
      
      let mintSel = funcSelector("mintDoc(uint256)");      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
    
      let mintcalldata = mintSel + toMint;
      const sig = '0xdeadbeef'; //needs to be multiples of 65 bytes for each ECDSA sig rsv(32+32+1)
      const valMint = 2_000_000 * 1000_000_000; //2M gwei

      let txMint:TransactionStruct;
      txMint = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(await ethers.provider.getGasPrice()),
        nonce: BigNumber.from(0),
        value: BigNumber.from(valMint),
        data: mintcalldata, 
        signature: sig,
      }
      
      // transfer DOCs to someone else:
      let transSel = funcSelector("transfer(address,uint256)");  //0xa9059cbb
      let transTo = await otherAccount.getAddress();
      let transAmt =  '0000000000000000000000000000000000000000000000013f306a2409fc0000'; //23000_000_000_000_000_000 .. = 23 DOC, 23e18 "gwei(DOC)"
      let transCallData  = transSel + '000000000000000000000000' + transTo.substring(2) + transAmt;
      let transTxVal = 0;

      let txTransfer:TransactionStruct;
      txTransfer = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(await ethers.provider.getGasPrice()),
        nonce: BigNumber.from(1),
        value: BigNumber.from(transTxVal),
        data: transCallData,
        signature: sig,
      }

      //single call to wallet for both TX. Values need to be added
      let txList: TransactionStruct[] = [txMint, txTransfer];
      await twoUserMultisig.executeBatchTransaction(txList, {value: valMint + transTxVal});

      //check balance of recipient
      let recBal = await erc20.balanceOf(transTo);
      //console.log('Recipient token balance after batched mint and transfer is: ', recBal );
      expect(recBal).to.equal(BigNumber.from('23000000000000000000'));
    });
  });

  describe("validation calls checks", function() {
    it("print the magic string", async function() {
      const { twoUserMultisig } = await loadFixture(deployAATestFixture);
      let valRes = await twoUserMultisig.validationMagic();
      expect(valRes).to.equal('0x0aee9f17');
      console.log("magic is (function selector for validateTransaction):", valRes);
    });

    it("mint call should fail validation for insufficient wallet balance", async function() {
      const { erc20, twoUserMultisig, user1, user2, otherAccount } = await loadFixture(deployAATestFixture);      
      let mintSel = funcSelector("mintDoc(uint256)");      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
    
      let mintcalldata = mintSel + toMint;
      const sig = '0xdeadbeef'; //obviously invalide signature
      const valMint = 2_000_000 * 1000_000_000; //2M gwei

      let txMint:TransactionStruct;
      txMint = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(valMint),
        data: mintcalldata, 
        signature: sig,
      }
      // no value passed, so wallet balance remains at 0
      let valtx = twoUserMultisig.validateTransaction("0x0000000000000000000000000000000000000000000000000000000000000000", txMint, {value: 0});
      await expect(valtx).to.be.revertedWith("Not enough balance for fee + value");
    });

    it("mint call should fail validation due to invalid ECDSA sig", async function() {
      const { erc20, twoUserMultisig, user1, user2, otherAccount } = await loadFixture(deployAATestFixture);      
      let mintSel = funcSelector("mintDoc(uint256)");      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
    
      let mintcalldata = mintSel + toMint;
      const sig = '0xdeadbeef'; //obviously invalide signature
      const valMint = 2_000_000 * 1000_000_000; //2M gwei

      let txMint:TransactionStruct;
      txMint = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.getAddress(),
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(0),
        value: BigNumber.from(valMint),
        data: mintcalldata, 
        signature: sig,
      }
      // no value passed including gaslimit
      let valtx = twoUserMultisig.validateTransaction("0x0000000000000000000000000000000000000000000000000000000000000000", txMint, {value: valMint +2000_000 });
      await expect(valtx).to.be.revertedWith("ECDSA: invalid signature");
    });

    it("EIP1271: should validate multi-signatures correctly", async function() {

      //wallet1 and wallet2 are RSKJ regtest "cow" acounts
      //When testing with RSKJ, we will just run everything inside loadFixture here. 
      const { erc20, twoUserMultisig, user1, user2, otherAccount, wallet1, wallet2 } = await loadFixture(deployAATestFixture);

      //console.log("the private keys are\n" + wallet1.privateKey + "\n" + wallet2.privateKey);
      //console.log("the private keys are\n" + wallet1.address + "\n" + wallet2.address);

      //Create an AA TRANSACTION: use token mint to structure example
      let mintSel = funcSelector("mintDoc(uint256)");      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
    
      let mintcalldata = mintSel + toMint;
      const sig = '0x'; //obviously invalide signature
      const valMint = 2_000_000 * 1000_000_000; //2M gwei

      let aaTx = await newAATx(erc20.address, user1.address, valMint, mintcalldata, sig);

      //console.log(aaTx);
      let result =  await serializeTR(aaTx);
      // console.log("The encoded TX is: ", result);
      
      let parsedTx = parse(result);
      // console.log("The parsed Tx is: ", parsedTx, "\nwith custom signature", parsedTx.customData.any);
  
      // encode TX without customSig
      let aaNoSig = encode4337withoutCustomSig(parsedTx);
      let encodedNoSig = parse(aaNoSig);

      /// Sign the parsed hash (without CustomSig) with a wallet
      const w1Sign = wallet1._signingKey().signDigest(ethers.utils.arrayify(encodedNoSig.hash));
      
      // following version is for etehreum signed msg "\x19 etc", which leads to differnt ecrecover, but is better for security
      //const w1Sign = await wallet1.signMessage(ethers.utils.arrayify(encodedNoSig.hash));
      
      //console.log("The signature", w1Sign, " with length: (string not bytes)");     
       
      //2nd owner's signature for the multisig
      const w2Sign = wallet2._signingKey().signDigest(ethers.utils.arrayify(encodedNoSig.hash));
      // following version is for etehreum signhed mdsg, which will lead to differnt ecrecover, but is better for security
      //const w2Sign = await wallet2.signMessage(ethers.utils.arrayify(encodedNoSig.hash));
      //console.log("The signature", w2Sign, " with length: (string not bytes)");

      let v1 = new Number(w1Sign.v).toString(16);
      let v2 = new Number(w2Sign.v).toString(16);

      // concatenate the signatures for our multisig verification
      const jointSig = w1Sign.compact + v1 + w2Sign.compact.substring(2) + v2; //remove '0x' from second signateru
      //console.log(jointSig, "\n", jointSig.length);

      // console.log("The parsed Tx without customdata: ", parsedTx, "\nwith custom signature", parsedTx.customData.any);

      // encode the transaction struct
      let txMint:TransactionStruct;
      txMint = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.address,
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(3),
        value: BigNumber.from(valMint),
        data: mintcalldata, 
        signature: ethers.utils.arrayify(jointSig),
      };

      let sigTest = await twoUserMultisig.isValidSignature(ethers.utils.arrayify(encodedNoSig.hash), txMint.signature);
      expect(sigTest).to.equal('0x1626ba7e');
      //console.log(sigTest);

      
      //console.log("The signature components are: ", splitSignature(w1Sign));
      //console.log("The signature components are: ", splitSignature(w2Sign));

      // console.log(ethers.utils.recoverAddress(ethers.utils.arrayify(encodedNoSig.hash), w1Sign));
      // console.log(ethers.utils.recoverAddress(ethers.utils.arrayify(encodedNoSig.hash), w2Sign));

      // update the AA TX with the signature too
      //aaTx = await newAATx(erc20.address, user1.address, valMint, mintcalldata, jointSig);
      aaTx.customData.customSig = jointSig;
      
      // serialize it again using our modified ethers library
      let signedAATx = serialize(aaTx);
      console.log("The serialized AA Tx with multisig signature: ", signedAATx);
      //console.log(parse(signedAATx));

      let encodedbySolidity = await twoUserMultisig.getTxEncoded(txMint, false);
      console.log(encodedbySolidity);
      expect(signedAATx).to.equal(encodedbySolidity);
      // the encoded, signed (by both owners), type AA TX
      //'0x03f8e40301831e8480945fbdb2315678afecb367f032d93f642f64180aa387071afd498d0000a47d28f1e500000000000000000000000000000000000000000000000000038d7ea4c68000827a6994f39fd6e51aad88f6f4ce6ab8827279cfffb92266b882a5be643d070a8e23b9b37f7c53a2017b15714fa73565c63acb13ae879658460b6f4b13cfcc53072961926f1eb2c9bf11b3614fe89f36db3b79976360c8227ec41b64f893b634aacc1107fb514c79033ba28111e842353b1d2febe5454b23b1f59d4ab1df4611a20ede725094bbd1fdca47d32c8aafaec57cf53a3b25a30673918a1b'

      // validate and execute in one shot
      await twoUserMultisig.executeTransactionFromOutside(txMint, {value: valMint + 2000000});
      let supply = await erc20.totalSupply();

      expect(supply).to.equal(BigNumber.from('23000000000000000000'));
    });

  });

});





//test helpers
// populate a new AA 4337 TX Type based on TransactionRequest

// populate a new AA 4337 TX Type based on TransactionRequest
async function newAATx(to: string, from: string, value: number, data: string, customSig: string): Promise<TransactionRequest>  {
  const chainId = (await ethers.provider.getNetwork()).chainId 

  let tx: TransactionRequest;
  tx = {
      to: to, 
      from: from,
      chainId: chainId,
      nonce: await ethers.provider.getTransactionCount(from),
      value: value,
      data: data,
      gasLimit: 2000_000,
      gasPrice: 1,//await ethers.provider.getGasPrice(),
      customData: {name:"customSig", customSig},
      type: 3,
  };
  return tx;
};

// returns first 4 bytes of method signature
function funcSelector(func:string): string {
  return  ethers.utils.keccak256(ethers.utils.toUtf8Bytes(func)).substring(0,10);
}

// hardhat pvt keys
// https://ethereum.stackexchange.com/questions/137341/how-to-get-private-key-from-hardhat-ethers-signer
async function getRSKWallets(rsk: boolean) {
  //let network = (await ethers.provider.getNetwork()).chainId; //31337 for Hardhat, 33 for RSK

  let wallet1: ethers.Wallet; 
  let wallet2: ethers.Wallet; 
  
  if (rsk) {
    wallet1 = new ethers.Wallet(pvtKeyfromSeed("cow"), ethers.provider);
    wallet2 = new ethers.Wallet(pvtKeyfromSeed("cow1"), ethers.provider);
  } else {
    const accounts = config.networks.hardhat.accounts;
    const index = 0; // first wallet, increment for next wallets
    wallet1 = ethers.Wallet.fromMnemonic(accounts.mnemonic, accounts.path + `/${index}`);
    wallet2 = ethers.Wallet.fromMnemonic(accounts.mnemonic, accounts.path + `/${(index+1)}`);
  }
  return [wallet1, wallet2];
}

// create account pvt key from string
    // Examples:
    // acc1 => "dd28a0daa33dff4e5635685746483fbfd283511c972976649942d4fa3c6dc3c4"; // used in RSKJ DSL tests
    // cow =>   "c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4"; //default accounts in regtest, cow, cow1, cow2, ...
function pvtKeyfromSeed(seed: string){
      let seedEncoded =  new TextEncoder().encode(seed);
      return ethers.utils.keccak256(seedEncoded).toString();
} 
