-- v1.1.0: consolidate match_webhook_url + message_webhook_url → single webhook_url + secret
ALTER TABLE machines
    ADD COLUMN webhook_url TEXT,
    ADD COLUMN webhook_secret TEXT,
    DROP COLUMN match_webhook_url,
    DROP COLUMN message_webhook_url;

INSERT INTO db_version (version) VALUES ('1.1.0');
