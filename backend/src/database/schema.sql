-- PharmaStock Database Schema Initialization
-- Creates database and tables with required constraints and indexes

CREATE DATABASE IF NOT EXISTS pharmastock
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pharmastock;

-- Drop dependent tables in reverse order for clean recreation
DROP TABLE IF EXISTS dispensing_items;
DROP TABLE IF EXISTS dispensing_records;
DROP TABLE IF EXISTS batches;
DROP TABLE IF EXISTS medicines;
DROP TABLE IF EXISTS users;

-- 1. Users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Medicines table
CREATE TABLE medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_medicines_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Batches table
CREATE TABLE batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  quantity INT NOT NULL,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_batch_quantity CHECK (quantity >= 0),
  CONSTRAINT fk_batches_medicine FOREIGN KEY (medicine_id) 
    REFERENCES medicines(id) ON DELETE CASCADE,
  CONSTRAINT uq_medicine_batch UNIQUE (medicine_id, batch_number),
  INDEX idx_batches_medicine_id (medicine_id),
  INDEX idx_batches_expiry_date (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Dispensing Records table
CREATE TABLE dispensing_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  medicine_id INT NOT NULL,
  requested_quantity INT NOT NULL,
  dispensed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispensing_user FOREIGN KEY (user_id) 
    REFERENCES users(id),
  CONSTRAINT fk_dispensing_medicine FOREIGN KEY (medicine_id) 
    REFERENCES medicines(id),
  INDEX idx_dispensing_medicine_id (medicine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Dispensing Items table
CREATE TABLE dispensing_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dispensing_record_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity_dispensed INT NOT NULL,
  CONSTRAINT chk_dispensed_qty CHECK (quantity_dispensed > 0),
  CONSTRAINT fk_items_record FOREIGN KEY (dispensing_record_id) 
    REFERENCES dispensing_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_batch FOREIGN KEY (batch_id) 
    REFERENCES batches(id),
  INDEX idx_dispensing_items_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
