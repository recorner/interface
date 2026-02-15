export interface SuccessTransaction {
  id: string
  type: 'send'
  amount: string
  amountUSD: number
  tokenSymbol: string
  recipient: string
  timestamp: number
  status: 'success'
}
