# King-Kush Stores Platform Manual
Version: March 9, 2026

## 1. Purpose Of This Manual
This document explains how the King-Kush marketplace works end-to-end for:
- Customers
- Vendors (sellers)
- Administrators (including staff roles)

It is built from the current website structure and dashboard modules in this codebase.

## 2. Platform Structure
King-Kush is a multi-role marketplace with three core account experiences:
- Customer experience for shopping and order management
- Vendor experience for store/product/finance operations
- Admin experience for full marketplace governance

The system also includes:
- Centralized payments and split-order finance logic
- Receipts center and transaction receipts
- Pickup station operations
- Support and help-center operations
- Careers and advertising modules

## 3. Roles And Access
### 3.1 Customer
Customer accounts can browse, search, add to cart, checkout, track orders, manage profile, and request support.

### 3.2 Vendor
Vendor accounts can manage their storefront, products, orders, finances, receipts, and pickup operations (when approved).

### 3.3 Admin
Admin can manage the entire marketplace. With RBAC enabled, staff can be limited to specific modules.

## 4. Customer Guide
## 4.1 Public Shopping Pages
- Home (`/`): hero, promotions, trending products.
- Search (`/search?q=...`): fuzzy search for products/categories/vendors.
- Product detail (`/product/[slug]`): gallery, price, stock, specs, add to cart.
- Cart (`/cart`): review items and subtotal.
- Checkout (`/checkout`): shipping/payment/pickup flow.
- Order success (`/order-success`): post-checkout confirmation.

## 4.2 Search And Product Discovery
- Global navbar search supports autocomplete suggestions:
  - Product suggestions
  - Category suggestions
  - Vendor suggestions
- Keyboard support:
  - Arrow up/down to navigate suggestions
  - Enter to search selected suggestion
  - Escape to close suggestions

## 4.3 Product Browsing Behavior
- Products are shown in horizontal rows with vertical page stacking.
- Vertical finger scroll moves the whole page.
- Sideways finger/trackpad scroll moves only the row under interaction.
- Category and vendor filters are available in product galleries where enabled.

## 4.4 My Account (`/account`)
Main account sections:
- Overview: quick stats and shortcuts.
- My Orders: order list, details, cancel (when status allows), generate receipt.
- Wishlist: saved products and move-to-cart.
- Shopping Activity: cart/recent activity.
- Address Book: create, edit, delete, default address.
- Payment Section: add/update/remove card or M-Pesa methods, set default.
- Account Settings: profile and contact updates.
- Returns & Refunds: return request tracking.
- Support Center: contact/help/chatbot shortcuts.
- Security & Privacy: login/security preferences and logout.
- Seller Tools: links to sell/vendor resources.

## 4.5 Order Tracking
Track orders from:
- Account order details
- Track Your Order page (`/footer-links/track-your-order`)

Displays:
- Delivery or pickup progress
- Station/shipping details
- Payment status
- Ordered items and totals

## 4.6 Customer Receipts
Customer receipts are available in:
- Receipt center (`/account/receipts`)
- Order screens via "Generate Receipt"
- Track-order view via "Generate Receipt"

Receipts are generated per transaction entity and downloadable as PDF.

## 4.7 Customer Support
Support channels:
- Help Center (`/footer-links/help-center`)
- Contact Us (`/footer-links/contact-us`)
- Chat With Us (`/footer-links/chat-with-us`)

## 5. Vendor Guide
Vendor experience is under `/vendor/*`.

## 5.1 Vendor Approval Lifecycle
Vendor account status:
- Pending review
- Needs info
- Approved
- Rejected
- Suspended

Some modules unlock only after approval.

## 5.2 Vendor Dashboard Navigation
- Overview (`/vendor/overview`)
- Products (`/vendor/products`)
- Orders (`/vendor/orders`)
- Finance (`/vendor/finance`)
- Receipts (`/vendor/receipts`)
- Pickup Operations (`/station-ops`)
- Store Profile (`/vendor/profile`)
- Security (`/vendor/security`)

## 5.3 Products Module
Vendors can:
- Create product listings
- Edit title/description/specs/category/price/stock
- Manage active state and images

Product entry is aligned with platform structure so storefront display remains consistent.

## 5.4 Vendor Orders
Vendor sees only their own order lines/splits.
Typical usage:
- Review order status and customer destination data
- Generate receipts from order rows

## 5.5 Vendor Finance
Vendor finance page includes:
- Wallet balances (available/pending)
- Sales, commissions, net earnings
- Recent wallet transactions
- Payout requests and payout history
- Automatic/manual payout policy visibility

## 5.6 Vendor Receipts
Vendor receipt center contains:
- Payout receipts
- Commission receipts
- Settlement and wallet transaction receipts

Vendors can regenerate/download eligible receipts as permitted.

## 5.7 Store Profile And Branding
Vendor profile supports:
- Store details
- Contact updates
- Business location/address
- Branding assets (logo/banner where configured)

## 5.8 Vendor Security
Vendor can change password and maintain account security settings.

## 6. Station Operations Guide (`/station-ops`)
Station operations portal is used by:
- Authorized pickup admins/staff
- Approved vendor users with station permissions

