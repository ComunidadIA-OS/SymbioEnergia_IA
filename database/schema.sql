-- ============================================================
-- SymbioEnergia IA — MySQL Schema v2
-- Compatible con XAMPP MySQL 5.7+
-- Ejecutar: mysql -u root symbioenergia < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `symbioenergia`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `symbioenergia`;

-- ── user ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user` (
  `id`                         INT          NOT NULL AUTO_INCREMENT,
  `email`                      VARCHAR(200) NOT NULL,
  `password_hash`              VARCHAR(256) NOT NULL,
  `company_name`               VARCHAR(200),
  `lat`                        FLOAT,
  `lon`                        FLOAT,
  `solar_capacity_kwp`         FLOAT,
  `annual_savings_eur`         FLOAT,
  `payback_years`              FLOAT,
  `subsidy_eur`                FLOAT,
  `surface_m2`                 FLOAT,
  `created_at`                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email_verified`             TINYINT(1)   NOT NULL DEFAULT 0,
  `verification_token`         VARCHAR(64),
  `verification_token_expires` DATETIME,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`),
  KEY `idx_verification_token` (`verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── company ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `company` (
  `id`                 INT            NOT NULL AUTO_INCREMENT,
  `user_id`            INT,
  `name`               VARCHAR(200)   NOT NULL,
  `lat`                FLOAT,
  `lon`                FLOAT,
  `annual_kwh`         FLOAT,
  `sector`             VARCHAR(100),
  `solar_capacity_kwp` FLOAT,
  `contact_email`      VARCHAR(200),
  `registered_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_company_user` (`user_id`),
  KEY `idx_company_coords` (`lat`, `lon`),
  CONSTRAINT `fk_company_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── building_analysis ────────────────────────────────────────
-- Una fila por sesión de análisis (cada vez que se ejecutan los 5 agentes)
CREATE TABLE IF NOT EXISTS `building_analysis` (
  `id`               INT    NOT NULL AUTO_INCREMENT,
  `user_id`          INT,
  `company_id`       INT,
  `lat`              FLOAT  NOT NULL,
  `lon`              FLOAT  NOT NULL,
  `kwh_annual_input` FLOAT,
  `sector_input`     VARCHAR(100),
  `analyzed_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ba_user`    (`user_id`),
  KEY `idx_ba_company` (`company_id`),
  KEY `idx_ba_coords`  (`lat`, `lon`),
  CONSTRAINT `fk_ba_user`    FOREIGN KEY (`user_id`)    REFERENCES `user`    (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ba_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── geo_result ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `geo_result` (
  `id`                  INT          NOT NULL AUTO_INCREMENT,
  `analysis_id`         INT          NOT NULL,
  `building_name`       VARCHAR(300),
  `total_area_m2`       FLOAT,
  `usable_area_m2`      FLOAT,
  `roof_slope_deg`      FLOAT,
  `roof_orientation_deg` FLOAT,
  `solar_capacity_kwp`  FLOAT,
  `building_height_m`   FLOAT,
  `confidence_level`    VARCHAR(200),
  `data_source`         VARCHAR(300),
  `municipio`           VARCHAR(200),
  `provincia`           VARCHAR(200),
  `footprint_json`      LONGTEXT,
  PRIMARY KEY (`id`),
  KEY `idx_geo_analysis` (`analysis_id`),
  CONSTRAINT `fk_geo_analysis`
    FOREIGN KEY (`analysis_id`) REFERENCES `building_analysis` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── climate_result ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `climate_result` (
  `id`                       INT     NOT NULL AUTO_INCREMENT,
  `analysis_id`              INT     NOT NULL,
  `solar_annual_kwh_per_kwp` FLOAT,
  `solar_monthly_json`       TEXT,
  `avg_temp_c`               FLOAT,
  `annual_hours_sun`         FLOAT,
  `precipitation_days`       INT,
  `wind_speed_m_s`           FLOAT,
  `confidence_level`         VARCHAR(200),
  `data_source`              VARCHAR(300),
  PRIMARY KEY (`id`),
  KEY `idx_climate_analysis` (`analysis_id`),
  CONSTRAINT `fk_climate_analysis`
    FOREIGN KEY (`analysis_id`) REFERENCES `building_analysis` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── financial_result ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `financial_result` (
  `id`                        INT   NOT NULL AUTO_INCREMENT,
  `analysis_id`               INT   NOT NULL,
  `recommended_capacity_kwp`  FLOAT,
  `total_investment_eur`      FLOAT,
  `subsidy_amount_eur`        FLOAT,
  `net_investment_eur`        FLOAT,
  `annual_generation_kwh`     FLOAT,
  `annual_savings_gross_eur`  FLOAT,
  `annual_savings_net_eur`    FLOAT,
  `payback_without_subsidy`   FLOAT,
  `payback_with_subsidy`      FLOAT,
  `npv_15y_eur`               FLOAT,
  `irr_15y_percent`           FLOAT,
  `loan_amount_eur`           FLOAT,
  `own_capital_eur`           FLOAT,
  `annual_loan_payment_eur`   FLOAT,
  `loan_period_years`         INT,
  `loan_interest_rate_percent` FLOAT,
  PRIMARY KEY (`id`),
  KEY `idx_fin_analysis` (`analysis_id`),
  CONSTRAINT `fk_fin_analysis`
    FOREIGN KEY (`analysis_id`) REFERENCES `building_analysis` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── symbiosis_result ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `symbiosis_result` (
  `id`                  INT   NOT NULL AUTO_INCREMENT,
  `analysis_id`         INT   NOT NULL,
  `hria_score`          INT,
  `hria_transparency`   TEXT,
  `shared_potential_kwh` FLOAT,
  `confidence_level`    VARCHAR(200),
  `data_source`         VARCHAR(300),
  PRIMARY KEY (`id`),
  KEY `idx_sym_analysis` (`analysis_id`),
  CONSTRAINT `fk_sym_analysis`
    FOREIGN KEY (`analysis_id`) REFERENCES `building_analysis` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── symbiosis_neighbor ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `symbiosis_neighbor` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `symbiosis_result_id`  INT          NOT NULL,
  `name`                 VARCHAR(300),
  `sector`               VARCHAR(100),
  `lat`                  FLOAT,
  `lon`                  FLOAT,
  `complementarity_pct`  INT,
  `annual_kwh`           FLOAT,
  `distance_km`          FLOAT,
  `notes`                TEXT,
  `source`               VARCHAR(50),
  `is_registered`        TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_neighbor_sym` (`symbiosis_result_id`),
  CONSTRAINT `fk_neighbor_sym`
    FOREIGN KEY (`symbiosis_result_id`) REFERENCES `symbiosis_result` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── invoice_upload ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invoice_upload` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `user_id`         INT,
  `analysis_id`     INT,
  `kwh_annual`      FLOAT,
  `cost_annual_eur` FLOAT,
  `tariff`          VARCHAR(50),
  `confidence`      VARCHAR(20),
  `source`          VARCHAR(100),
  `uploaded_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_user`     (`user_id`),
  KEY `idx_invoice_analysis` (`analysis_id`),
  CONSTRAINT `fk_invoice_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── llm_report ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `llm_report` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `analysis_id`          INT,
  `user_id`              INT,
  `analysis_type`        VARCHAR(100),
  `question`             TEXT,
  `response_json`        LONGTEXT,
  `provider`             VARCHAR(50),
  `entities_anonymized`  INT          NOT NULL DEFAULT 0,
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_llm_analysis` (`analysis_id`),
  KEY `idx_llm_user`     (`user_id`),
  CONSTRAINT `fk_llm_analysis`
    FOREIGN KEY (`analysis_id`) REFERENCES `building_analysis` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_llm_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── analysis_result (legacy — superseded by building_analysis) ──
CREATE TABLE IF NOT EXISTS `analysis_result` (
  `id`          INT         NOT NULL AUTO_INCREMENT,
  `company_id`  INT,
  `agent`       VARCHAR(50),
  `result_json` LONGTEXT,
  `created_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ar_company` (`company_id`),
  CONSTRAINT `fk_ar_company`
    FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
