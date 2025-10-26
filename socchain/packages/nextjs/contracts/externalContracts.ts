import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

import WeightedLottery from "./abis/WeightedLottery.json";
import VettingJury from "./abis/VettingJury.json";
import NominationVoting from "./abis/NominationVoting.json";
import IdentityRegistry from "./abis/IdentityRegistry.json";
import CandidacyNft from "./abis/CandidacyNft.json";

/**
 * External verified contracts
 * @chainId 11155420 → OP Sepolia (replace if using another network)
 */
const externalContracts = {
  11155420: {
    WeightedLottery: {
      address: "0xaeCF00cfa7479527ec47Aa3D68E11AE206C4bC98",
      abi: WeightedLottery.abi,
    },
    VettingJury: {
      address: "0xf67260ed2Bf33c9Dc819c247EF9dc61Cef55D834",
      abi: VettingJury.abi,
    },
    NominationVoting: {
      address: "0x2519A217755e7E31d4FDC6075079Ae15769ffE8a",
      abi: NominationVoting.abi,
    },
    IdentityRegistry: {
      address: "0x59d37399B778729d4B52aBf68Ee5D3deA62De277",
      abi: IdentityRegistry.abi,
    },
    CandidacyNft: {
      address: "0x18dE7B71bb81B8140cD44B36aF0A669cc4e0F2Ca",
      abi: CandidacyNft.abi,
    },
  },
} as const satisfies GenericContractsDeclaration;

export default externalContracts;
