-- Database Schema for Bangladesh Mosque Map
-- Supports Spatial Indexing and Geodesic Distance Calculation

CREATE DATABASE IF NOT EXISTS mosque_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mosque_db;

CREATE TABLE IF NOT EXISTS mosques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    location POINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_coords (latitude, longitude),
    SPATIAL INDEX(location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

