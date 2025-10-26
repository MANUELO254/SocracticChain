// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getUpdateFee(bytes[] calldata) external pure returns (uint256) {
        return 1 wei;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {}

    function getPriceNoOlderThan(bytes32, uint256) external view returns (Price memory) {
        return Price({price: 2000 * 1e8, conf: 0, expo: -8, publishTime: block.timestamp});
    }
}
