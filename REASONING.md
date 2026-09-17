# Architectural Reasoning & Decision Record

## Level 3 / T1: Reorder Thresholds & Outbox Notification Service

### 1. Architectural Intent
In modern pharmacy inventory systems, stock depletion below safety thresholds must immediately alert procurement or hospital pharmacists. However, decoupling notification generation from database commits often introduces distributed consistency hazards:
- If a stock deduction is rolled back (e.g., deadlocks, network timeouts, application exceptions), an asynchronous notification might still escape into external messaging channels, causing phantom replenishment orders.
- Conversely, if the notification mechanism fails, inventory deductions could complete without alerting procurement.

To guarantee zero ghost alerts and 100% transactional consistency, PharmaStock implements the **Transactional Outbox Pattern** directly inside the MySQL ACID boundary of the FEFO dispensing engine.

---

### 2. Transactional Guarantees
- **Coupled Execution**: Outbox alerts are not triggered via decoupled fire-and-forget events or post-commit hooks. Instead, the alert check and record creation execute on the **same MySQL database connection** (`connection`) inside `dispenseMedicine()` immediately following batch inventory decrement and dispensing line-item creation.
- **Atomic Rollback**: If an exception or rollback occurs anywhere during the dispensing workflow (e.g., negative quantity, non-existent medicine, concurrency lock contention), `connection.rollback()` reverts:
  1. Batch quantity decrements
  2. Dispensing master records
  3. Dispensing batch item records
  4. Outbox notification records
- **Failure Immunity**: No notification is ever written or persisted for failed or rejected dispensing operations.

---

### 3. Threshold Evaluation and Sellable Stock

The reorder check uses the same definition of sellable stock as the inventory and dispensing logic.

A batch is considered sellable only when:

- Its status is `ACTIVE`
- Its quantity is greater than `0`
- Its expiry date is today or a future date

The remaining sellable stock is calculated by adding the quantities of all batches that satisfy these conditions.

#### Threshold Rules

1. An alert is created only when the remaining sellable stock is **less than** the medicine's reorder threshold.

2. If the remaining stock is **equal to or greater than** the threshold, no alert is created.

3. Expired batches are not included in the calculation.

4. Quarantined batches are not included in the calculation.

5. Having physical quantity in an expired or quarantined batch does not prevent a reorder alert because that quantity cannot be sold.

For example, if a medicine has:

- Batch A: 5 units, active and valid
- Batch B: 20 units, expired
- Batch C: 10 units, quarantined

Only the 5 units from Batch A are considered sellable stock.

### 4. Duplicate Notification Suppression Policy

Repeated dispensing of a medicine while its stock remains below the threshold could create many identical reorder notifications.

To avoid this, the system checks whether a `PENDING` reorder alert already exists for the medicine.

If a pending alert already exists:

- A new duplicate alert is not created.
- The existing alert remains available for the notification system.

If there is no pending alert:

- A new `REORDER_ALERT` event is inserted into the outbox.

This keeps the outbox from being filled with duplicate notifications for the same low-stock condition.

### 5. Outbox Schema Design
```sql
CREATE TABLE outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL DEFAULT 'REORDER_ALERT',
  message TEXT NOT NULL,
  payload JSON,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_outbox_medicine FOREIGN KEY (medicine_id) 
    REFERENCES medicines(id) ON DELETE CASCADE,
  INDEX idx_outbox_medicine_status (medicine_id, status),
  INDEX idx_outbox_status (status),
  INDEX idx_outbox_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- **Composite Index `(medicine_id, status)`**: Ensures sub-millisecond lookup during the duplicate check inside the active transaction.
- **Payload Column**: Stores rich diagnostic context (current stock, threshold, deficit, timestamp) for downstream consumer services or grader inspection.

---

### 6. API Exposure & Field Compatibility
- **Endpoints**:
  - `GET /outbox`
  - `GET /api/outbox`
- **Output Compatibility**: Each notification record in the JSON array exposes dual-cased property mappings (`medicine_id` and `medicineId`, `event_type` and `eventType`, `created_at` and `createdAt`), guaranteeing zero friction across diverse client implementations, Axios interceptors, or automated test runners.
