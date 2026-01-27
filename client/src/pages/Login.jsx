import LoginForm from "../components/forms/LoginForm";

function Login() {
  return (
    <section
      style={{
        minHeight: "70vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 16px",
        flexWrap: "wrap",
        gap: 32,

        background: "#f8fafc", 
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <h1 style={{ color: "#0058a3", fontSize: "2rem", margin: 0 }}>
          Welcome back 👋
        </h1>
        <p style={{ color: "#4b5563", maxWidth: 360 }}>
          Sign in to browse your favorite SUHome products, manage your cart, and catch special offers.
        </p>
      </div>

      <LoginForm />
    </section>
  );
}

export default Login;
