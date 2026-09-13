- [ ] Update and finalise the models
- [ ] Update every endpoint to use mongoose validators; finalise.
- [ ] Full white and black testing of all endpoints with every user type

- [ ] Add the handler for `/api/jobs/shops/:jobId`

- [ ] Honor isOnline system-wide; Shops, Printers, Services
- [ ] Honor isDisabled system-wide; Users, Shops, Printers, Services

roll referntial integrity into models??






GET /api/drafts gets split into:
- GET /api/drafts for admins
- GET /api/drafts/user/:userId for users

GET /api/events/:shopId gets split into:
- GET /api/events/shop/:shopId for shops
- GET /api/events/user/:userId for users

GET /api/history gets split into:
- GET /api/history for admins
- GET /api/history/user/:userId for users
- GET /api/history/shop/:shopId for shops

GET /api/jobs get split into:
- GET /api/jobs
- GET /api/jobs/user/:userId
- GET /api/jobs/shop/:shopId



- pin
- remove balance check / balance minus
- add wallet to shops
- add ability to attach payment proof + additional comments
- expose gotenberg settings in file upload
- add scale and margin settings
- queue time estimation
- db endpoint to accept registration form
- db enpoint to accept contact form + add to app
- if shop is misconfigured, mark as unhealthy
- push job updates to sse
- 