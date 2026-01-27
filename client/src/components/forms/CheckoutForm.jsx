import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";

export const shippingOptions = [
  { id: "standard", label: "Standard Delivery (2-4 days)", fee: 49.9 },
  { id: "express", label: "Express Delivery (1 day)", fee: 129.9 },
];

function CheckoutForm({ cartTotal = 0, onSubmit, onShippingChange }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    notes: "",
    shipping: "standard",
    cardName: "",
    cardNumber: "",
    expiry: "",
    cvc: "",
  });

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [useFavoriteAddress, setUseFavoriteAddress] = useState(false);
  const [useProfileName, setUseProfileName] = useState(false);
  const favoriteAddress = String(user?.address || "").trim();
  const hasFavoriteAddress = Boolean(favoriteAddress);
  const profileName = String(user?.name || "").trim();
  const hasProfileName = Boolean(profileName);

  const shippingFee = useMemo(() => {
    const selected = shippingOptions.find((option) => option.id === formData.shipping);
    return selected ? selected.fee : 0;
  }, [formData.shipping]);

  useEffect(() => {
    if (typeof onShippingChange !== "function") return;
    const selected = shippingOptions.find((option) => option.id === formData.shipping);
    onShippingChange({
      id: formData.shipping,
      fee: selected ? selected.fee : 0,
      label: selected ? selected.label : "",
    });
  }, [formData.shipping, onShippingChange]);

  const grandTotal = useMemo(() => Number(cartTotal || 0) + shippingFee, [cartTotal, shippingFee]);

  const toTitleCase = (value) =>
    String(value || "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const handleChange = (field) => (event) => {
    const raw = event.target.value;
    // Keep light normalization on names/city; leave address/card/notes as-is so spaces are preserved.
    const titleCaseFields = ["firstName", "lastName", "city"];
    const value = titleCaseFields.includes(field) ? toTitleCase(raw) : raw;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFavoriteAddressClick = () => {
    if (!hasFavoriteAddress) {
      setInfo("First set favorite address from profile screen.");
      return;
    }
    setInfo("");
    setUseFavoriteAddress((prev) => {
      const nextValue = !prev;
      setFormData((state) => ({
        ...state,
        address: nextValue ? favoriteAddress : "",
      }));
      return nextValue;
    });
  };

  const handleProfileNameClick = () => {
    if (!hasProfileName) {
      setInfo("First set your name from profile screen.");
      return;
    }
    const parts = profileName.split(/\s+/).filter(Boolean);
    const lastName = parts.length > 1 ? parts.pop() : "";
    const firstName = parts.join(" ");
    setInfo("");
    setUseProfileName((prev) => {
      const nextValue = !prev;
      setFormData((state) => ({
        ...state,
        firstName: nextValue ? firstName : "",
        lastName: nextValue ? lastName : "",
      }));
      return nextValue;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");
    setInfo("");

    const requiredFields = [
      "firstName",
      "lastName",
      "phone",
      "address",
      "city",
      "postalCode",
    ];
    const hasMissing = requiredFields.some(
      (field) => !String(formData[field] ?? "").trim()
    );
    if (hasMissing) {
      setError("Please fill out all required shipping fields.");
      return;
    }

    if (formData.cardNumber.replace(/\s/g, "").length < 16) {
      setError("Card number must be 16 digits.");
      return;
    }

    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(formData.expiry)) {
      setError("Expiry date must match MM/YY.");
      return;
    }

    if (formData.cvc.length < 3) {
      setError("CVC must be 3 or 4 digits.");
      return;
    }

  const payload = {
    ...formData,
    cartTotal,
    shippingFee,
    grandTotal,
    shippingLabel: shippingOptions.find((option) => option.id === formData.shipping)?.label || "Standard Delivery",
  };

    setInfo("Order created! Redirecting to payment confirmation.");
    if (typeof onSubmit === "function") {
      onSubmit(payload);
    }
  };

  return (
    <div className="checkout-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#0f172a", fontWeight: 700, fontSize: "1.35rem" }}>
            🛒 Secure Checkout
          </p>
          <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem" }}>
            Review your details and we will ship your order.
          </p>
        </div>
        <div
          style={{
            background: "#0f172a",
            color: "white",
            padding: "10px 14px",
            borderRadius: 12,
            minWidth: 120,
            textAlign: "right",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Amount Due</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            ₺{grandTotal.toFixed(2)}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecdd3",
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {info && (
        <div
          style={{
            background: "#ecfdf3",
            color: "#166534",
            border: "1px solid #bbf7d0",
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {info}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 12, color: "#0f172a" }}>Shipping Details</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                First Name*
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange("firstName")}
                  placeholder="e.g. Alex"
                  required
                  disabled={useProfileName}
                  style={inputStyle}
                />
              </label>
              <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                Last Name*
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange("lastName")}
                  placeholder="e.g. Morgan"
                  required
                  disabled={useProfileName}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                onClick={handleProfileNameClick}
                disabled={!hasProfileName}
                className="checkout-pill"
                style={{
                  alignSelf: "flex-start",
                  background: hasProfileName ? "#0f172a" : "#e2e8f0",
                  color: hasProfileName ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: hasProfileName ? "pointer" : "not-allowed",
                }}
              >
                {useProfileName ? "Use custom name" : "Use profile name"}
              </button>
              {!hasProfileName && (
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  First set your name from profile screen.
                </span>
              )}
            </div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
              Phone*
              <input
                type="tel"
                value={formData.phone}
                onChange={handleChange("phone")}
                placeholder="+90 5xx xxx xx xx"
                required
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                onClick={handleFavoriteAddressClick}
                disabled={!hasFavoriteAddress}
                className="checkout-pill"
                style={{
                  alignSelf: "flex-start",
                  background: hasFavoriteAddress ? "#0f172a" : "#e2e8f0",
                  color: hasFavoriteAddress ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: hasFavoriteAddress ? "pointer" : "not-allowed",
                }}
              >
                {useFavoriteAddress ? "Use custom address" : "Use favorite address"}
              </button>
              {!hasFavoriteAddress && (
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  First set favorite address from profile screen.
                </span>
              )}
            </div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
              Address*
              <textarea
                value={formData.address}
                onChange={handleChange("address")}
                placeholder="Street, number, district"
                required
                disabled={useFavoriteAddress}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  background: useFavoriteAddress ? "#e2e8f0" : inputStyle.background,
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                City*
                <input
                  type="text"
                  value={formData.city}
                  onChange={handleChange("city")}
                  placeholder="City"
                  required
                  style={inputStyle}
                />
              </label>
              <label style={{ width: 130, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                Postal Code*
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={handleChange("postalCode")}
                  placeholder="34000"
                  required
                  style={inputStyle}
                />
              </label>
            </div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
              Notes
              <input
                type="text"
                value={formData.notes}
                onChange={handleChange("notes")}
                placeholder="Add a note for the courier"
                style={inputStyle}
              />
            </label>
          </div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: 16,
            border: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 4, color: "#0f172a" }}>Payment & Shipping</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {shippingOptions.map((option) => (
              <label
                key={option.id}
                className="shipping-option"
                style={{
                  flex: 1,
                  minWidth: 200,
                  border: formData.shipping === option.id ? "2px solid #0f172a" : "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: formData.shipping === option.id ? "#f8fafc" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="shipping"
                  value={option.id}
                  checked={formData.shipping === option.id}
                  onChange={handleChange("shipping")}
                  style={{ marginRight: 8 }}
                />
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{option.label}</span>
                <div style={{ color: "#475569", fontSize: "0.9rem" }}>₺{option.fee.toFixed(2)}</div>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
              Name on Card
              <input
                type="text"
                value={formData.cardName}
                onChange={handleChange("cardName")}
                placeholder="e.g. ALEX MORGAN"
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
              Card Number
              <input
                type="text"
                inputMode="numeric"
                value={formData.cardNumber}
                onChange={handleChange("cardNumber")}
                placeholder="**** **** **** ****"
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                Expiry (MM/YY)
                <input
                  type="text"
                  value={formData.expiry}
                  onChange={handleChange("expiry")}
                  placeholder="08/26"
                  style={inputStyle}
                />
              </label>
              <label style={{ width: 120, fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                CVC
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.cvc}
                  onChange={handleChange("cvc")}
                  placeholder="123"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              background: "#0f172a",
              color: "white",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                Items: ₺{Number(cartTotal).toFixed(2)} • Shipping: ₺{shippingFee.toFixed(2)}
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Total: ₺{grandTotal.toFixed(2)}</div>
            </div>
            <button
              type="submit"
              style={{
                background: "#facc15",
                color: "#0f172a",
                border: "none",
                borderRadius: 10,
                padding: "12px 16px",
                fontWeight: 800,
                cursor: "pointer",
                minWidth: 150,
              }}
            >
              Place Order
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontSize: "0.95rem",
  background: "#f8fafc",
};

export default CheckoutForm;
