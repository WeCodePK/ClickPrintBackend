- `GET /api/events` is now `/api/events/:shopId`

- `POST /api/files` now requires a `convert`: `true/false`
- `POST /api/files`: `originalName` is now `name`. `createdAt` is now `uploadedAt`

- `GET /api/files/:fileId` downloaded filename is the original filename, desktop app should still save it by id.

- `GET /api/history` is now `GET /api/history/shops/:shopId` for shops. Old endpoint still remains for users and admins.

- `GET /api/jobs` is now `GET /api/jobs/shops/:shopId` for shops. Old endpoint still remains for users and admins.

- Printers got the `shopId` update
- Services got the `shopId` update, colored is color in keys



## 20-07-2026

- Leave all the validations up to the backend. Especially for user.name. Validations can be centeralised across the multiple frontends.
-