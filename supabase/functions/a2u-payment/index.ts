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
    const { action, recipientUid, recipientUsername, amount, memo, metadata, senderUserId, paymentId, txid } = body;

    // ---- CREATE: Create an A2U payment ----
    if (action === "create") {
      if (!recipientUid || !amount || !memo) {
        return jsonResponse({ error: "recipientUid, amount, and memo are required" }, 400);
      }

      // Step 1: Create the payment on Pi server
      const createRes = await fetch(`${PI_API_BASE}/v2/payments`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment: {
            amount: Number(amount),
            memo,
            metadata: metadata || {},
            uid: recipientUid,
          },
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error("Pi create payment error:", createRes.status, errBody);
        return jsonResponse({ error: `Pi API error: ${errBody}` }, createRes.status);
      }

      const createData = await createRes.json();
      const createdPaymentId = createData.identifier;
      console.log("A2U payment created:", createdPaymentId);

      // Store in database
      if (senderUserId) {
        await supabase.from("a2u_payments").insert({
          sender_user_id: senderUserId,
          recipient_pi_uid: recipientUid,
          recipient_username: recipientUsername || null,
          amount: Number(amount),
          memo,
          metadata: metadata || {},
          payment_id: createdPaymentId,
          status: "created",
        });
      }

      return jsonResponse({ success: true, paymentId: createdPaymentId, data: createData });
    }

    // ---- SUBMIT: Submit the payment to blockchain ----
    if (action === "submit") {
      if (!paymentId) {
        return jsonResponse({ error: "paymentId is required" }, 400);
      }

      // Build and submit the transaction using the wallet private seed
      // The Pi API v2 handles the transaction submission
      const submitRes = await fetch(`${PI_API_BASE}/v2/payments/${paymentId}/submit`, {
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
        console.error("Pi submit payment error:", submitRes.status, errBody);
        return jsonResponse({ error: `Pi submit error: ${errBody}` }, submitRes.status);
      }

      const submitData = await submitRes.json();
      const submittedTxid = submitData.txid || submitData.transaction?.txid;
      console.log("A2U payment submitted, txid:", submittedTxid);

      // Update database
      await supabase
        .from("a2u_payments")
        .update({ txid: submittedTxid, status: "submitted" })
        .eq("payment_id", paymentId);

      return jsonResponse({ success: true, txid: submittedTxid, data: submitData });
    }

    // ---- COMPLETE: Complete the payment ----
    if (action === "complete") {
      if (!paymentId || !txid) {
        return jsonResponse({ error: "paymentId and txid are required" }, 400);
      }

      const completeRes = await fetch(`${PI_API_BASE}/v2/payments/${paymentId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txid }),
      });

      if (!completeRes.ok) {
        const errBody = await completeRes.text();
        console.error("Pi complete payment error:", completeRes.status, errBody);
        return jsonResponse({ error: `Pi complete error: ${errBody}` }, completeRes.status);
      }

      const completeData = await completeRes.json();
      console.log("A2U payment completed:", completeData);

      // Update database
      await supabase
        .from("a2u_payments")
        .update({ status: "completed", txid })
        .eq("payment_id", paymentId);

      return jsonResponse({ success: true, data: completeData });
    }

    // ---- GET INCOMPLETE: Get incomplete server payments ----
    if (action === "get_incomplete") {
      const res = await fetch(`${PI_API_BASE}/v2/payments/incomplete_server_payments`, {
        method: "GET",
        headers: {
          Authorization: `Key ${piApiKey}`,
        },
      });

      if (!res.ok) {
        const errBody = await res.text();
        return jsonResponse({ error: `Pi API error: ${errBody}` }, res.status);
      }

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ---- CANCEL: Cancel a payment ----
    if (action === "cancel") {
      if (!paymentId) {
        return jsonResponse({ error: "paymentId is required" }, 400);
      }

      const cancelRes = await fetch(`${PI_API_BASE}/v2/payments/${paymentId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Key ${piApiKey}`,
          "Content-Type": "application/json",
        },
      });

      const cancelData = await cancelRes.json();

      await supabase
        .from("a2u_payments")
        .update({ status: "cancelled" })
        .eq("payment_id", paymentId);

      return jsonResponse({ success: true, data: cancelData });
    }

    return jsonResponse({ error: "Invalid action. Use: create, submit, complete, cancel, get_incomplete" }, 400);
  } catch (err: unknown) {
    console.error("A2U payment error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
