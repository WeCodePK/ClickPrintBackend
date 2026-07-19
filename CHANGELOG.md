# API Changelog

## 2026-07-19

- `POST /api/auth/otp`: POST body requires an `intent` field with values: `user`, `shop`, `admin`.

- `POST /api/auth/verify`: changes made in response body:
    - `data.profile` is now `data.user`
    - `shop` is gone. Now `shops` is returned with `{ _id, name }`

- `PATCH /api/drafts/:draftId` now uses `PUT`

- `GET /api/events` is now `/api/events/:shopId`

- `POST /api/files` now requires a `convert`: `true/false`
- `POST /api/files`: `originalName` is now `name`. `createdAt` is now `uploadedAt`

- `GET /api/files/:fileId` downloaded filename is the original filename, desktop app should still save it by id.

- `GET /api/history` is now `GET /api/history/shops/:shopId` for shops. Old endpoint still remains for users and admins.

- `GET /api/jobs` is now `GET /api/jobs/shops/:shopId` for shops. Old endpoint still remains for users and admins.

- Printers got the `shopId` update
- Services got the `shopId` update, colored is color in keys