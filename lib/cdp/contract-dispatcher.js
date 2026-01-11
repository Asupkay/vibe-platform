/**
 * Contract Dispatcher - Unified interface for blockchain contract calls
 *
 * Handles interactions with:
 * - X402Micropayments (instant tips with 2.5% fee)
 * - VibeEscrow (escrow with 48h timeout)
 *
 * Strategy: Singleton pattern with lazy initialization
 */

const { ethers } = require('ethers');
const { Wallet } = require('@coinbase/coinbase-sdk');

// Minimal ABIs for the functions we need
const X402_ABI = [
  'function payForRequest(address recipient, uint256 amount, string memory service, bytes32 requestId) external',
  'function getPayment(bytes32 requestId) external view returns (address payer, address recipient, uint256 amount, string memory service, uint256 timestamp)',
  'event PaymentMade(address indexed payer, address indexed recipient, uint256 amount, string service, bytes32 requestId)'
];

const ESCROW_ABI = [
  'function createEscrow(address expert, uint256 amount, string memory question, string memory service, bytes32 escrowId) external',
  'function completeEscrow(bytes32 escrowId) external',
  'function autoCompleteEscrow(bytes32 escrowId) external',
  'function disputeEscrow(bytes32 escrowId) external',
  'function getEscrow(bytes32 escrowId) external view returns (address asker, address expert, uint256 amount, string memory question, string memory service, uint256 createdAt, uint256 timeout, uint8 status)',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed asker, address indexed expert, uint256 amount, string question)',
  'event EscrowCompleted(bytes32 indexed escrowId, address indexed expert, uint256 amount)',
  'event EscrowAutoCompleted(bytes32 indexed escrowId, address indexed expert, uint256 amount)',
  'event EscrowDisputed(bytes32 indexed escrowId, address indexed disputer)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)'
];

class ContractDispatcher {
  constructor(config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    // Create contract instances (read-only initially)
    this.x402Contract = new ethers.Contract(config.x402Address, X402_ABI, this.provider);
    this.escrowContract = new ethers.Contract(config.escrowAddress, ESCROW_ABI, this.provider);
    this.usdcContract = new ethers.Contract(config.usdcAddress, ERC20_ABI, this.provider);
  }

  /**
   * Extract private key from CDP wallet data
   * CDP wallets store the seed in wallet.data format
   */
  async getSigner(walletData) {
    try {
      const parsed = JSON.parse(walletData);

      // CDP wallet exports contain seed or private key
      // For now, we'll need to extract the wallet's default address private key
      // This will need to be updated based on actual CDP wallet structure

      // Placeholder: In production, you'd use CDP SDK to get the signer
      // For now, we'll assume walletData contains the seed or private key
      if (parsed.seed) {
        const wallet = ethers.Wallet.fromPhrase(parsed.seed);
        return wallet.connect(this.provider);
      } else if (parsed.privateKey) {
        return new ethers.Wallet(parsed.privateKey, this.provider);
      }

      throw new Error('Unable to extract private key from wallet data');
    } catch (error) {
      console.error('[ContractDispatcher] getSigner error:', error);
      throw new Error(`Failed to create signer: ${error.message}`);
    }
  }

