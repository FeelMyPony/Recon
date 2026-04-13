# ------------------------------------------------------------------------------
# CloudWatch Log Groups and Alarms
# ------------------------------------------------------------------------------

# --- Log Groups for Lambda Functions ---

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambdas

  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = var.environment == "prod" ? 90 : 14

  tags = {
    Name = "${local.prefix}-${each.key}-logs"
  }
}

# --- DLQ Alarms ---

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  for_each = local.queues

  alarm_name          = "${local.prefix}-${each.key}-dlq-messages"
  alarm_description   = "Messages appeared in ${each.key} DLQ - investigate failed processing"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq[each.key].name
  }

  tags = {
    Name = "${local.prefix}-${each.key}-dlq-alarm"
  }
}

# --- Lambda Error Alarms ---

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambdas

  alarm_name          = "${local.prefix}-${each.key}-errors"
  alarm_description   = "Lambda ${each.key} is experiencing errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.workers[each.key].function_name
  }

  tags = {
    Name = "${local.prefix}-${each.key}-error-alarm"
  }
}
