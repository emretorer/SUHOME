import { Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import ProductList from "../pages/ProductList";
import Cart from "../pages/Cart";
import Wishlist from "../pages/Wishlist";
import Profile from "../pages/Profile";
import Login from "../pages/Login";
import Register from "../pages/Register";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import OrderHistory from "../pages/OrderHistory";
import ProductDetail from "../pages/ProductDetail";
import Checkout from "../pages/Checkout";
import PaymentDetails from "../pages/PaymentDetails";
import PaymentBank from "../pages/PaymentBank";
import PaymentBankResult from "../pages/PaymentBankResult";
import NotFound from "../pages/NotFound";
import AdminDashboard from "../pages/AdminDashboard";
import Invoice from "../pages/Invoice";
import ProtectedRoute from "../components/auth/ProtectedRoute";

function AppRouter({ openMiniCart }) {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/products" element={<ProductList openMiniCart={openMiniCart} />}/>
      <Route path="/products/:id" element={<ProductDetail openMiniCart={openMiniCart} />}/>
      <Route path="/cart" element={<Cart />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/wishlist" element={<Wishlist openMiniCart={openMiniCart} />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment-details" element={<PaymentDetails />} />
        <Route path="/payment-bank" element={<PaymentBank />} />
        <Route path="/payment-bank-result" element={<PaymentBankResult />} />
        <Route path="/invoice/:id" element={<Invoice />} />
        <Route path="/orders" element={<OrderHistory />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route element={<ProtectedRoute allowedRoles={['admin', 'product_manager', 'sales_manager', 'support']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRouter;
