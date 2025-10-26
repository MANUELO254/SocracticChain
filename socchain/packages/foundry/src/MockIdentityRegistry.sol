// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockIdentityRegistry {
    function isEligibleCandidate(address) external pure returns (bool) {
        return true;
    }

    function getActiveAttestationCount(address) external pure returns (uint256) {
        return 0;
    }
}
