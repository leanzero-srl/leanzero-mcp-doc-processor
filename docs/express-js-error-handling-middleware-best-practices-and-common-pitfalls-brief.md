# Express.js error-handling middleware — best practices and common pitfalls (brief)

## Summary
Express error-handling in Express works reliably when (1) errors are passed to Express via `next(err)` (or returned/rejected Promises in Express 5), (2) an error-handling middleware is registered *after* all route/middleware, and (3) you standardize error objects (e.g., `err.status`) so handlers can choose the right status code and response format.

## How Express catches errors
- **Synchronous errors** thrown inside route handlers/middleware are caught by Express automatically. (Express docs: “If synchronous code throws an error, then Express will catch and process it.”) 
- **Asynchronous errors** must be forwarded to Express via **`next(err)`**. (Express docs: “For errors returned from asynchronous functions… pass them to the next() function”.)
- **Promises in Express 5**: route handlers and middleware that return Promises will call `next(value)` automatically when they reject or throw. (Express docs: “Starting with Express 5… automatically when they reject or throw…”.)

## Error-handling middleware basics (shape + placement)
- An Express error-handling middleware must have the signature **`(err, req, res, next)`**—i.e., **4 arguments**. This is how Express/Connect differentiates it from normal middleware. (Express wiki migrating 2.x→3.x: Connect differentiates via `fn.length`; error middleware must have exactly 4 args.)
- The error handler should be **registered at the end of the middleware chain**, so earlier middleware/routes get first chance and errors can be passed down. (Express wiki example and description: define error middleware below all the others.)

### Example: centralized error handler (4-arg middleware)
```js
app.use(express.bodyParser())
app.use(express.cookieParser())
app.use(express.session())
app.use(app.router)
app.use(function(err, req, res, next){
  res.send(500, { error: 'Sorry something bad happened!' });
})
```
(Source: Express wiki migrating 2.x→3.x example.)

## Standardize errors for consistent responses
A common pattern is to attach a **status code** onto your Error instance and then use it in the error middleware.

### Example: JSON API pattern
```js
function error(status, msg) {
  var err = new Error(msg);
  err.status = status;
  return err;
}

app.use(function(err, req, res, next){
  res.status(err.status || 500);
  res.send({ error: err.message });
});
```
(Source: Express example web-service index.js.)

### Example: production-style error pages + status
- Set status to `err.status || 500`.
- Render an HTML error page in 500 handler.

(Source: Express examples/error-pages/index.js.)

## Common pitfalls
1. **Forgetting to forward async errors to Express**
   - If you run async code inside a route/middleware and do not call `next(err)` (or, in Express 5, rely on Promise rejection), Express won’t catch it in the same way. (Express docs: must pass async errors to `next()`.)

2. **Using the wrong middleware signature**
   - If your handler isn’t `(err, req, res, next)` (4 args), it won’t be treated as an error handler. (Express wiki migrating 2.x→3.x: Connect differentiates by `fn.length`.)

3. **Registering the error handler in the wrong order**
   - If the error handler isn’t below/after the routes and other middleware, errors may not reach it. (Express wiki: define below all the others so they can invoke `next(err)`.)

4. **Misusing `next()` values**
   - Express treats any argument passed to `next()` (except the string `'route'`) as an error and skips remaining non-error handlers. (Express docs: “If you pass anything to the next() function (except the string 'route'), Express regards the current request as being an error…”.)

5. **Not handling 404s separately (if desired)**
   - Express examples show a dedicated 404 middleware before the error handler, using `res.format` to return HTML/JSON/text depending on the request. (Source: examples/error-pages/index.js.)

## Middleware order note (Express 4 vs 3)
- In Express **4.x**, `app.router` was removed; middleware and routes execute in the order they are added. (Express wiki migrating 3.x→4.x: “Middleware and routes now execute in the order they are added.”)
- After removing `app.router`, ensure your error handler is still added after routes/middleware. (Same source, showing reordering.)

## Quick reference table
| Concern | Best practice (from sources) | Pitfall to avoid |
|---|---|---|
| Sync errors | Throwing inside handlers is caught automatically | Assuming you need `try/catch` for sync errors every time (not required per docs) |
| Async errors | Forward to Express with `next(err)` (or rely on Express 5 Promise behavior) | Forgetting `next(err)` inside async callbacks |
| Error handler definition | Use `(err, req, res, next)` (4 args) | Using 3-arg middleware shape |
| Placement | Register error middleware after routes/middleware | Registering too early |
| Status codes / response body | Attach `err.status` and use `err.status || 500` | Always returning 200/500 without regard to error type |

## Notes for your custom error taxonomy
- The evidence provided supports a **mechanism** (attach `err.status` and handle in one place) and the **routing/forwarding rules** (use `next(err)` for async, correct signature, correct placement). 
- It does **not** directly confirm a specific “ValidationError / AuthorizationError classes” architecture, so the safe takeaway is: if you create custom error types, ensure they are still forwarded to the error middleware and carry enough fields (like `status`) for consistent responses. (Based on the status-code pattern in Express examples.)