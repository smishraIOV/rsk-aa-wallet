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
import * as fs from 'fs';
import { join } from 'path';

describe("AA-test", function () {
  
  async function setup() {

    // Contracts are deployed using the first signer/account by default
    // user1 and user2 from Hardhat network
    const [user1, user2, user3, otherAccount] = await ethers.getSigners();

    // RSK wallets will not have any funds in Hardhat network. We only use them for signing the AA TX (with multisig). 
    const [wallet1, wallet2] = await getRSKWallets(true); //on rsk, these will be the same as above sigers


    //console.log(user1.address, user2.address, wallet1.address, wallet2.address);
    //console.log("balance of", wallet1.address   , "is: ",  await ethers.provider.getBalance(wallet1.address));

    // deploy the mintable erc20 contract
    const ONE_GWEI = 1_000_000_000n; //use bigint throughout
    const initBtcPrice = 23000n; // DOC per BTC
    const initFee =  210n * 6n * ONE_GWEI; //21000 gas at gasprice of 0.06 gwei

    // deploy a mintable DOC token. 
    const ERC20 = await ethers.getContractFactory("DummyDocMint");
    const erc20 = await ERC20.deploy(otherAccount.address, initFee , initBtcPrice, { value: 0 });

    let erc20Tx = await erc20.deployTransaction.wait();
    console.log("Gas used for ERC20 deployment: ", erc20Tx.gasUsed );

    
    // get the wallet bytecode and abi
    // read the abi
    const artifact = fs.readFileSync(join(__dirname, '../artifacts/contracts/TwoUserMultisig.sol/TwoUserMultisig.json'), 'utf-8');
    const artifactParsed = JSON.parse(artifact);
    const walletabi = artifactParsed.abi;
    //get the bytecode
    const bytecode = artifactParsed.deployedBytecode.substring(2);
    //console.log(bytecode);


    let nonce = ethers.utils.hexZeroPad(
      ethers.utils.hexlify(
          await ethers.provider.getTransactionCount(wallet1.getAddress()) //+ 1 //remove the increment when sending from different account
      )
      , 32).replace('0x', '');
    let address = ethers.utils.hexZeroPad(
              (await wallet1.getAddress())
      , 32).replace('0x', '').toLowerCase();
    let bytecodeHash = ethers.utils.keccak256(ethers.utils.hexlify('0x' + bytecode)).replace('0x', '');
    let msgToSign = '0x' + address + nonce + bytecodeHash;
    // console.log('msgToSign', msgToSign);
    let msgHashToSign = ethers.utils.keccak256(ethers.utils.hexlify( msgToSign ));
    //console.log('msgHashToSign', msgHashToSign);

    //to prove ownership, user-0 must sign the message
    let bytecodeSignature = (await wallet1.signMessage(ethers.utils.arrayify(msgHashToSign))).replace('0x', '');
    //console.log('bytecodeSignature', bytecodeSignature);
    //console.log('v:', '0x' + bytecodeSignature.slice(128));
    let v = ethers.utils.hexZeroPad(
          ethers.utils.hexlify(
              '0x' + bytecodeSignature.slice(128)
          )
      , 32).replace('0x', '');
    bytecodeSignature = v + bytecodeSignature.slice(0, 128);
    //console.log('bytecodeSignature', bytecodeSignature);
    let data = '0x'+address+bytecodeSignature + bytecode;
    //console.log('data', data);
    let txInstall: TransactionRequest = {
    ///...tx,`
    to: '0x0000000000000000000000000000000001000011',
    from: (await wallet2.getAddress()),
    chainId: (await ethers.provider.getNetwork()).chainId,
    nonce: await ethers.provider.getTransactionCount(wallet2.getAddress()),
    value: 1,
    data: data,
    gasPrice: 1,
    gasLimit: 4000_000, //used about 2.5 M
    };
        // use installcode to inject account
    let txResult = await (await wallet2.sendTransaction(txInstall)).wait();

    //console.log(txResult);
    console.log("\nInstall code gas used: " + txResult.gasUsed);

    // to confirm that the call succeeded
    // console.log(txResult);


    // instantiate the wallet as a contract object to interact with it.
    const twoUserMultisig = new ethers.Contract(wallet1.address, walletabi, wallet2);

    await twoUserMultisig.init(wallet1.address, wallet2.address);
    //console.log(walletabi);  
    return { erc20, initFee , initBtcPrice, user1, user2, otherAccount, wallet1, wallet2, twoUserMultisig };
  }


  describe("Init wallet and serialization checks", async function () {

    it("Interact with install code wallet", async function() {
      const { erc20, user1, user2, wallet1, wallet2, twoUserMultisig } = await setup();
      
      //check that correct owners are set
      expect(await twoUserMultisig.owner1()).to.equal(wallet1.address);
      expect(await twoUserMultisig.owner2()).to.equal(wallet2.address);

      //check the magic string for correct transaction validation
      let valRes = await twoUserMultisig.validationMagic();
      expect(valRes).to.equal('0x0aee9f17');

      //Create an AA TRANSACTION: use token mint to structure example
      let mintSel = funcSelector("mintDoc(uint256)");      
      
      //amount of btc to be used for minting. 
      let toMint = '00000000000000000000000000000000000000000000000000038d7ea4c68000' ;//1M gwei (10^15) = 0.01 BTC, to be converted
      let mintcalldata = mintSel + toMint;
      const sig = '0x'; //obviously invalid signature
      const valMint = 2_000_000 * 1000_000_000; //2M gwei

      //check that the token contract works fine by calling it directly (not through wallet)
      //await erc20.mintDoc(BigNumber.from('1000000000000000'), {value: 2_000_000 * 1000_000_000});
      //console.log("User 1s DOC balance: ", await erc20.balanceOf(user1.address));

      let aaTx = await newAATx(erc20.address, wallet1.address, valMint, mintcalldata, sig);

      //console.log(aaTx);
      let result =  await serializeTR(aaTx);
      // console.log("The encoded TX is: ", result);
      
      let parsedTx = parse(result);
      //console.log("The parsed Tx is: ", parsedTx, "\nwith custom signature", parsedTx.customData.any);
  
      // encode TX without customSig in case something was passed earlier
      let aaNoSig = encode4337withoutCustomSig(parsedTx);
      let encodedNoSig = parse(aaNoSig);
      let MintTxHash = ethers.utils.arrayify(encodedNoSig.hash);

      /// Sign the parsed hash (without CustomSig) with a wallet
      const w1Sign = wallet1._signingKey().signDigest(MintTxHash);       
      //2nd owner's signature for the multisig
      const w2Sign = wallet2._signingKey().signDigest(MintTxHash);
      
      let v1 = new Number(w1Sign.v).toString(16);
      let v2 = new Number(w2Sign.v).toString(16);

      // concatenate the signatures for our multisig verification
      const jointSig = w1Sign.r + w1Sign.s.substring(2) + v1 + w2Sign.r.substring(2) + w2Sign.s.substring(2) + v2; //remove '0x' from second signateru
      //console.log(jointSig, "\n", jointSig.length);

      //console.log("The parsed Tx without customdata: ", parsedTx, "\nwith custom signature", parsedTx.customData.any);

      // encode the transaction struct for direct interaction using contract ABI (instead of via encoded AA transaction which is for eth raw transaction)
      let txMint:TransactionStruct;
      txMint = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.address,
        gasLimit: BigNumber.from(5000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(3),
        value: BigNumber.from(valMint),
        data: mintcalldata, 
        signature: ethers.utils.arrayify(jointSig),
      };

      // transfer 10 DOC to someone else:
      let transSel = funcSelector("transfer(address,uint256)");  //0xa9059cbb
      let transTo = await user2.getAddress();
      let transAmt =  '0000000000000000000000000000000000000000000000008ac7230489e80000'; //10_000_000_000_000_000_000 .. = 10 DOC, 23e18 "gwei(DOC)"
      let transCallData  = transSel + '000000000000000000000000' + transTo.substring(2) + transAmt;
      let transTxVal = 0;

      // //repeat above steps
      let aaTxTrans = await newAATx(erc20.address, user1.address, transTxVal, transCallData, sig);
      let resultTrans =  await serializeTR(aaTxTrans);      
      let parsedTxTrans = parse(resultTrans);
      // encode TX without customSig in case something was passed
      let aaNoSigTrans = encode4337withoutCustomSig(parsedTxTrans);
      let encodedNoSigTrans = parse(aaNoSigTrans);

      let TransTxHash = ethers.utils.arrayify(encodedNoSigTrans.hash);
      /// Sign the parsed hash (without CustomSig) separately by each owner of the wallet
      let w1SignTrans = wallet1._signingKey().signDigest(TransTxHash);      //2nd owner's signature for the multisig
      let w2SignTrans = wallet2._signingKey().signDigest(TransTxHash);

      let v1Trans = new Number(w1SignTrans.v).toString(16);
      let v2Trans = new Number(w2SignTrans.v).toString(16);

      // concatenate the signatures for our multisig verification
      let jointSigTrans = w1SignTrans.r + w1SignTrans.s.substring(2) + v1Trans + w2SignTrans.r.substring(2) + w2SignTrans.s.substring(2) + v2Trans; //remove '0x' from second signateru
      
      // add signature
      aaTxTrans.customData.customSig = jointSigTrans;

      let txTrans:TransactionStruct;
      txTrans = {
        txType: BigNumber.from(3), 
        to: erc20.address,
        from: user1.address,
        gasLimit: BigNumber.from(2000000),
        gasPrice: BigNumber.from(1),
        nonce: BigNumber.from(3),
        value: BigNumber.from(transTxVal),
        data: transCallData, 
        signature: ethers.utils.arrayify(jointSigTrans),
      };
     
      // now setup a batched transaction
      // single call to wallet for both TX. Values need to be added
      let txHashList = [MintTxHash, TransTxHash];
      let txList: TransactionStruct[] = [txMint, txTrans];
      
      // batch transaction in legacy mode
      let mcLegacyTx = await twoUserMultisig.connect(user2).executeMulticall(txHashList, txList, {value: valMint + transTxVal}); // value 0 to make the TX fail.
      // this Legacy TX's calldata can be used to encode the AA transaction  
      // console.log("The legacy multicall calldata is: ", mcLegacyTx.data);

      console.log("\nUser 2's DOC balance after mint + transfer (LEGACY) multicall: ", await erc20.balanceOf(user2.address));
       
      //Try to use multicall as a AA transaction
      let mcselector = await twoUserMultisig.multicallSelector();
      let mcData = mcLegacyTx.data;
      let aaMultiCallTx = await newAATx(user1.address, user1.address, valMint + transTxVal, mcData, sig);

      let resultMc =  await serializeTR(aaMultiCallTx);      
      let parsedTxMc = parse(resultMc);
      // encode TX without customSig in case something was passed
      let aaNoSigMc = encode4337withoutCustomSig(parsedTxMc);
      let encodedNoSigMc = parse(aaNoSigMc);

      let McTxHash = ethers.utils.arrayify(encodedNoSigMc.hash);
      /// Sign the parsed hash (without CustomSig) separately by each owner of the wallet
      let w1SignMc = wallet1._signingKey().signDigest(McTxHash);      //2nd owner's signature for the multisig
      let w2SignMc = wallet2._signingKey().signDigest(McTxHash);

      let v1Mc = new Number(w1SignMc.v).toString(16);
      let v2Mc = new Number(w2SignMc.v).toString(16);

      // // concatenate the signatures for our multisig verification
      let jointSigMc = w1SignMc.r + w1SignMc.s.substring(2) + v1Mc + w2SignMc.r.substring(2) + w2SignMc.s.substring(2) + v2Mc; //remove '0x' from second signateru

      aaMultiCallTx.customData.customSig = jointSigMc;

      // serialize it again using our modified ethers library
      let signedAAMcTx = serialize( aaMultiCallTx );
      //console.log("\nThe serialized AA Tx with multisig signature: ", signedAATx);
    
      const sendRawTx = await ethers.provider.send("eth_sendRawTransaction", [signedAAMcTx]);
      console.log("the response from send Raw", sendRawTx);
      console.log("\nMint TX gas used: "+ await (await ethers.provider.getTransactionReceipt(sendRawTx)).gasUsed);

      console.log("\nUser 2's DOC balance after mint + transfer (AA-Type) multicall: ", await erc20.balanceOf(user2.address));
    


    });

  });


});

//test helpers

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
      gasLimit: 5000_000,
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
