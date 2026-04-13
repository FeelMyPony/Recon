# ------------------------------------------------------------------------------
# SNS Topic - Domain Event Bus
# ------------------------------------------------------------------------------

resource "aws_sns_topic" "domain_events" {
  name = "recon-domain-events-${var.environment}"

  tags = {
    Name = "recon-domain-events-${var.environment}"
  }
}

resource "aws_sns_topic_policy" "domain_events" {
  arn = aws_sns_topic.domain_events.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowLambdaPublish"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.domain_events.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.prefix}-*"
          }
        }
      }
    ]
  })
}
