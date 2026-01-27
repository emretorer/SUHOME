import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { formatPrice } from "../../utils/formatPrice";
import "./MiniPreview.css";

export default function MiniCartPreview({ onClose, open }) {
  const { items, increment, decrement } = useCart();

  if (!open) return null;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  return (
    <>
      <div className="mini-cart-overlay"/>

      <div
        className={`mini-cart ${open ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mini-cart-header">
          <h3>Cart</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="mini-cart-body">
          {items.length === 0 ? (
            <p>Your cart is empty</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="mini-cart-item">
                <img src={item.image} alt={item.name} />

                <div className="info">
  <p className="name">{item.name}</p>
  <div className="mini-cart-meta">
    <div className="mini-cart-qty">
      <button
        type="button"
        className="mini-cart-qty-btn"
        aria-label={`Decrease quantity for ${item.name}`}
        onClick={() => decrement(item.id)}
      >
        -
      </button>
      <span className="mini-cart-qty-value">{item.quantity}</span>
      <button
        type="button"
        className="mini-cart-qty-btn"
        aria-label={`Increase quantity for ${item.name}`}
        onClick={() => increment(item.id)}
      >
        +
      </button>
    </div>
    <p className="price">{formatPrice(item.price)}</p>
  </div>
</div>
              </div>
            ))
          )}
        </div>

        <div className="mini-cart-footer">
          <div className="total">
            <span>Total</span>
            <span>{formatPrice(subtotal)}</span>
          </div>

          <Link to="/cart" className="btn primary" onClick={onClose}>
            View Cart
          </Link>
        </div>
      </div>
    </>
  );
}






