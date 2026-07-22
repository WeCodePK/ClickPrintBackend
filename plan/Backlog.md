## Auth
- OTP endpoints bugs on rate limits.
- Send OTP endpoint needs to report proper status if the message was actually sent or not. Also needs to report proper error if the number is not on WhatsApp.
- All clients should treat 401/403 as a sign to logout. Go through all the places where the backend returns such responses and streamline them.
- JWTs tokens should be deprecated in favor of plain session tokens. No expiries, but a full management interface for sessions.
- Mint token endpoint should include user and shops like verify endpoint? depends on bot flow i suppose.

- ==Update responses of middleware in auth.js==
- Health check endpoint `/health` should report according to health of all sub-systems.
- ==There is currently NO endpoint to get list of all shops I own, only returned at login time from `/auth/otp/verify` as `data.shops`. What If I want updated list / refresh?==