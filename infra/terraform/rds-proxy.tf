# ------------------------------------------------------------------------------
# RDS Proxy for connection pooling
# ------------------------------------------------------------------------------

resource "aws_db_proxy" "recon" {
  name                   = "${local.prefix}-rds-proxy"
  debug_logging          = var.environment != "prod"
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = var.private_subnet_ids

  auth {
    auth_scheme = "SECRETS"
    description = "RDS credentials from Secrets Manager"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials.arn
  }

  tags = {
    Name = "${local.prefix}-rds-proxy"
  }
}

resource "aws_db_proxy_default_target_group" "recon" {
  db_proxy_name = aws_db_proxy.recon.name

  connection_pool_config {
    max_connections_percent = 100
    connection_borrow_timeout    = 120
    max_idle_connections_percent  = 50
  }
}

resource "aws_db_proxy_target" "recon" {
  db_instance_identifier = aws_db_instance.recon.identifier
  db_proxy_name          = aws_db_proxy.recon.name
  target_group_name      = aws_db_proxy_default_target_group.recon.name
}
