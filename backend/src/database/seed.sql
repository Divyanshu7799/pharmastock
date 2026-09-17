-- PharmaStock Realistic Seed Data for Development & Testing
USE pharmastock;

-- Clean existing data
DELETE FROM dispensing_items;
DELETE FROM dispensing_records;
DELETE FROM batches;
DELETE FROM medicines;
DELETE FROM users;

-- Reset Auto-Increment
ALTER TABLE dispensing_items AUTO_INCREMENT = 1;
ALTER TABLE dispensing_records AUTO_INCREMENT = 1;
ALTER TABLE batches AUTO_INCREMENT = 1;
ALTER TABLE medicines AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;

-- Seed Users (Test pharmacist account)
INSERT INTO users (id, name, email, password_hash) VALUES
(1, 'Lead Pharmacist', 'pharmacist@pharmastock.local', '$2a$10$wN3tVqVqVqVqVqVqVqVqV.dummyhashforseedtestingonly');

-- Seed Medicines
INSERT INTO medicines (id, name, description) VALUES
(1, 'Paracetamol 500mg', 'Analgesic and antipyretic for pain and fever management'),
(2, 'Amoxicillin 250mg', 'Broad-spectrum antibiotic for bacterial infections'),
(3, 'Cetirizine 10mg', 'Second-generation antihistamine for allergic reactions'),
(4, 'Ibuprofen 400mg', 'Nonsteroidal anti-inflammatory drug (NSAID)');

-- Seed Batches with varied dates and quantities
-- Paracetamol: mixed batches (1 expired, 1 expiring soon in 15 days, 1 normal expiry in 365 days)
-- Expected sellable stock: 50 + 200 = 250 (expired batch of 100 excluded)
INSERT INTO batches (id, medicine_id, batch_number, quantity, expiry_date) VALUES
(1, 1, 'PARA-EXP-01', 100, DATE_SUB(CURDATE(), INTERVAL 90 DAY)),
(2, 1, 'PARA-SOON-02', 50, DATE_ADD(CURDATE(), INTERVAL 15 DAY)),
(3, 1, 'PARA-NORM-03', 200, DATE_ADD(CURDATE(), INTERVAL 365 DAY));

-- Amoxicillin: all batches expired
-- Expected sellable stock: 0
INSERT INTO batches (id, medicine_id, batch_number, quantity, expiry_date) VALUES
(4, 2, 'AMX-EXP-01', 40, DATE_SUB(CURDATE(), INTERVAL 120 DAY)),
(5, 2, 'AMX-EXP-02', 60, DATE_SUB(CURDATE(), INTERVAL 30 DAY));

-- Cetirizine: two batches with same expiry date (tests deterministic secondary sort id ASC) + one 0-qty batch
-- Expected sellable stock: 100 + 75 = 175
INSERT INTO batches (id, medicine_id, batch_number, quantity, expiry_date) VALUES
(6, 3, 'CET-BATCH-A', 100, DATE_ADD(CURDATE(), INTERVAL 180 DAY)),
(7, 3, 'CET-BATCH-B', 75, DATE_ADD(CURDATE(), INTERVAL 180 DAY)),
(8, 3, 'CET-ZERO-01', 0, DATE_ADD(CURDATE(), INTERVAL 240 DAY));

-- Ibuprofen: single valid batch
-- Expected sellable stock: 120
INSERT INTO batches (id, medicine_id, batch_number, quantity, expiry_date) VALUES
(9, 4, 'IBU-NORM-01', 120, DATE_ADD(CURDATE(), INTERVAL 300 DAY));
