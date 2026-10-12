-- M3/M4 (security review): the device id is the credential, so only its SHA-256 is stored; a device row can be
-- revoked, and the API checks the row on every request. Existing rows are hashed in place.
ALTER TABLE devices ADD COLUMN revoked_at timestamptz;
UPDATE devices SET device_id = encode(sha256(convert_to(device_id, 'UTF8')), 'hex') WHERE device_id !~ '^[0-9a-f]{64}$';
