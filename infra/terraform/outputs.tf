# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.recon.endpoint
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (use this for application connections)"
  value       = aws_db_proxy.recon.endpoint
}

output "s3_bucket_name" {
  description = "S3 assets bucket name"
  value       = aws_s3_bucket.assets.id
}

output "sns_topic_arn" {
  description = "SNS domain events topic ARN"
  value       = aws_sns_topic.domain_events.arn
}

output "sqs_queue_urls" {
  description = "SQS queue URLs"
  value = {
    for k, q in aws_sqs_queue.main : k => q.url
  }
}

output "sqs_dlq_urls" {
  description = "SQS dead letter queue URLs"
  value = {
    for k, q in aws_sqs_queue.dlq : k => q.url
  }
}

output "lambda_function_names" {
  description = "Lambda function names"
  value = {
    for k, fn in aws_lambda_function.workers : k => fn.function_name
  }
}

output "secrets_arns" {
  description = "Secrets Manager ARNs"
  value = {
    db_credentials = aws_secretsmanager_secret.db_credentials.arn
    api_keys       = aws_secretsmanager_secret.api_keys.arn
  }
}
