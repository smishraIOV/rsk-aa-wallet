// SPDX-License-Identifier: MIT OR Apache-2.0
// Initial version of code from a dependenency `"@matterlabs/zksync-contracts": "^0.5.2"` of a Matter Labs tutorial at https://github.com/matter-labs/custom-aa-tutorial 


pragma solidity ^0.8.0;
// todo(shree) we are not looking at paymaster features yet. So no need for token utilities or paymaster contracts
//      the token contracts can be added later as needed
//import "./openzeppelin/token/ERC20/IERC20.sol";
//import "./openzeppelin/token/ERC20/utils/SafeERC20.sol";

//import "../interfaces/IPaymasterFlow.sol";
//import "../interfaces/IContractDeployer.sol";
//import {ETH_TOKEN_SYSTEM_CONTRACT, BOOTLOADER_FORMAL_ADDRESS} from "../Constants.sol";
import "./RLPEncoder.sol";

/// @dev The type id of zkSync's EIP-712-signed transaction.
uint8 constant EIP_712_TX_TYPE = 0x71;

/// @dev The type id of legacy transactions.
uint8 constant LEGACY_TX_TYPE = 0x0;
/// @dev The type id of RSK AA transactions.
uint8 constant RSK_4337_TX_TYPE = 0x03;

// todo(shree) the encodeHash methods corresponding these already deleted from this library. no relevance for RSK.
//              delete these later as well
/// @dev The type id of eip2929 transactions.
//uint8 constant EIP_2930_TX_TYPE = 0x01;
/// @dev The type id of EIP1559 transactions.
//uint8 constant EIP_1559_TX_TYPE = 0x02;

/// @notice Structure used to represent zkSync transaction.
struct Transaction {
    // The type of the transaction.
    uint256 txType;
    // The caller.
    uint256 from;
    // The callee.
    uint256 to;
    // The gasLimit to pass with the transaction.
    // It has the same meaning as Ethereum's gasLimit.
    uint256 gasLimit;
    // The maximum amount of gas the user is willing to pay for a byte of pubdata.
    //uint256 gasPerPubdataByteLimit;
    // The maximum fee per gas that the user is willing to pay.
    // It is akin to EIP1559's maxFeePerGas.
    uint256 maxFeePerGas;
    // The maximum priority fee per gas that the user is willing to pay.
    // It is akin to EIP1559's maxPriorityFeePerGas.
    uint256 maxPriorityFeePerGas;
    // The transaction's paymaster. If there is no paymaster, it is equal to 0.
    //uint256 paymaster;
    // The nonce of the transaction.
    uint256 nonce;
    // The value to pass with the transaction.
    uint256 value;
    // In the future, we might want to add some
    // new fields to the struct. The `txData` struct
    // is to be passed to account and any changes to its structure
    // would mean a breaking change to these accounts. In order to prevent this,
    // we should keep some fields as "reserved".
    // It is also recommended that their length is fixed, since
    // it would allow easier proof integration (in case we will need
    // some special circuit for preprocessing transactions).
    // todo(shree) used for chainID encoding in legacy transactions
    uint256[4] reserved;
    // The transaction's calldata.
    bytes data;
    // The signature of the transaction.
    bytes signature;
    // The properly formatted hashes of bytecodes that must be published on L1
    // with the inclusion of this transaction. Note, that a bytecode has been published
    // before, the user won't pay fees for its republishing.
    //bytes32[] factoryDeps;
    // The input to the paymaster.
    //bytes paymasterInput;
    // Reserved dynamic type for the future use-case. Using it should be avoided,
    // But it is still here, just in case we want to enable some additional functionality.
    //bytes reservedDynamic;
}

/**
 * @author Matter Labs
 * @notice Library is used to help custom accounts to work with common methods for the Transaction type.
 * Modified for L1 proposal for Rootstock
 */
