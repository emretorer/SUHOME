import "../../styles/footer.css";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__brand">
        <div className="footer-title">SUHome Store</div>
        <p className="footer-subtitle">Designed by Sabancı University CS308 Team</p>
        <p className="footer-tagline">Modern furniture, fast delivery, friendly support.</p>
      </div>

      <div className="footer__cols">
        <div>
          <h4>Contact</h4>
          <p>support@suhome.com</p>
          <p>+90 (216) 123 45 67</p>
          <p>Bagdat Street No:25, Kadıköy / İstanbul</p>
        </div>
        <div>
          <h4>Explore</h4>
          <p>Living Room · Bedroom · Workspace</p>
          <p>Lighting · Storage · Outdoor</p>
        </div>
        <div>
          <h4>About</h4>
          <p>Our Story</p>
          <p>Careers</p>
          <p>Return & Warranty</p>
        </div>
      </div>

      <div className="footer__bottom">© 2025 SUHome Store. All rights reserved.</div>
    </footer>
  );
}

export default Footer;
