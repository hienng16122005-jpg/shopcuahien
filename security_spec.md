# Security Specification: QH Skinlab E-commerce

## 1. Data Invariants

- **Products**: Only admins can create, update, or delete products. Any user can read.
- **Categories**: Only admins can manage categories. Any user can read.
- **Orders**: 
    - Users can create their own orders.
    - Users can only read their own orders (unless admin).
    - Only admins can update the status of an order after creation.
    - Users cannot modify an order once it reaches a terminal state (like 'Đã giao' or 'Đã huỷ').
- **Magazine**: Only admins can manage magazine articles. Any user can read.
- **Users**:
    - Users can only read and update their own profile.
    - Admins can read all profiles.
    - No one can change their own 'role' field except through admin tools (protected key check).

## 2. The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Attempt to create an order with someone else's `userId`.
2. **Privilege Escalation**: Attempt to update a user's own `role` to 'Quản trị viên'.
3. **Shadow Update**: Attempt to update a product price as a non-admin.
4. **State Shortcutting**: Attempt to change an order status from 'Chờ xác nhận' directly to 'Đã giao' without being an admin.
5. **Orphaned Writes**: Attempt to create an order referencing a non-existent product ID (if enforceable via rules).
6. **Resource Poisoning**: Create a product with a 1MB string in the name field.
7. **PII Leak**: A signed-in user attempts to read another user's profile in the `users` collection.
8. **Query Scraping**: Attempt to list all orders without a `userId` filter (if rules allow).
9. **Invisible Field Injection**: Attempt to create a product with an unlisted field `isVerified: true`.
10. **Terminal State Break**: Attempt to update an order that is already marked as 'Đã giao'.
11. **Timestamp Forgery**: Create an order with a `createdAt` value from the past.
12. **ID Injection**: Create a product with a document ID containing malicious scripts or excessive length.

## 3. Test Runner Design

We will use a draft set of rules first and then finalize.
