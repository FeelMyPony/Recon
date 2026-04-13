# ------------------------------------------------------------------------------
# Secrets Manager
# ------------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${local.prefix}/db-credentials"
  description = "RDS PostgreSQL credentials for RECON"

  tags = {
    Name = "${local.prefix}/db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
    host     = aws_db_instance.recon.address
    port     = 5432
    dbname   = var.db_name
    engine   = "postgres"
  })
}

resource "aws_secretsmanager_secret" "api_keys" {
  name        = "${local.prefix}/api-keys"
  description = "Third-party API keys for RECON (Outscraper, Anthropic, etc.)"

  tags = {
    Name = "${local.prefix}/api-keys"
  }
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id

  secret_string = jsonencode({
    outscraper_api_key = "REPLACE_ME"
    anthropic_api_key  = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
