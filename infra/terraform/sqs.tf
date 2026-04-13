# ------------------------------------------------------------------------------
# SQS Queues with DLQs
# ------------------------------------------------------------------------------

locals {
  queues = {
    scraper = {
      visibility_timeout = 300
      dlq_max_receives   = 3
    }
    analyser = {
      visibility_timeout = 600
      dlq_max_receives   = 3
    }
    emailer = {
      visibility_timeout = 120
      dlq_max_receives   = 5
    }
  }
}

# --- Dead Letter Queues ---

resource "aws_sqs_queue" "dlq" {
  for_each = local.queues

  name                      = "${local.prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "${local.prefix}-${each.key}-dlq"
  }
}

# --- Main Queues ---

resource "aws_sqs_queue" "main" {
  for_each = local.queues

  name                       = "${local.prefix}-${each.key}-queue"
  visibility_timeout_seconds = each.value.visibility_timeout
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = each.value.dlq_max_receives
  })

  tags = {
    Name = "${local.prefix}-${each.key}-queue"
  }
}

# --- SQS Queue Policies (allow SNS to send messages) ---

resource "aws_sqs_queue_policy" "allow_sns" {
  for_each = local.queues

  queue_url = aws_sqs_queue.main[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSPublish"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.main[each.key].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.domain_events.arn
          }
        }
      }
    ]
  })
}

# --- SNS Subscriptions ---

resource "aws_sns_topic_subscription" "sqs" {
  for_each = local.queues

  topic_arn = aws_sns_topic.domain_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.main[each.key].arn

  raw_message_delivery = true
}
