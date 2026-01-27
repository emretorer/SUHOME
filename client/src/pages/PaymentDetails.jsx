import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/payment-flow.css";

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

function PaymentDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};

  const maskedCard = useMemo(() => maskCardNumber(state.cardNumber), [state.cardNumber]);

  const handleProceed = () => {
    navigate("/payment-bank", { state });
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
          <h1>Payment Details</h1>
          <p>Verify your card details before continuing to bank approval.</p>
        </div>
        <Link to="/checkout" className="payment-flow__back">
          ← Back to checkout
        </Link>
      </header>

      <div className="payment-flow__grid">
        <article className="payment-card payment-card--soft">
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
            <strong>{state.cardName || state.customerName || "Customer"}</strong>
          </div>
          <div className="payment-card__field">
            <span>Expiry Date</span>
            <strong>{state.expiry || "--/--"}</strong>
          </div>
          <div className="payment-card__field">
            <span>Amount</span>
            <strong>₺{formatAmount(state.amount)}</strong>
          </div>
          <p className="payment-card__note">
            You will be redirected to your bank for payment approval.
          </p>
          <button type="button" className="payment-btn payment-btn--primary" onClick={handleProceed}>
            Proceed to Bank
          </button>
        </article>
      </div>
    </section>
  );
}

export default PaymentDetails;
