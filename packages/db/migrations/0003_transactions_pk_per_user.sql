-- Transaction ids are generated on the device deterministically from the message (pack engine), so two users
-- who receive identical messages produce identical ids. The id is unique per user, not globally.
ALTER TABLE transactions DROP CONSTRAINT transactions_pkey;
ALTER TABLE transactions ADD PRIMARY KEY (user_id, id);
