import { createPublicClient, createWalletClient, http, parseGwei, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain } from "viem";

const ARC_TESTNET_CHAIN: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } }
};

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "ok", type: "bool" }]
  }
] as const;

export class ArcClient {
  private publicClient;

  constructor(params: {
    rpcUrl: string;
    usdcAddress: `0x${string}`;
    maxFeeGwei?: number;
    maxPriorityFeeGwei?: number;
  }) {
    const chain: Chain = { ...ARC_TESTNET_CHAIN, rpcUrls: { default: { http: [params.rpcUrl] } } };
    this.publicClient = createPublicClient({ chain, transport: http(params.rpcUrl) });
    this.usdcAddress = params.usdcAddress;
    this.maxFeePerGas = parseGwei(String(params.maxFeeGwei ?? 200));
    this.maxPriorityFeePerGas = parseGwei(String(params.maxPriorityFeeGwei ?? 2));
    this.chain = chain;
    this.rpcUrl = params.rpcUrl;
  }

  private chain: Chain;
  private rpcUrl: string;
  private usdcAddress: `0x${string}`;
  private maxFeePerGas: bigint;
  private maxPriorityFeePerGas: bigint;

  async transferUsdc(params: {
    privateKeyHex: `0x${string}`;
    to: `0x${string}`;
    amountUsdc: number;
  }): Promise<{ txHash: `0x${string}` }> {
    const amount = parseUnits(String(params.amountUsdc), 6);
    const account = privateKeyToAccount(params.privateKeyHex);
    const walletClient = createWalletClient({ chain: this.chain, transport: http(this.rpcUrl), account });
    const hash = await walletClient.writeContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [params.to, amount],
      maxFeePerGas: this.maxFeePerGas,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
  }
}
