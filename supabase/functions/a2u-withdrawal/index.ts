import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PI_API_BASE = "https://api.minepi.com";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const piApiKey = Deno.env.get("PI_API_KEY");
  const walletPrivateSeed = Deno.env.get("PI_WALLET_PRIVATE_SEED");

  if (!piApiKey) {
    return jsonResponse({ error: "PI_API_KEY not configured" }, 500);
  }
  if (!walletPrivateSeed) {
    return jsonResponse({ error: "PI_WALLET_PRIVATE_SEED not configured" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { action, withdrawalId, amount, recipientAddress, memo, developerId } = body;

    // ---- PROCESS WITHDRAWAL: Process A2U withdrawal ----
    if (action === "process_withdrawal") {
      if (!withdrawalId || !amount || !recipientAddress || !developerId) {
        return jsonResponse({ 
          error: "withdrawalId, amount, recipientAddress, and developerId are required" 
        }, 400);
      }

      // Step 1: Create A2U payment to recipient
      const createRes = await fetch(`${PI_API_BASE}/v2/payments`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment: {
            amount: Number(amount),
            memo: memo || `Withdrawal to ${recipientAddress}`,
            metadata: { 
              type: 'withdrawal',
              withdrawal_id: withdrawalId,
              developer_id: developerId
            },
            uid: recipientAddress,
          },
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error("Pi withdrawal create error:", createRes.status, errBody);
        
        // Update withdrawal status to failed
        await supabase
          .from("withdrawal_requests")
          .update({ status: "failed" })
          .eq("id", withdrawalId);
          
        return jsonResponse({ error: `Pi API error: ${errBody}` }, createRes.status);
      }

      const createData = await createRes.json();
      const createdPaymentId = createData.identifier;
      console.log("A2U withdrawal payment created:", createdPaymentId);

      // Update withdrawal request with payment ID
      await supabase
        .from("withdrawal_requests")
        .update({ 
          status: "processing",
          payment_id: createdPaymentId 
        })
        .eq("id", withdrawalId);

      // Step 2: Submit the payment to blockchain
      const submitRes = await fetch(`${PI_API_BASE}/v2/payments/${createdPaymentId}/submit`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_wallet_seed: walletPrivateSeed,
        }),
      });

      if (!submitRes.ok) {
        const errBody = await submitRes.text();
        console.error("Pi withdrawal submit error:", submitRes.status, errBody);
        
        // Update withdrawal status to failed
        await supabase
          .from("withdrawal_requests")
          .update({ status: "failed" })
          .eq("id", withdrawalId);
          
        return jsonResponse({ error: `Pi submit error: ${errBody}` }, submitRes.status);
      }

      const submitData = await submitRes.json();
      const submittedTxid = submitData.txid || submitData.transaction?.txid;
      console.log("A2U withdrawal submitted, txid:", submittedTxid);

      // Update withdrawal with transaction ID
      await supabase
        .from("withdrawal_requests")
        .update({ 
          txid: submittedTxid,
          status: "submitted" 
        })
        .eq("id", withdrawalId);

      // Step 3: Complete the payment
      const completeRes = await fetch(`${PI_API_BASE}/v2/payments/${createdPaymentId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txid: submittedTxid }),
      });

      if (!completeRes.ok) {
        const errBody = await completeRes.text();
        console.error("Pi withdrawal complete error:", completeRes.status, errBody);
        
        // Update withdrawal status to failed
        await supabase
          .from("withdrawal_requests")
          .update({ status: "failed" })
          .eq("id", withdrawalId);
          
        return jsonResponse({ error: `Pi complete error: ${errBody}` }, completeRes.status);
      }

      const completeData = await completeRes.json();
      console.log("A2U withdrawal completed:", completeData);

      // Update withdrawal to completed status
      await supabase
        .from("withdrawal_requests")
        .update({ 
          status: "completed",
          processed_at: new Date().toISOString(),
          txid: submittedTxid 
        })
        .eq("id", withdrawalId);

      return jsonResponse({ 
        success: true, 
        txid: submittedTxid, 
        paymentId: createdPaymentId,
        data: completeData 
      });
    }

    // ---- GET WITHDRAWAL: Get withdrawal details ----
    if (action === "get_withdrawal") {
      if (!withdrawalId) {
        return jsonResponse({ error: "withdrawalId is required" }, 400);
      }

      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", withdrawalId)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ success: true, data });
    }

    // ---- CANCEL WITHDRAWAL: Cancel a withdrawal ----
    if (action === "cancel_withdrawal") {
      if (!withdrawalId) {
        return jsonResponse({ error: "withdrawalId is required" }, 400);
      }

      // Get withdrawal details first
      const { data: withdrawal, error: fetchError } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", withdrawalId)
        .single();

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 404);
      }

      // If payment was created, try to cancel it
      if (withdrawal.payment_id && withdrawal.status !== 'completed') {
        const cancelRes = await fetch(`${PI_API_BASE}/v2/payments/${withdrawal.payment_id}/cancel`, {
          method: "POST",
          headers: {
            Authorization: `Key ${piApiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (cancelRes.ok) {
          console.log("A2U withdrawal payment cancelled:", withdrawal.payment_id);
        }
      }

      // Update withdrawal status to cancelled
      await supabase
        .from("withdrawal_requests")
        .update({ status: "cancelled" })
        .eq("id", withdrawalId);

      return jsonResponse({ success: true, message: "Withdrawal cancelled" });
    }

    return jsonResponse({ 
      error: "Invalid action. Use: process_withdrawal, get_withdrawal, cancel_withdrawal" 
    }, 400);
  } catch (err: unknown) {
    console.error("A2U withdrawal error:", err);
    return jsonResponse({ 
      error: err instanceof Error ? err.message : "Unknown error" 
    }, 500);
  }
});