library TransactionHelper {
//    using SafeERC20 for IERC20;

    /** todo(shree) this 712 format is custom for ZKSync
     * the L2 client will also use a similar serialization
     * we need not use the same. If eip 712 format is needed, we build our own version*/ 
    /// @notice The EIP-712 typehash for the contract's domain
    bytes32 constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId)");

    // todo(shree) this has been modified from original. We have dropped unused fields from transaction struct e.g. paymasterInput
    bytes32 constant EIP712_TRANSACTION_TYPE_HASH =
        keccak256(
            "Transaction(uint256 txType,uint256 from,uint256 to,uint256 gasLimit,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,uint256 nonce,uint256 value,bytes data)"
        );

    // todo(shree) this is not needed for RSK-AA
    /// @notice Whether the token is Ethereum.
    /// @param _addr The address of the token
    /// @return `true` or `false` based on whether the token is Ether.
    /// @dev This method assumes that address is Ether either if the address is 0 (for convenience)
    /// or if the address is the address of the L2EthToken system contract.
    /*function isEthToken(uint256 _addr) internal pure returns (bool) {
        return _addr == uint256(uint160(address(0)));
    }*/

    /// @notice Calculate the suggested signed hash of the transaction,
    /// i.e. the hash that is signed by EOAs and is recommended to be signed by other accounts.
    function encodeHash(Transaction calldata _transaction)
        internal
        view
        returns (bytes32 resultHash)
    {
        if (_transaction.txType == LEGACY_TX_TYPE) {
            resultHash = _encodeHashLegacyTransaction(_transaction);
        } else if (_transaction.txType == RSK_4337_TX_TYPE) {
            resultHash = __encodeHashRSK4337Transaction(_transaction);
        } else if (_transaction.txType == EIP_712_TX_TYPE) {
            resultHash = _encodeHashEIP712Transaction(_transaction);
        /*} else if (_transaction.txType == EIP_1559_TX_TYPE) {   // todo(shree) these references can be deleted from library code
            resultHash = _encodeHashEIP1559Transaction(_transaction);
        } else if (_transaction.txType == EIP_2930_TX_TYPE) {
            resultHash = _encodeHashEIP2930Transaction(_transaction); */
        } else {
            // Currently no other transaction types are supported.
            // Any new transaction types will be processed in a similar manner.
            revert("Encoding unsupported tx");
        }
    }

    // todo(shree): once we have the new RSK transaction type stable we create a method to
    // incode it. Can base the method on the one for legacy transaction
    /// @notice Encode hash of the legacy transaction type.
    /// @return keccak256 of the serialized RLP encoded representation of transaction
    function __encodeHashRSK4337Transaction(Transaction calldata _transaction)
        private
        view
        returns (bytes32)
    { 
        return bytes32(0); //todo(shree) base implementation using simialr structure as legacy transaction 
    }



    // todo(shree) this is what we'll modify for our new Transaction type
    /// @notice Encode hash of the legacy transaction type.
    /// @return keccak256 of the serialized RLP encoded representation of transaction
    function _encodeHashLegacyTransaction(Transaction calldata _transaction)
        private
        view
        returns (bytes32)
    {
        // Hash of legacy transactions are encoded as one of the:
        // - RLP(nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0)
        // - RLP(nonce, gasPrice, gasLimit, to, value, data)
        //
        // In this RLP encoding, only the first one above list appears, so we encode each element
        // inside list and then concatenate the length of all elements with them.

        bytes memory encodedNonce = RLPEncoder.encodeUint256(_transaction.nonce);
        // Encode `gasPrice` and `gasLimit` together to prevent "stack too deep error".
        bytes memory encodedGasParam;
        {
            bytes memory encodedGasPrice = RLPEncoder.encodeUint256(
                _transaction.maxFeePerGas
            );
            bytes memory encodedGasLimit = RLPEncoder.encodeUint256(
                _transaction.gasLimit
            );
            encodedGasParam = bytes.concat(encodedGasPrice, encodedGasLimit);
        }

        bytes memory encodedTo = RLPEncoder.encodeAddress(address(uint160(_transaction.to)));
        bytes memory encodedValue = RLPEncoder.encodeUint256(_transaction.value);
        // Encode only the length of the transaction data, and not the data itself,
        // so as not to copy to memory a potentially huge transaction data twice.
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

        // Encode `chainId` according to EIP-155, but only if the `chainId` is specified in the transaction.
        bytes memory encodedChainId;
        if (_transaction.reserved[0] != 0) {
            encodedChainId = bytes.concat(RLPEncoder.encodeUint256(block.chainid), hex"80_80");
        }

        bytes memory encodedListLength;
        
        unchecked {
            uint256 listLength = encodedNonce.length +
                encodedGasParam.length +
                encodedTo.length +
                encodedValue.length +
                encodedDataLength.length +
                _transaction.data.length +
                encodedChainId.length;

            // Safe cast, because the length of the list can't be so large.
            encodedListLength = RLPEncoder.encodeListLen(uint64(listLength));
        }

        return
            keccak256(
                bytes.concat(
                    encodedListLength, //todo(shree) this triggers compilation error when optimizer is enabled
                    encodedNonce,
                    encodedGasParam,
                    encodedTo,
                    encodedValue,
                    encodedDataLength,
                    _transaction.data,
                    encodedChainId
                )
            );
    }

    // todo(shree) unused fields commented out in this version. In initial implementation we
    //  may not even use 712 encoded stuff
    /// @notice Encode hash of the zkSync native transaction type.
    /// @return keccak256 hash of the EIP-712 encoded representation of transaction
    function _encodeHashEIP712Transaction(Transaction calldata _transaction)
        private
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                EIP712_TRANSACTION_TYPE_HASH,
                _transaction.txType,
                _transaction.from,
                _transaction.to,
                _transaction.gasLimit,
                //_transaction.gasPerPubdataByteLimit,
                _transaction.maxFeePerGas,
                _transaction.maxPriorityFeePerGas,
                //_transaction.paymaster,
                _transaction.nonce,
                _transaction.value,
                keccak256(_transaction.data)
                //keccak256(abi.encodePacked(_transaction.factoryDeps)),
                //keccak256(_transaction.paymasterInput)
            )
        );

        // todo(shree) if we use in future, we cannot use zksync references.. replace with contingent placeholders
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("rootstock-aa"),
                keccak256("1"),
                block.chainid
            )
        );

        return
            keccak256(
                abi.encodePacked("\x19\x01", domainSeparator, structHash)
            );
    }



    //todo(shree) methods related to paymaster or paytobootloader etc deleted. Not relevant at this stage

    // Returns the balance required to process the transaction.
    // todo(shree) this used to have additional logic related to paymaster
	function totalRequiredBalance(Transaction calldata _transaction) internal pure returns (uint256 requiredBalance) {
        requiredBalance =  _transaction.maxFeePerGas * _transaction.gasLimit + _transaction.value;
    }
}
