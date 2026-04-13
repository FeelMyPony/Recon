# ------------------------------------------------------------------------------
# RDS PostgreSQL 16 with PostGIS
# ------------------------------------------------------------------------------

resource "aws_db_subnet_group" "recon" {
  name       = "${local.prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${local.prefix}-db-subnet-group"
  }
}

resource "aws_db_parameter_group" "recon" {
  name   = "${local.prefix}-pg16-params"
  family = "postgres16"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,postgis-3"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Name = "${local.prefix}-pg16-params"
  }
}

resource "aws_security_group" "rds" {
  name        = "${local.prefix}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from Lambda and RDS Proxy"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.prefix}-rds-sg"
  }
}

resource "aws_db_instance" "recon" {
  identifier = "${local.prefix}-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = var.environment == "prod" ? true : false
  db_subnet_group_name   = aws_db_subnet_group.recon.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.recon.name

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"

  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.prefix}-final-snapshot" : null
  deletion_protection       = var.environment == "prod"

  performance_insights_enabled = true

  tags = {
    Name = "${local.prefix}-postgres"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}
