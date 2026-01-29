# API Documentation (High Level)

All endpoints are served under the `/api` prefix. This document focuses on endpoint purpose and common response shapes without repeating setup or deployment details.

## Common conventions
- JSON in / JSON out
- Errors return `{ "error": "message" }`
- Successful responses typically include `{ "success": true, ... }`

## Products
- `GET /api/products`  
  List products with optional filters (category, search, etc.)
- `GET /api/products/:id`  
  Get a single product
- `PUT /api/products/:id/stock`  
  Update product stock (internal/admin)

## Categories
- `GET /api/categories`  
  List categories
- `POST /api/categories`  
  Create category (admin)
- `DELETE /api/categories/:id`  
  Delete category (admin, prevents deletion if in use)

## Main Categories
- `GET /api/main-categories`  
  List main categories

## Cart
- `GET /api/cart`  
  Fetch current cart
- `POST /api/cart/items`  
  Add item to cart
- `PUT /api/cart/items/:id`  
  Update cart item quantity
- `DELETE /api/cart/items/:id`  
  Remove item from cart

## Orders
- `POST /api/orders`  
  Create order from cart
- `GET /api/orders/:id`  
  Get order details
- `PUT /api/orders/:id/status`  
  Update order status (admin)

## Payments
- `POST /api/payments`  
  Create payment for order
- `POST /api/payments/refund`  
  Refund payment (admin)

## Auth
- `POST /api/auth/register`  
  Register user
- `POST /api/auth/login`  
  Login user
- `POST /api/auth/forgot-password`  
  Request password reset
- `POST /api/auth/reset-password`  
  Reset password

## Users
- `GET /api/users/:id`  
  Get user profile
- `PUT /api/users/:id`  
  Update user profile

## Wishlist
- `GET /api/wishlist`  
  Fetch wishlist
- `POST /api/wishlist`  
  Add item to wishlist
- `DELETE /api/wishlist/:id`  
  Remove item from wishlist

## Comments
- `GET /api/comments`  
  List comments
- `POST /api/comments`  
  Create comment
- `PUT /api/comments/:id`  
  Update comment status (admin/moderation)

## Support
- `GET /api/support/conversation`  
  Get or create support conversation
- `POST /api/support/message`  
  Send message
- `GET /api/support/inbox`  
  Inbox for support staff (admin)

## Returns
- `POST /api/returns`  
  Create return request
- `PUT /api/returns/:id`  
  Update return request status

## Product Requests
- `POST /api/product-requests`  
  Submit new product request
- `PUT /api/product-requests/:id`  
  Update request status (admin)
