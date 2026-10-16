-- One subscriber list: everyone gets drop alerts and Porch Pickup notices.
-- Porch-only people keep the text/email/both they picked there.
UPDATE "Subscriber" SET "dropVia" = "standVia" WHERE "dropVia" IS NULL AND "standAlerts" = true AND "dropAlerts" = false;
UPDATE "Subscriber" SET "dropAlerts" = true, "standAlerts" = true;
