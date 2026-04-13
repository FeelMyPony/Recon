# ------------------------------------------------------------------------------
# SES Domain Identity with DKIM
# ------------------------------------------------------------------------------

resource "aws_ses_domain_identity" "recon" {
  domain = var.domain_name
}

resource "aws_ses_domain_dkim" "recon" {
  domain = aws_ses_domain_identity.recon.domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${aws_ses_domain_dkim.recon.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.recon.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_ses_domain_identity_verification" "recon" {
  domain = aws_ses_domain_identity.recon.id

  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.recon.verification_token]
}

resource "aws_ses_email_identity" "from_address" {
  email = var.ses_from_email
}

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}
