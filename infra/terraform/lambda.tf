# ------------------------------------------------------------------------------
# Lambda Functions
# ------------------------------------------------------------------------------

locals {
  lambdas = {
    scraper = {
      timeout = 300
      memory  = 256
      queue   = "scraper"
    }
    analyser = {
      timeout = 600
      memory  = 512
      queue   = "analyser"
    }
    emailer = {
      timeout = 120
      memory  = 256
      queue   = "emailer"
    }
  }
}

# Placeholder zip for initial deployment
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "export const handler = async (event) => { console.log(JSON.stringify(event)); };"
    filename = "index.mjs"
  }
}

resource "aws_security_group" "lambda" {
  name        = "${local.prefix}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.prefix}-lambda-sg"
  }
}

resource "aws_lambda_function" "workers" {
  for_each = local.lambdas

  function_name = "${local.prefix}-${each.key}"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = each.value.timeout
  memory_size   = each.value.memory

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      ENVIRONMENT        = var.environment
      DB_HOST            = aws_db_proxy.recon.endpoint
      DB_NAME            = var.db_name
      SNS_TOPIC_ARN      = aws_sns_topic.domain_events.arn
      S3_BUCKET          = aws_s3_bucket.assets.id
      SECRETS_DB_ARN     = aws_secretsmanager_secret.db_credentials.arn
      SECRETS_APIKEYS_ARN = aws_secretsmanager_secret.api_keys.arn
    }
  }

  tags = {
    Name = "${local.prefix}-${each.key}"
  }
}

# --- SQS Event Source Mappings ---

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  for_each = local.lambdas

  event_source_arn                   = aws_sqs_queue.main[each.value.queue].arn
  function_name                      = aws_lambda_function.workers[each.key].arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
  enabled                            = true

  function_response_types = ["ReportBatchItemFailures"]
}
