import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import PiNetwork from 'pi-backend';

// DO NOT expose these values to public
const env = Deno.env();
const apiKey = env['PI_API_KEY'] || "ddrt2ie1cbbz3xlrjemeqc5ipmkt281jghocbs4oxsnx8k2bzi4jdswh2kh1k2r8";
const walletPrivateSeed = env['PI_WALLET_PRIVATE_SEED'] || "SDZCNRDROZQSM4UR6BGN7D3BOXBIZN2D2VQOV5I3IB23WVVC7IGAT2UM";
const validationKey = env['PI_VALIDATION_KEY'] || "aaa6e320d0e15d0a896550925d87185b0a6a615015604c31bbfbbdb7dd9b290c30fff5ae67c7f266a048562a99edda4df8b6db7c599e867200b5cbac9a95d3b1";

const pi = new PiNetwork(apiKey, walletPrivateSeed);

// Log initialization (without exposing secrets)
console.log('Pi Network SDK initialized with API key and wallet seed');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, ...data } = await req.json();

    switch (action) {
      case 'createPayment': {
        const { recipientUid, recipientUsername, amount, memo, metadata } = data;
        
        console.log(`Creating A2U payment: ${amount} π to ${recipientUid} (${recipientUsername})`);
        console.log('Payment data:', { amount, memo, metadata, uid: recipientUid });
        
        try {
          // Follow exact PaymentArgs structure from Pi Network docs
          const paymentData = {
            amount: amount,
            memo: memo,
            metadata: {
              ...metadata,
              recipientUsername: recipientUsername,
              type: 'a2u_payment',
              timestamp: new Date().toISOString()
            },
            uid: recipientUid
          };
          
          console.log('Creating payment with data:', paymentData);
          const paymentId = await pi.createPayment(paymentData);
          console.log(`Payment created: ${paymentId}`);

          console.log('Submitting payment to blockchain...');
          const txid = await pi.submitPayment(paymentId);
          console.log(`Payment submitted: ${txid}`);
          
          console.log('Completing payment...');
          const completedPayment = await pi.completePayment(paymentId, txid);
          console.log(`Payment completed: ${paymentId}`, completedPayment);

          return new Response(
            JSON.stringify({ 
              success: true, 
              paymentId: paymentId, 
              txid: txid,
              payment: completedPayment,
              blockchain: true,
              network: completedPayment.network || 'Pi Testnet'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (paymentError: any) {
          console.error('Payment creation failed:', paymentError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: paymentError.message || 'Payment creation failed',
              details: paymentError.toString()
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'createWithdrawal': {
        const { recipientAddress, amount, memo } = data;
        
        console.log(`Creating withdrawal: ${amount} π to ${recipientAddress}`);
        
        // Create a payment to the wallet address (this is how withdrawals work in Pi Network)
        const paymentId = await pi.createPayment({
          amount: amount,
          memo: memo,
          metadata: {
            type: 'withdrawal',
            recipientAddress: recipientAddress,
            timestamp: new Date().toISOString()
          },
          // For withdrawals to wallet addresses, we use the address as the identifier
          uid: recipientAddress
        });

        console.log(`Withdrawal payment created: ${paymentId}`);

        const txid = await pi.submitPayment(paymentId);
        console.log(`Withdrawal submitted: ${txid}`);
        
        await pi.completePayment(paymentId, txid);
        console.log(`Withdrawal completed: ${paymentId}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            withdrawalId: paymentId, 
            txid: txid,
            blockchain: true,
            network: 'testnet'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getPaymentStatus': {
        const { paymentId } = data;
        const payment = await pi.getPayment(paymentId);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: payment.status?.developer_completed ? 'completed' : 'pending',
            txid: payment.transaction?.txid
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'cancelPayment': {
        const { paymentId } = data;
        await pi.cancelPayment(paymentId);
        
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getIncompleteServerPayments': {
        try {
          const incompletePayments = await pi.getIncompleteServerPayments();
          console.log(`Found ${incompletePayments.length} incomplete payments`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              payments: incompletePayments 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('Error getting incomplete payments:', error);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: error.message || 'Failed to get incomplete payments' 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('A2U API error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
