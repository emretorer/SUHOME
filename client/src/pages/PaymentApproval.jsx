import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/payment-approval.css";

const maskCardNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "**** **** **** ****";
  const last4 = digits.slice(-4).padStart(4, "•");
  return `**** **** **** ${last4}`;
};

const formatAmount = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function PaymentApproval() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};
  const orderId = state.orderId;
  const amount = Number(state.amount || 0);
  const cardNumber = state.cardNumber || "";
  const expiry = state.expiry || "";
  const cardName = state.cardName || "";
  const customerName = state.customerName || "";

  const [stage, setStage] = useState("details");
  const [decision, setDecision] = useState(null);

  const transactionId = useMemo(() => {
    if (!orderId) return "BNK-000000";
    return `BNK-${String(orderId).padStart(6, "0")}`;
  }, [orderId]);

  const maskedCard = useMemo(() => maskCardNumber(cardNumber), [cardNumber]);

  const handleProceed = () => setStage("bank");
  const handleApprove = () => {
    setDecision("approved");
    setStage("approved");
  };
  const handleReject = () => {
    setDecision("rejected");
    setStage("rejected");
  };

  const handleViewInvoice = () => {
    if (!orderId) return;
    navigate(`/invoice/${encodeURIComponent(orderId)}`, { state: { orderId } });
  };

  const handleRetry = () => navigate("/checkout");

  if (!orderId) {
    return (
      <section className="payment-approval payment-approval--empty">
        <div className="payment-approval__empty-card">
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
    <section className="payment-approval">
      <header className="payment-approval__header">
        <div>
          <h1>Payment Verification</h1>
          <p>Complete the bank confirmation to finalize your order.</p>
        </div>
        <Link to="/cart" className="payment-approval__back">
          ← Back to cart
        </Link>
      </header>

      <div className="payment-approval__grid">
        <article className={`payment-card ${stage === "details" ? "is-active" : ""}`}>
          <div className="payment-card__brand">
            <span className="payment-card__back">←</span>
            <div>
              <span className="payment-card__logo">SUHOME</span>
              <small>Online Store</small>
            </div>
          </div>
          <h3>Payment Details</h3>
          <p className="payment-card__subtitle">Credit Card Information</p>
          <div className="payment-card__field">
            <span>Card Number</span>
            <strong>{maskedCard}</strong>
          </div>
          <div className="payment-card__field">
            <span>Card Holder</span>
            <strong>{cardName || customerName || "Customer"}</strong>
          </div>
          <div className="payment-card__field">
            <span>Expiry Date</span>
            <strong>{expiry || "--/--"}</strong>
          </div>
          <div className="payment-card__note">
            You will be redirected to your bank for payment approval.
          </div>
          <button type="button" className="payment-btn payment-btn--primary" onClick={handleProceed}>
            Proceed to Bank
          </button>
        </article>

        <article className={`payment-card payment-card--bank ${stage === "bank" ? "is-active" : ""}`}>
          <div className="payment-card__bank-header">
            <span>BANKSECURE</span>
            <small>PAYMENT SYSTEM</small>
          </div>
          <h3>SUHOME Online Store</h3>
          <div className="payment-card__amount">
            Amount: <strong>₺{formatAmount(amount)}</strong>
          </div>
          <button type="button" className="payment-btn payment-btn--success" onClick={handleApprove}>
            Approve Payment
          </button>
          <button type="button" className="payment-btn payment-btn--danger" onClick={handleReject}>
            Reject Payment
          </button>
        </article>

        <article className={`payment-card ${stage === "approved" ? "is-active" : ""}`}>
          <div className={`payment-card__status ${decision === "approved" ? "is-success" : "is-pending"}`}>
            {decision === "approved" ? "✓" : decision === "rejected" ? "!" : "…"}
          </div>
          <h3>
            {decision === "approved"
              ? "Payment Approved!"
              : decision === "rejected"
              ? "Payment Rejected"
              : "Waiting for approval"}
          </h3>
          <p>
            {decision === "approved"
              ? "Your payment has been successfully processed."
              : decision === "rejected"
              ? "Your payment was declined. Please try another card."
              : "Once you approve, your payment will be confirmed here."}
          </p>
          <div className="payment-card__field payment-card__field--center">
            <span>Transaction ID</span>
            <strong>{transactionId}</strong>
          </div>
          <div className="payment-card__note">
            {decision === "approved"
              ? "Invoice has been generated and sent to your email."
              : "You can retry the payment from checkout."}
          </div>
          <div className="payment-card__actions">
            {decision === "approved" ? (
              <>
                <button type="button" className="payment-btn payment-btn--primary" onClick={handleViewInvoice}>
                  View Invoice
                </button>
                <Link to="/" className="payment-btn payment-btn--ghost">
                  Back to Store
                </Link>
              </>
            ) : (
              <button type="button" className="payment-btn payment-btn--primary" onClick={handleRetry}>
                Back to Checkout
              </button>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default PaymentApproval;
