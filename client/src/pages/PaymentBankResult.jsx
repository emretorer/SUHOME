import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/payment-flow.css";

const formatAmount = (value) =>
  Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PaymentBankResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};
  const [paymentError, setPaymentError] = useState("");
  const [paymentSaved, setPaymentSaved] = useState(false);
  const hasSubmitted = useRef(false);

  const transactionId = useMemo(() => {
    if (!state.orderId) return "BNK-000000";
    return `BNK-${String(state.orderId).padStart(6, "0")}`;
  }, [state.orderId]);

  useEffect(() => {
    if (!state.orderId || paymentSaved) return;
    if (hasSubmitted.current) return;
    const storageKey = `payment:${state.orderId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(storageKey)) {
      setPaymentSaved(true);
      return;
    }
    hasSubmitted.current = true;
    const payload = {
      order_id: state.orderId,
      user_id: state.userId || 1,
      amount: state.amount,
      method: "card",
      status: "captured",
      paid_at: new Date().toISOString(),
      transaction_ref: transactionId,
      card_name: state.cardName,
      card_number: state.cardNumber,
      card_expiry: state.expiry,
    };

    fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Payment save failed");
        }
        setPaymentSaved(true);
        setPaymentError("");
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(storageKey, "1");
        }
      })
      .catch((error) => {
        console.error("Payment save failed:", error);
        setPaymentError(error?.message || "Payment could not be saved.");
      });
  }, [paymentSaved, state, transactionId]);

  const handleContinue = () => {
    if (!state.orderId) return;
    navigate(`/invoice/${encodeURIComponent(state.orderId)}`, {
      replace: true,
      state: { orderId: state.orderId },
    });
  };


  if (!state.orderId) {
    return (
      <section className="payment-flow payment-flow--empty">
        <div className="payment-flow__empty-card">
          <h2>Payment step not found</h2>
          <p>Please return to checkout to complete your payment.</p>
          <Link to="/checkout" className="payment-btn payment-btn--primary">
            Back to checkout
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="payment-flow">
      <header className="payment-flow__header">
        <div>
          <h1>Bank Confirmation</h1>
          <p>Your payment has been approved.</p>
        </div>
        <Link to="/payment-details" className="payment-flow__back">
          ← Back to details
        </Link>
      </header>

      <div className="payment-flow__grid">
        <article className="payment-card payment-card--bank">
          <div className="payment-card__status is-success">✓</div>
          <h3>Payment Approved</h3>
          <p className="payment-card__note">Your payment has been successfully processed.</p>
          {paymentError && <p className="payment-card__error">{paymentError}</p>}
          <div className="payment-card__field">
            <span>Amount</span>
            <strong>₺{formatAmount(state.amount)}</strong>
          </div>
          <div className="payment-card__field">
            <span>Transaction ID</span>
            <strong>{transactionId}</strong>
          </div>
          <button type="button" className="payment-btn payment-btn--primary" onClick={handleContinue}>
            Back to store
          </button>
        </article>
      </div>
    </section>
  );
}

export default PaymentBankResult;
