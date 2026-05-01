// =============================================================================
// models/modelCenter.js — central re-export for all Mongoose models
// =============================================================================
//
// Import from here in your controllers:
//
//   import { User, Order, Product } from "../models/modelCenter.js";
//
// File layout:
//
//   models/
//   ├── modelCenter.js          ← you are here
//   ├── User.js                 👤  users + embedded profile, addresses[]
//   ├── Session.js              🔑  sessions (auth + guest tokens, TTL)
//   ├── PolicyAgreement.js      📜  policy acceptances (audit trail)
//   ├── RoleChangeLog.js        📋  super_admin promotion audit trail
//   ├── CategoryTag.js          🗂️  categories + 🏷️  tags
//   ├── Product.js              🛍️  products + embedded variants[], images[]
//   ├── PreorderRegistration.js 🗓️  tracks who preordered what (for notifications)
//   ├── CartWishlist.js         🛒  carts + ❤️  wishlists
//   ├── Order.js                📦  orders + 🎟️  discounts
//   ├── Refund.js               💸  refunds
//   ├── Review.js               ⭐  reviews + 👍  review_votes
//   ├── FaqQuestion.js          ❓  faq_questions + embedded answer
//   └── Notification.js         🔔  notifications

import User                  from "./User.js";
import Session               from "./Session.js";
import PolicyAgreement       from "./PolicyAgreement.js";
import RoleChangeLog         from "./RoleChangeLog.js";
import { Category, Tag }     from "./CategoryTag.js";
import Product               from "./Product.js";
import PreorderRegistration  from "./PreorderRegistration.js";
import { Cart, Wishlist }    from "./CartWishlist.js";
import { Discount, Order }   from "./Order.js";
import Refund                from "./Refund.js";
import { Review, ReviewVote} from "./Review.js";
import FaqQuestion           from "./FaqQuestion.js";
import Notification          from "./Notification.js";

export {
  // Auth & Users
  User,
  Session,
  PolicyAgreement,
  RoleChangeLog,

  // Products & Catalog
  Category,
  Tag,
  Product,
  PreorderRegistration,

  // Cart & Wishlist
  Cart,
  Wishlist,

  // Orders
  Discount,
  Order,

  // Refunds
  Refund,

  // Reviews
  Review,
  ReviewVote,

  // FAQ
  FaqQuestion,

  // Notifications
  Notification,
};
