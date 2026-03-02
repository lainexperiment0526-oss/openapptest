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
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${baseUrl}/functions/v1/a2u-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createPayment',
          ...paymentData
        }),
      });

      const result = await response.json();
      return result;
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
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${baseUrl}/functions/v1/a2u-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createWithdrawal',
          ...withdrawalData
        }),
      });

      const result = await response.json();
      return result;
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
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${baseUrl}/functions/v1/a2u-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getPaymentStatus',
          paymentId
        }),
      });

      const result = await response.json();
      return result;
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
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${baseUrl}/functions/v1/a2u-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancelPayment',
          paymentId
        }),
      });

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error('Cancel payment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel payment'
      };
    }
  }

  /**
   * Get incomplete server payments (for troubleshooting)
   */
  static async getIncompleteServerPayments(): Promise<{
    success: boolean;
    payments?: any[];
    error?: string;
  }> {
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${baseUrl}/functions/v1/a2u-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getIncompleteServerPayments'
        }),
      });

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error('Get incomplete payments error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get incomplete payments'
      };
    }
  }
}

export default A2UService;
