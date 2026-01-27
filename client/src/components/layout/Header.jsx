/*
function Header() {
  return (
    <header
      style={{
        background: "#ffcc00",
        color: "#0058a3",
        padding: "12px 18px",
        textAlign: "center",
        fontWeight: "bold",
        fontFamily: "Arial, sans-serif",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontSize: "1.8rem" }}>SUHome</div>
      <p style={{ margin: "6px 0 0", color: "rgba(0, 47, 99, 0.8)", fontWeight: 600, letterSpacing: 0.3 }}>
        Modern furniture, fast delivery, friendly support.
      </p>
    </header>
  );
}

export default Header;
*/




function Header() {
  return (
    <>
      <style>
        {`
          .ticker-container {
            position: relative;
          }

          .ticker-track {
            display: inline-flex;
            gap: 60px;
            font-weight: 600;
            color: #ffffff;
            padding-right: 60px;
            animation: scrollLeft 40s linear infinite;
          }

          @keyframes scrollLeft {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-100%);
            }
          }
        `}
      </style>

      <header
        style={{
          background: "#140020",
          color: "#ffffff",
          padding: "10px 18px 0px",
          textAlign: "center",
          fontWeight: "bold",
          fontFamily: "Arial, sans-serif",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          
        }}
      >
        {/* MAIN TITLE */}
        
        <img 
          src= "https://raw.githubusercontent.com/aslikoturoglu/CS308-Project/main/suhome_logo_1.png" 
          alt="SUHome Logo"
          style={{
          height: "60px",
          maxWidth: "300px",
          objectFit: "contain",
          marginBottom: "8px",
          cursor: "pointer"
  }}
/>


        {/* 🔥 TICKER (Modern furniture yazısının yerine geçti) */}
        <div
          style={{
            width: "100%",
            overflow: "hidden",
            whiteSpace: "nowrap",
            background: "#140020",
            padding: "4px 0",
          }}
        >
          <div className="ticker-track">
    
            <span style={{ marginRight: 60 }}>Masterfully Coordinated Luxury Delivery</span>
            <span style={{ marginRight: 60 }}>Private, Invitation-Only Support Service </span>
            <span style={{ marginRight: 60 }}>Introducing Newly Released Masterpieces — Reserved for Refined Tastes</span>
            <span style={{ marginRight: 60 }}>Designed for those who notice details.</span>
          </div>
          
          <div className="ticker-track">
            <span style={{ marginRight: 60 }}>Masterfully Coordinated Luxury Delivery</span>
            <span style={{ marginRight: 60 }}>Private, Invitation-Only Support Service </span>
            <span style={{ marginRight: 60 }}>Introducing Newly Released Masterpieces — Reserved for Refined Tastes</span>
            <span style={{ marginRight: 60 }}>Designed for those who notice details.</span>
          
          </div>

        </div>
      </header>
    </>
  );
}

export default Header;