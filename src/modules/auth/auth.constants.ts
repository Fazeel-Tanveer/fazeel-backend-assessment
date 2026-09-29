export const INVALID_CREDENTIALS = 'Invalid credentials';
export const INVALID_REFRESH_TOKEN = 'Invalid refresh token';
export const TOKEN_TYPE = 'Bearer';
export const REFRESH_TOKEN_BYTES = 48;
export const REFRESH_TOKEN_MAX_LENGTH = 128;

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past the first 72 bytes
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_LETTER_PATTERN = /[A-Za-z]/;
export const PASSWORD_DIGIT_PATTERN = /\d/;

const ONE_MINUTE_MS = 60_000;
export const LOGIN_THROTTLE = { default: { limit: 5, ttl: ONE_MINUTE_MS } };
export const OTP_REQUEST_THROTTLE = {
  default: { limit: 3, ttl: ONE_MINUTE_MS },
};
export const OTP_VERIFY_THROTTLE = {
  default: { limit: 5, ttl: ONE_MINUTE_MS },
};

export const OTP_LENGTH = 6;
export const OTP_PATTERN = /^\d{6}$/;
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_SENT = 'If the account exists, a login code has been sent';
export const OTP_COOLDOWN = `Wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code`;
export const INVALID_OTP = 'Invalid or expired code';
