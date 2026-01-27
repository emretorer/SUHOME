import { createContext, useContext, useMemo, useState } from "react";

const ToastContext = createContext(undefined);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const value = useMemo(() => ({ addToast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "grid",
          gap: 8,
          zIndex: 3000,
          maxWidth: 320,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              background: toast.type === "error" ? "#fef2f2" : "#ecfeff",
              border: `1px solid ${toast.type === "error" ? "#fecdd3" : "#bae6fd"}`,
              color: toast.type === "error" ? "#b91c1c" : "#0ea5e9",
              padding: "10px 12px",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              fontWeight: 700,
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
