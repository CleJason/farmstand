-- Ask for a review at most once a year (was every 30 days), unless the owner picked something else
UPDATE "Setting" SET "value" = '365', "updatedAt" = now() WHERE "key" = 'REVIEW_REQUEST_DAYS' AND "value" = '30';
