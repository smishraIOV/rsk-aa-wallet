// SPDX-License-Identifier: MIT OR Apache-2.0
// Initial version of code from a dependenency `"@matterlabs/zksync-contracts": "^0.5.2"` of a Matter Labs tutorial at https://github.com/matter-labs/custom-aa-tutorial 
// modified by optimalbrew for Rootstock account abstraction research

pragma solidity ^0.8.0;

import "./RLPEncoder.sol";
//import "hardhat/console.sol";

/// @notice Structure used to represent transaction.
struct Transaction {
    // The type of the transaction.
    uint256 txType; //this will be 03 for RSK AA transactions
    
    // The caller.
    address from;
    // The callee.
    address to;

    // The gasLimit to pass with the transaction.
    uint256 gasLimit;

    // The maximum fee per gas that the user is willing to pay.
    // It is akin to EIP1559's maxFeePerGas.
    uint256 gasPrice;

    // The nonce of the transaction.
    uint256 nonce;

    // The value to pass with the transaction.
    uint256 value;

    // The transaction's calldata.
    bytes data;
    // The signature of the transaction.
    // This can be multiple signatures, as in the TwoUserMultisig contract and even be non ECDSA in future
    bytes signature;
}

/**
 * @author Matter Labs: modified by optimalbrew and patogallaiovlabs for rootstock
 * @notice Library is used to help custom accounts to work with common methods for the Transaction type.
 */
library TransactionHelper {

    /// @notice Calculate the suggested signed hash of the transaction,
    /// i.e. depending on use case we may want to exlude Sig (message digest for signining) or include it for Tx hash.
    function getHash(Transaction calldata _transaction, bool excludeSig)
        internal
        view
        returns (bytes32 resultHash)
    {
            resultHash = __getHashRSK4337Transaction(_transaction, excludeSig);
    }   

    /// @notice Encode and hash of the RSK AA/4337 transaction type.
    /// @return keccak256 of the serialized RLP encoded representation of transaction
    function __getHashRSK4337Transaction(Transaction calldata _transaction, bool excludeSig)
        private
        view
        returns (bytes32)
    {  
        bytes memory serialized = __encodeRSK4337Transaction(_transaction, excludeSig);

        return    keccak256( serialized );
    }

    /// @notice Serialize the new AA-type transaction, optionally with the signature field
    /// @param excludeSig should be `true` to generate an encoding to use for hashing
    /// i.e. the hash that is signed by EOAs and is recommended to be signed by other accounts.
    function encode(Transaction calldata _transaction, bool excludeSig)
        internal
        view
        returns (bytes memory result)
    {
            result = __encodeRSK4337Transaction(_transaction, excludeSig);
    }

    /// @notice Encode and hash of the RSK AA/4337 transaction type.
    /// @return serialized RLP encoded representation of transaction
    function __encodeRSK4337Transaction(Transaction calldata _transaction, bool excludeSig)
        private
        view
        returns (bytes memory serialized)
    {   
        // Legacy transactions are encoded as:
        // - RLP(nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0)
        // Here for the hash we use eip-2718 style for e.g. 
        // (0x03 || RLP(nonce, gasPrice, gasLimit, to, value, data, chainId, from, 0))

        bytes memory encodedNonce = RLPEncoder.encodeUint256(_transaction.nonce);
        // Encode `gasPrice` and `gasLimit` together to prevent "stack too deep error".
        // bytes memory encodedGasParam;
        // {
            bytes memory encodedGasPrice = RLPEncoder.encodeUint256(
                _transaction.gasPrice
            );
            bytes memory encodedGasLimit = RLPEncoder.encodeUint256(
                _transaction.gasLimit
            );
            // encodedGasParam = bytes.concat(encodedGasPrice, encodedGasLimit);
        // }

        bytes memory encodedTo = RLPEncoder.encodeAddress(_transaction.to);
        bytes memory encodedValue = RLPEncoder.encodeUint256(_transaction.value);
        //Encode only the length of the transaction data, and not the data itself,
        //so as not to copy to memory a potentially huge transaction data twice.
        bytes memory encodedDataLength;
        {
            // Safe cast, because the length of the transaction data can't be so large.
            uint64 txDataLen = uint64(_transaction.data.length);
            if (txDataLen != 1) {
                // If the length is not equal to one, then only using the length can it be encoded definitely.
                encodedDataLength = RLPEncoder.encodeNonSingleBytesLen(
                    txDataLen
                );
            } else if (_transaction.data[0] >= 0x80) {
                // If input is a byte in [0x80, 0xff] range, RLP encoding will concatenates 0x81 with the byte.
                encodedDataLength = hex"81";
            }
            // Otherwise the length is not encoded at all.
        }

        // todo(shree) copied over from above for "data"
        bytes memory tmpSig;

        if (!excludeSig){
            tmpSig = _transaction.signature;
        } 

        bytes memory encodedSigLength;
        {
            // Safe cast, because the length of the transaction Sig can't be so large.
            uint64 txSigLen = uint64(tmpSig.length);
            if (txSigLen != 1) {
                // If the length is not equal to one, then only using the length can it be encoded definitely.
                encodedSigLength = RLPEncoder.encodeNonSingleBytesLen(
                    txSigLen
                );
            } else if (tmpSig[0] >= 0x80) {
                // If input is a byte in [0x80, 0xff] range, RLP encoding will concatenates 0x81 with the byte.
                encodedSigLength = hex"81";
            }
            // Otherwise the length is not encoded at all.
        }

        // Encode `chainId` according to EIP-155. This is not present in the transaciton struct. Get it from block
        // WARNING: in ZKsync's example code, for legacy transactions, they appended 8080 for "r" and "r" fields after the chainID
        // this has been commented out here.
        bytes memory encodedChainId;
        encodedChainId = bytes.concat(RLPEncoder.encodeUint256(block.chainid)); //, hex"80_80"); remove these 0 values for "r", "s" of legacy tx
        
        bytes memory encodedFrom = RLPEncoder.encodeAddress(_transaction.from);

        bytes memory encodedListLength;

        unchecked {
            uint256 listLength = encodedNonce.length +
                encodedGasPrice.length +
                encodedGasLimit.length +
                encodedTo.length +
                encodedValue.length +
                encodedDataLength.length +
                _transaction.data.length +
                encodedChainId.length +
                encodedFrom.length +
                encodedSigLength.length +
                tmpSig.length;

            // Safe cast, because the length of the list can't be so large.
            //todo(shree) this triggers compilation error below when optimizer is enabled. so we added via-ir
            encodedListLength = RLPEncoder.encodeListLen(uint64(listLength));
        }

        return serialized = bytes.concat(
                    "\x03", // this should match RSKJ. 03 chosen. Ethereum already has 01 and 02.
                    encodedListLength,  
                    encodedNonce,
                    encodedGasPrice,
                    encodedGasLimit,
                    encodedTo,
                    encodedValue,
                    encodedDataLength,
                    _transaction.data,
                    encodedChainId,
                    encodedFrom,
                    encodedSigLength,
                    tmpSig
                );
    }



    // Returns the balance required to process the transaction.
    // todo(shree) this used to have additional logic related to paymaster
	function totalRequiredBalance(Transaction calldata _transaction) internal pure returns (uint256 requiredBalance) {
        requiredBalance =  _transaction.gasPrice * _transaction.gasLimit + _transaction.value;
    }
}