Features:
- Assigned station selection
- Pickup order queue by station/status
- Mark ready/collected/return drop-off
- Temporary station notices
- Operational settings (services, pickup/returns toggles)
- Receipt generation for station-related orders

## 7. Admin Guide
Admin portal is organized by module and supports role-based module visibility.

## 7.1 Admin Navigation Model
Desktop:
- Left sidebar grouped by Core, Operations, Team & Support
Mobile:
- Bottom quick nav

Built-in:
- Module filter search
- Command palette (Ctrl/Cmd + K)

## 7.2 Admin Dashboard (`/admin`)
Tabs:
- Overview
- Orders
- Chatbot conversations

Overview cards typically show:
- Revenue
- Order volume
- Commission
- Queue summaries (vendors, support, moderation, etc.)

## 7.3 Finance (`/admin/finance`)
Finance desk includes:
- Marketplace totals
- Merchant account balance
- Vendor liabilities
- Payments table
- Vendor split orders
- Payout requests with action controls (role-permitted)
- Receipt generation per finance transaction row

## 7.4 Receipts (`/admin/receipts`)
Admin receipt center supports:
- Cross-role receipt visibility (scope by permissions)
- Search/filter by category/type/status/reference
- Download and regenerate
- Manual admin receipts (for approved admin actions)

## 7.5 Vendors (`/admin/vendors`)
Vendor management includes:
- Application review and status changes
- Vendor profile oversight
- Operational follow-up through notes/workflow

## 7.6 Products (`/admin/products`)
Catalog controls:
- Product review/edit/manage
- Quality/compliance operations
- Alignment with marketplace listing standards

## 7.7 Pickup Stations (`/admin/pickup-stations`)
Central pickup governance:
- Station CRUD
- Ownership model handling (platform/vendor-managed)
- Staff assignments
- Operational toggles and visibility/approval states

## 7.8 Advertising (`/admin/advertising`)
Advertising operations:
- Ad requests
- Campaign setup and approval
- Placement controls
- Analytics tracking

## 7.9 Promotions (`/admin/promotions`)
Promotions and campaign controls:
- Black Friday and flash campaigns
- Offer creation/scheduling
- Promo performance and product linking

## 7.10 Support (`/admin/support`)
Support management:
- Ticket inbox
- Threaded responses
- Status updates (pending/in-progress/resolved)
- Help center content management

## 7.11 Moderation (`/admin/moderation`)
Moderation operations:
- Reported product queue
- Investigation details
- Resolution actions and traceability

## 7.12 Careers (`/admin/careers`)
Hiring management:
- Job openings
- Dynamic application form fields
- Applicant list and status workflow
- File access for CV/supporting docs

## 7.13 Staff & Roles (`/admin/staff`)
RBAC and internal team management:
- Staff role templates
- Permission assignment
- Module-level access restriction
- Staff account enable/disable flows

Only super admin should control role definitions and global access changes.

## 8. Payments, Orders, And Receipt Lifecycle
## 8.1 Checkout To Payment
Typical flow:
1. Customer places order
2. Payment initiation (e.g., M-Pesa STK push)
3. Payment confirmation
4. Order status and split allocation updates

## 8.2 Multi-Vendor Split Logic
One customer payment can produce multiple vendor sub-orders internally.
Vendors only access their own split.

## 8.3 Payout Logic
Vendor earnings move through wallet balances and payout lifecycle.
Payout mode can be automatic or managed per policy.

## 8.4 Receipt Triggering
Receipts can be generated from:
- Order rows
- Payment rows
- Vendor split rows
- Payout rows
- Refund/transaction entities (where applicable)

Each generated receipt is downloadable PDF and linked to transaction context.

## 9. Footer Information And Support Pages
Footer pages include structured operations and policy content such as:
- Payment guidelines
- How to order
- Return/refund policy
- Terms and privacy
- Store locator
- Dispute resolution
- Affiliate and advertising information
- Careers and application path
- Regional/international informational pages

These pages act as customer guidance and operational reference points.

## 10. Core Frontend Components (Operational View)
## 10.1 Navbar
- Role-aware account destination
- Cart status badge
- Global search with autocomplete
- Logo click navigation (and home refresh behavior)

## 10.2 ProductGridCard
Card-level interaction:
- Product image and badges
- Vendor/category context
- Price and promotion indicators
- Wishlist toggle
- Add-to-cart action
- Product detail navigation

## 10.3 ProductScrollGallery
- Row-based product layout
- Category/vendor filtering
- Vertical page scrolling + row-specific horizontal scroll
- Touch/trackpad gesture handling tuned for mobile usability

## 11. Recommended Daily Workflows
## 11.1 Customer
1. Search or browse products
2. Add to cart and checkout
3. Track order progress
4. Download receipt from account or tracking page
5. Use support channels when needed

## 11.2 Vendor
1. Maintain store profile and products
2. Process vendor orders
3. Monitor finance and payouts
4. Download receipts for settlements/payouts
5. Manage pickup operations if assigned

## 11.3 Admin
1. Start from dashboard queue
2. Review finance and payout operations
3. Process vendor, support, and moderation queues
4. Maintain campaigns and content modules
5. Audit actions via receipts and module logs

## 12. Notes
- This guide reflects the current implementation structure in the codebase.
- If modules/routes change, regenerate this documentation so it stays aligned.