  /**
   * Tip: Instant payment via X402 (WAITS for confirmation ~3 sec)
   *
   * @param {Object} params
   * @param {string} params.from - Sender handle (e.g., "@alice")
   * @param {string} params.to - Recipient handle (e.g., "@bob")
   * @param {number} params.amount - Amount in USDC (human-readable, e.g., 5.50)
   * @param {string} params.message - Optional message
   * @param {string} params.requestId - Unique request ID (hex string)
   * @param {string} params.fromWalletData - Sender's wallet data from KV
   * @param {string} params.toAddress - Recipient's wallet address
   *
   * @returns {Promise<TipResult>}
   */
  async tip(params) {
    try {
      console.log(`[ContractDispatcher] Tipping ${params.amount} USDC from ${params.from} to ${params.to}`);

      // Get signer from wallet data
      const signer = await this.getSigner(params.fromWalletData);

      // Connect contracts with signer
      const x402 = this.x402Contract.connect(signer);
      const usdc = this.usdcContract.connect(signer);

      // Calculate amount in USDC (6 decimals)
      const amountUSDC = ethers.parseUnits(params.amount.toString(), 6);

      console.log(`[ContractDispatcher] Approving ${amountUSDC} USDC...`);

      // Check/approve USDC allowance
      const allowance = await usdc.allowance(signer.address, this.config.x402Address);
      if (allowance < amountUSDC) {
        const approveTx = await usdc.approve(this.config.x402Address, amountUSDC);
        await approveTx.wait(); // Wait for approval
        console.log(`[ContractDispatcher] USDC approved: ${approveTx.hash}`);
      }

      console.log(`[ContractDispatcher] Calling payForRequest...`);

      // Call payForRequest
      const requestIdBytes32 = params.requestId.startsWith('0x')
        ? params.requestId
        : ethers.id(params.requestId);

      const tx = await x402.payForRequest(
        params.toAddress,
        amountUSDC,
        'tip',
        requestIdBytes32
      );

      console.log(`[ContractDispatcher] Transaction sent: ${tx.hash}`);
      console.log(`[ContractDispatcher] Waiting for confirmation...`);

      // WAIT for confirmation (~3 sec on Base)
      const receipt = await tx.wait();

      console.log(`[ContractDispatcher] Transaction confirmed in block ${receipt.blockNumber}`);

      // Parse PaymentMade event
      const event = receipt.logs
        .map(log => {
          try {
            return x402.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(parsed => parsed?.name === 'PaymentMade');

      const fee = params.amount * 0.025; // 2.5%

      return {
        tx_hash: receipt.hash,
        status: 'confirmed',
        block_number: receipt.blockNumber,
        fee,
        event: event ? {
          payer: event.args.payer,
          recipient: event.args.recipient,
          amount: ethers.formatUnits(event.args.amount, 6)
        } : undefined
      };

    } catch (error) {
      console.error('[ContractDispatcher] Tip error:', error);
      throw new Error(`Tip failed: ${error.message}`);
    }
  }

  /**
   * Escrow: Create escrow (RETURNS PENDING immediately, doesn't wait)
   *
   * @param {Object} params
   * @param {string} params.from - Asker handle
   * @param {string} params.to - Expert handle
   * @param {number} params.amount - Amount in USDC
   * @param {string} params.description - Task description
   * @param {string} params.escrowId - Unique escrow ID (bytes32)
   * @param {number} params.timeoutHours - Timeout in hours (default 48)
   * @param {string} params.fromWalletData - Asker's wallet data
   * @param {string} params.toAddress - Expert's wallet address
   *
   * @returns {Promise<EscrowResult>}
   */
  async createEscrow(params) {
    try {
      console.log(`[ContractDispatcher] Creating escrow ${params.amount} USDC from ${params.from} to ${params.to}`);

      const signer = await this.getSigner(params.fromWalletData);
      const escrow = this.escrowContract.connect(signer);
      const usdc = this.usdcContract.connect(signer);

      const amountUSDC = ethers.parseUnits(params.amount.toString(), 6);

      console.log(`[ContractDispatcher] Approving ${amountUSDC} USDC for escrow...`);

      // Approve USDC
      const allowance = await usdc.allowance(signer.address, this.config.escrowAddress);
      if (allowance < amountUSDC) {
        const approveTx = await usdc.approve(this.config.escrowAddress, amountUSDC);
        await approveTx.wait();
        console.log(`[ContractDispatcher] USDC approved: ${approveTx.hash}`);
      }

      console.log(`[ContractDispatcher] Calling createEscrow...`);

      // Create escrow
      const escrowIdBytes32 = params.escrowId.startsWith('0x')
        ? params.escrowId
        : ethers.id(params.escrowId);

      const tx = await escrow.createEscrow(
        params.toAddress,
        amountUSDC,
        params.description,
        'expert_help',
        escrowIdBytes32
      );

      console.log(`[ContractDispatcher] Escrow transaction sent: ${tx.hash}`);

      // DO NOT WAIT - return immediately
      return {
        tx_hash: tx.hash,
        escrow_id: params.escrowId,
        status: 'pending' // Will be confirmed async
      };

    } catch (error) {
      console.error('[ContractDispatcher] Create escrow error:', error);
      throw new Error(`Escrow creation failed: ${error.message}`);
    }
  }

  /**
   * Complete escrow: Release funds to expert (WAITS for confirmation)
   *
   * @param {Object} params
   * @param {string} params.escrowId - Escrow ID (bytes32)
   * @param {string} params.askerHandle - Asker's handle
   * @param {string} params.askerWalletData - Asker's wallet data
   *
   * @returns {Promise<CompleteResult>}
   */
  async completeEscrow(params) {
    try {
      console.log(`[ContractDispatcher] Completing escrow ${params.escrowId}`);

      const signer = await this.getSigner(params.askerWalletData);
      const escrow = this.escrowContract.connect(signer);

      const escrowIdBytes32 = params.escrowId.startsWith('0x')
        ? params.escrowId
        : ethers.id(params.escrowId);

      // Call completeEscrow
      const tx = await escrow.completeEscrow(escrowIdBytes32);

      console.log(`[ContractDispatcher] Complete escrow transaction sent: ${tx.hash}`);
      console.log(`[ContractDispatcher] Waiting for confirmation...`);

      // WAIT for confirmation
      const receipt = await tx.wait();

      console.log(`[ContractDispatcher] Escrow completed in block ${receipt.blockNumber}`);

      // Parse EscrowCompleted event
      const event = receipt.logs
        .map(log => {
          try {
            return escrow.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(parsed => parsed?.name === 'EscrowCompleted');

      const amountReleased = event
        ? parseFloat(ethers.formatUnits(event.args.amount, 6))
        : 0;

      return {
        tx_hash: receipt.hash,
        status: 'confirmed',
        amountReleased,
        fee: amountReleased * 0.025 // 2.5%
      };

    } catch (error) {
      console.error('[ContractDispatcher] Complete escrow error:', error);
      throw new Error(`Escrow completion failed: ${error.message}`);
    }
  }

  /**
   * Get transaction status by polling the blockchain
   *
   * @param {string} txHash - Transaction hash
   * @returns {Promise<TxStatus>}
   */
  async getTransactionStatus(txHash) {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return { status: 'pending' };
      }

      if (receipt.status === 1) {
        return {
          status: 'confirmed',
          blockNumber: receipt.blockNumber
        };
      }

      return { status: 'failed' };

    } catch (error) {
      console.error('[ContractDispatcher] getTransactionStatus error:', error);
      return { status: 'error', error: error.message };
    }
  }
}

// Singleton instance
let dispatcherInstance = null;

/**
 * Get or create the singleton ContractDispatcher instance
 *
 * @returns {ContractDispatcher}
 */
function getDispatcher() {
  if (!dispatcherInstance) {
    const config = {
      x402Address: process.env.X402_CONTRACT_ADDRESS,
      escrowAddress: process.env.ESCROW_CONTRACT_ADDRESS,
      usdcAddress: process.env.USDC_ADDRESS,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      network: 'base-sepolia'
    };

    // Validate config
    if (!config.x402Address || !config.escrowAddress || !config.usdcAddress) {
      throw new Error('Contract addresses not configured. Set X402_CONTRACT_ADDRESS, ESCROW_CONTRACT_ADDRESS, and USDC_ADDRESS in environment variables.');
    }

    dispatcherInstance = new ContractDispatcher(config);
    console.log('[ContractDispatcher] Singleton instance created');
  }

  return dispatcherInstance;
}

module.exports = {
  ContractDispatcher,
  getDispatcher
};
