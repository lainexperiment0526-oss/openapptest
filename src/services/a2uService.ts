import PiNetwork from 'pi-backend';

// DO NOT expose these values to public
const apiKey = process.env.VITE_PI_API_KEY || "ddrt2ie1cbbz3xlrjemeqc5ipmkt281jghocbs4oxsnx8k2bzi4jdswh2kh1k2r8";
const walletPrivateSeed = process.env.VITE_PI_WALLET_PRIVATE_SEED || "SDZCNRDROZQSM4UR6BGN7D3BOXBIZN2D2VQOV5I3IB23WVVC7IGAT2UM";

const pi = new PiNetwork(apiKey, walletPrivateSeed);

export interface A2UPaymentRequest {
  recipientUid: string;
  recipientUsername?: string;
  amount: number;
  memo: string;
  metadata?: Record<string, any>;
}

export interface A2UWithdrawalRequest {
  recipientAddress: string;
  amount: number;
  memo: string;
}

export class A2UService {
  /**
   * Create and submit an A2U payment to a user
   */
  static async createPayment(paymentData: A2UPaymentRequest): Promise<{
    success: boolean;
    paymentId?: string;
    txid?: string;
    error?: string;
  }> {
    try {
      // Create the payment
      const paymentId = await pi.createPayment({
        amount: paymentData.amount,
        memo: paymentData.memo,
        metadata: {
          ...paymentData.metadata,
          recipientUsername: paymentData.recipientUsername
        },
        uid: paymentData.recipientUid
      });

      // Submit to blockchain
      const txid = await pi.submitPayment(paymentId);

      // Complete the payment
      await pi.completePayment(paymentId, txid);

      return {
        success: true,
        paymentId: paymentId,
        txid: txid
      };
    } catch (error: any) {
      console.error('A2U payment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create A2U payment'
      };
    }
  }

  /**
   * Create and submit an A2U withdrawal to a wallet address
   */
  static async createWithdrawal(withdrawalData: A2UWithdrawalRequest): Promise<{
    success: boolean;
    withdrawalId?: string;
    txid?: string;
    error?: string;
  }> {
    try {
      // For withdrawals, we need to use the same payment flow but with a different approach
      // Since the Pi Network backend doesn't have separate withdrawal methods,
      // we'll use the payment system with the wallet address as the recipient
      
      // Create a payment that will act as a withdrawal
      const paymentId = await pi.createPayment({
        amount: withdrawalData.amount,
        memo: withdrawalData.memo,
        metadata: {
          type: 'withdrawal',
          recipientAddress: withdrawalData.recipientAddress
        },
        uid: 'withdrawal' // Use a special UID for withdrawals
      });

      // Submit to blockchain
      const txid = await pi.submitPayment(paymentId);

      // Complete the payment
      await pi.completePayment(paymentId, txid);

      return {
        success: true,
        withdrawalId: paymentId,
        txid: txid
      };
    } catch (error: any) {
      console.error('A2U withdrawal error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create A2U withdrawal'
      };
    }
  }

  /**
   * Get payment status
   */
  static async getPaymentStatus(paymentId: string): Promise<{
    success: boolean;
    status?: string;
    txid?: string;
    error?: string;
  }> {
    try {
      const payment = await pi.getPayment(paymentId);
      return {
        success: true,
        status: payment.status?.developer_completed ? 'completed' : 'pending',
        txid: payment.transaction?.txid
      };
    } catch (error: any) {
      console.error('Get payment status error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get payment status'
      };
    }
  }

  /**
   * Cancel a payment
   */
  static async cancelPayment(paymentId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await pi.cancelPayment(paymentId);
      return { success: true };
    } catch (error: any) {
      console.error('Cancel payment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel payment'
      };
    }
  }
}

export default A2UService;
