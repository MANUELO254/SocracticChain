// scripts/fundTestAccounts.ts
// Run with: npx ts-node scripts/fundTestAccounts.ts

import { ethers } from "ethers";

// ⚠️ CONFIGURE THESE:
const YOUR_FUNDED_PRIVATE_KEY = "0xYOUR_PRIVATE_KEY_WITH_ETH"; // Account that has testnet ETH
const YOUR_ALCHEMY_KEY = "8AcQ1xczTCQV9-oLhYUDewyQ4jizWZ-r"; // Your Alchemy key from .env

// Test accounts to fund (from testAccounts.ts)
const TEST_ACCOUNTS = [
  { address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", role: "Bob (Candidate)" },
  { address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", role: "Alice (Candidate)" },
  { address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", role: "Joe (Voter)" },
  { address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", role: "Ann (Voter)" },
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", role: "Grace (Juror)" },
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", role: "Henry (Juror)" },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", role: "Iris (Juror)" },
];

// Amount to send to each account
const AMOUNT_PER_ACCOUNT = "0.05"; // 0.05 ETH (enough for ~100 transactions + staking)

async function fundAccounts() {
  console.log("🚀 OP Sepolia Test Account Funding Script\n");
  console.log("=" .repeat(60));

  // Setup provider
  const rpcUrl = `https://opt-sepolia.g.alchemy.com/v2/${YOUR_ALCHEMY_KEY}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Setup wallet
  if (YOUR_FUNDED_PRIVATE_KEY === "0xYOUR_PRIVATE_KEY_WITH_ETH") {
    console.error("❌ ERROR: Please set YOUR_FUNDED_PRIVATE_KEY in the script!");
    console.log("\n📝 Steps:");
    console.log("1. Get testnet ETH from: https://www.alchemy.com/faucets/optimism-sepolia");
    console.log("2. Export your private key from MetaMask");
    console.log("3. Replace YOUR_FUNDED_PRIVATE_KEY in this script");
    console.log("4. Run again: npx ts-node scripts/fundTestAccounts.ts\n");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(YOUR_FUNDED_PRIVATE_KEY, provider);
  
  // Check source account balance
  const balance = await provider.getBalance(wallet.address);
  const balanceEth = ethers.formatEther(balance);
  
  console.log(`\n📍 Funding from: ${wallet.address}`);
  console.log(`💰 Current balance: ${balanceEth} ETH`);
  
  const totalNeeded = parseFloat(AMOUNT_PER_ACCOUNT) * TEST_ACCOUNTS.length;
  console.log(`💸 Will send: ${AMOUNT_PER_ACCOUNT} ETH × ${TEST_ACCOUNTS.length} accounts = ${totalNeeded} ETH`);
  
  if (parseFloat(balanceEth) < totalNeeded + 0.01) {
    console.error(`\n❌ Insufficient balance! Need at least ${totalNeeded + 0.01} ETH`);
    console.log("\n🚰 Get more from faucets:");
    console.log("- https://www.alchemy.com/faucets/optimism-sepolia (0.5 ETH)");
    console.log("- https://faucet.quicknode.com/optimism/sepolia (0.1 ETH)");
    console.log("- https://faucets.chain.link/optimism-sepolia (0.1 ETH)");
    process.exit(1);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("Starting transfers...\n");

  const amount = ethers.parseEther(AMOUNT_PER_ACCOUNT);
  let successCount = 0;
  let failCount = 0;

  for (const account of TEST_ACCOUNTS) {
    try {
      // Check if account already has funds
      const currentBalance = await provider.getBalance(account.address);
      const currentEth = ethers.formatEther(currentBalance);
      
      console.log(`\n👤 ${account.role}`);
      console.log(`   Address: ${account.address}`);
      console.log(`   Current: ${currentEth} ETH`);
      
      if (parseFloat(currentEth) >= parseFloat(AMOUNT_PER_ACCOUNT)) {
        console.log(`   ⏭️  Already funded - skipping`);
        successCount++;
        continue;
      }
      
      console.log(`   💸 Sending ${AMOUNT_PER_ACCOUNT} ETH...`);
      
      const tx = await wallet.sendTransaction({
        to: account.address,
        value: amount,
      });
      
      console.log(`   📝 TX Hash: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      
      if (receipt?.status === 1) {
        const newBalance = await provider.getBalance(account.address);
        const newEth = ethers.formatEther(newBalance);
        console.log(`   ✅ Confirmed! New balance: ${newEth} ETH`);
        successCount++;
      } else {
        console.log(`   ❌ Transaction failed`);
        failCount++;
      }
      
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message || error}`);
      failCount++;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary:");
  console.log(`   ✅ Successful: ${successCount}/${TEST_ACCOUNTS.length}`);
  console.log(`   ❌ Failed: ${failCount}/${TEST_ACCOUNTS.length}`);
  
  const finalBalance = await provider.getBalance(wallet.address);
  const finalBalanceEth = ethers.formatEther(finalBalance);
  console.log(`   💰 Remaining balance: ${finalBalanceEth} ETH`);
  
  if (successCount === TEST_ACCOUNTS.length) {
    console.log("\n🎉 All accounts funded successfully!");
    console.log("\n📋 Next steps:");
    console.log("1. Import accounts to MetaMask using private keys from testAccounts.ts");
    console.log("2. Verify network is set to OP Sepolia");
    console.log("3. Go to /admin and whitelist all accounts");
    console.log("4. Start testing the election workflow!");
  } else {
    console.log("\n⚠️  Some accounts failed to fund. Check errors above.");
  }
  
  console.log("=".repeat(60) + "\n");
}

// Run the script
fundAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });

  