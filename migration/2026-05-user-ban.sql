-- Temporary account suspension (moderation / signalements)
ALTER TABLE `users`
  ADD COLUMN `banned_until` DATETIME NULL DEFAULT NULL
    COMMENT 'When set and in the future, API access and login are blocked'
    AFTER `marketing_opt_in`;
