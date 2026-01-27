import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/payment-flow.css";

const formatAmount = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function PaymentBank() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};

  const handleApprove = () => {
    navigate("/payment-bank-result", {
      replace: true,
      state: {
        ...state,
      },
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
          <h1>Bank Approval</h1>
          <p>Confirm the payment with your bank.</p>
        </div>
        <Link to="/payment-details" className="payment-flow__back">
          ← Back to details
        </Link>
      </header>

      <div className="payment-flow__grid">
        <article className="payment-card payment-card--bank">
          <div className="payment-card__bank-header">
            <span>BANKSECURE</span>
            <small>PAYMENT SYSTEM</small>
          </div>
          <h3>SUHOME Online Store</h3>
          <p className="payment-card__amount">
            Amount: <strong>₺{formatAmount(state.amount)}</strong>
          </p>
          <p className="payment-card__note">
            Do you approve the payment of ₺{formatAmount(state.amount)}?
          </p>
          <button type="button" className="payment-btn payment-btn--success" onClick={handleApprove}>
            Approve
          </button>
          <Link to="/payment-details" className="payment-btn payment-btn--ghost">
            Decline
          </Link>
        </article>
      </div>
    </section>
  );
}

export default PaymentBank;
