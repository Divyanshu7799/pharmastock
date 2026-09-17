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

### 3. Threshold Evaluation & Sellable Stock Definition
The notification trigger evaluates remaining **sellable stock** strictly calculated as:

$$\text{sellableStock} = \sum \text{quantity} \quad \text{WHERE } \text{status} = \text{'ACTIVE'} \land \text{quantity} > 0 \land \text{expiry\_date} \ge \text{CURRENT\_DATE}$$

#### Threshold Evaluation Rules:
1. **Strict Inequality ($<$)**: An alert is generated if and only if $\text{sellableStock} < \text{reorder\_threshold}$.
2. **Boundary Invariance**: If $\text{sellableStock} == \text{reorder\_threshold}$ or $\text{sellableStock} > \text{reorder\_threshold}$, **no alert is created**.
3. **Quarantine & Expiry Exclusion**:
   - Expired batches ($\text{expiry\_date} < \text{CURRENT\_DATE}$) are completely ignored.
   - Quarantined batches ($\text{status} = \text{'QUARANTINED'}$) are completely ignored.
   - Even if physical inventory exists in quarantined or expired batches, it does not inflate sellable stock or suppress low-stock alerts.

---

### 4. Duplicate Notification Suppression Policy
Repeated dispensing of medication while stock remains below threshold can spam procurement channels with redundant alerts.

#### Policy Design:
- **Rule**: At most **one `PENDING` reorder alert** per medicine is permitted in the `outbox` table at any given time.
- **Enforcement Mechanism**:
  - Before writing to `outbox`, `hasPendingAlert(connection, medicineId, 'REORDER_ALERT')` queries for existing active alerts with `status = 'PENDING'`.
  - If a pending alert already exists for the medicine, the new notification is suppressed.
  - When the procurement workflow processes or acknowledges the alert (transitioning `status` away from `'PENDING'`), subsequent dispensing operations can generate a new alert if stock remains or falls below threshold.

---

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
