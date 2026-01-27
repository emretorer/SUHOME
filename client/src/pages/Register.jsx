import RegisterForm from "../components/forms/RegisterForm";

function Register() {
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
          maxWidth: 420,
        }}
      >
        <h1 style={{ color: "#0058a3", fontSize: "2rem", margin: 0 }}>
          Join the SUHome Family
        </h1>
        <p style={{ color: "#4b5563", lineHeight: 1.6 }}>
          Save favorites, track orders, and stay in the loop for member-only offers.
          Signing up takes just a minute.
        </p>
      </div>

      <RegisterForm />
    </section>
  );
}

export default Register;
