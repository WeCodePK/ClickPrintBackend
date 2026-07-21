
==Update the MODELSSS==

## Admins
- [x] The endpoint DO not exist. Only exist in Bruno
- [x] What to do about _id in admin? should endpoints use `adminId` or `userId`??
## Auth

- OTP endpoints bugs on rate limits.
- Send OTP endpoint needs to report proper status if the message was actually sent or not. Also needs to report proper error if the number is not on WhatsApp.
- All clients should treat 401/403 as a sign to logout. Go through all the places where the backend returns such responses and streamline them.
- JWTs tokens should be deprecated in favor of plain session tokens. No expiries, but a full management interface for sessions.
- Mint token endpoint should include user and shops like verify endpoint? depends on bot flow i suppose.

## Drafts
- [x] `PATCH /api/drafts/:draftId` now uses `PUT`
- [x] Draft endpoint should only accept type PDF files
- [x] Update Drafts Check/Submit to use new Services and Balance

## Files
- [x] remove `skipConversion`, add `convert`
- [x] make it mandatory
- [x] store type `raw` or `pdf` in collection, if pdf then must `numberOfPages`
- [x] change `originalName` to `name`
- [x] change `createdAt` to `uploadedAt`
- [x] downloads should be by original file name
- [ ] list the internal endpoints in Bruno

## History
- [x] change `/api/history/:shopId` to `/api/history/shops/:shopId`

## Jobs
- ==Add the handler for `/api/jobs/shops/:jobId`==
## ~~Owners~~
- [x] The endpoint DO not exist. Only exist in Bruno
- [x] What to do about _id in owners? should endpoints use `ownerId` or `userId`??

## Services
- [x] Needs the `shopId` update==
## Shops

- ==There is currently NO endpoint to get list of all shops I own, only returned at login time from `/auth/otp/verify` as `data.shops`. What If I want updated list / refresh?==

## Stats

- [x] All endpoints should return stats under `data.stats`==

## Misc

- Health check endpoint `/health` should report according to health of all sub-systems.
- ==Update responses of middleware in auth.js==
- [x] Delete models/Price.js
- ==`isOnline` virtual on shop==
- 