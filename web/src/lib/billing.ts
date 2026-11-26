/** Telegraph's own billing-proof URL for an escrow call: the node's delivery record for that receipt in that epoch. */
export const billingProofUrl = (epochId: number | null | undefined, receiptHash: string | null | undefined): string | null =>
  epochId == null || !receiptHash || !__NETWORK__.telegraph_node ? null : `${__NETWORK__.telegraph_node.replace(/\/$/, "")}/v1/blocks/${epochId}/deliveries/${receiptHash}`;
