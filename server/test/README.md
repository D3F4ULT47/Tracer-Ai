# Test execution

`npm test` runs every unit test and discovers live integration tests in a skipped state.
External services are never contacted unless `ENABLE_LIVE_TESTS=true` and the
service-specific credentials are both present.

Run the live integration suite explicitly with:

```sh
ENABLE_LIVE_TESTS=true npm run test:live -w @tracer-ai/server
```

Current live requirements:

- MongoDB: `MONGODB_TEST_URI`, whose database name must end with `_test`.
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
  `CLOUDINARY_API_SECRET`.

OpenAI, YouTube, Redis, and future external-provider tests must use
`createLiveTestGate` before performing network or service initialization.

The manual authentication runtime verifier uses the same `ENABLE_LIVE_TESTS`
switch for its optional Cloudinary check.
